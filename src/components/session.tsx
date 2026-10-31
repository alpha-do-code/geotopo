"use client";

import type { User } from "@supabase/supabase-js";
import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { db, ecrireMeta, lireMeta, ORG_LOCALE, rattacherDonneesLocales } from "@/lib/db";
import type { Role } from "@/lib/referentiels";
import { supabase } from "@/lib/supabase";
import { nombreEnAttente, synchroniser } from "@/lib/sync";

export type Organisation = { id: string; nom: string; code_invitation: string; role: Role };

type EtatSync = { enCours: boolean; derniere: string | null; erreur: string | null };

type Session = {
  pret: boolean;
  configure: boolean; // Supabase configuré pour ce déploiement
  user: User | null;
  orgs: Organisation[];
  org: Organisation | null;
  orgId: string; // organisation active, ou ORG_LOCALE hors compte
  enLigne: boolean;
  enAttente: number;
  sync: EtatSync;
  peutValider: boolean;
  synchroniserMaintenant: () => Promise<void>;
  choisirOrg: (id: string) => Promise<void>;
  rechargerOrgs: () => Promise<Organisation[]>;
  deconnexion: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession hors de SessionProvider");
  return s;
}

const cleOrgs = (uid: string) => `orgs:${uid}`;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [pret, setPret] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [orgActiveId, setOrgActiveId] = useState<string | null>(null);
  const [enLigne, setEnLigne] = useState(true);
  const [sync, setSync] = useState<EtatSync>({ enCours: false, derniere: null, erreur: null });
  const enAttente = useLiveQuery(() => nombreEnAttente(), [], 0);
  const syncEnCours = useRef(false);

  const org = orgs.find((o) => o.id === orgActiveId) ?? null;
  const orgId = user && org ? org.id : ORG_LOCALE;

  // Les organisations de l'utilisateur, mises en cache pour le hors-ligne
  const rechargerOrgs = useCallback(async (): Promise<Organisation[]> => {
    if (!supabase) return [];
    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user.id;
    if (!uid) return [];
    const { data, error } = await supabase
      .from("membres")
      .select("role, organisations(id, nom, code_invitation)")
      .eq("user_id", uid);
    if (error) {
      const cache = await lireMeta(cleOrgs(uid));
      const l = cache ? (JSON.parse(cache) as Organisation[]) : [];
      setOrgs(l);
      return l;
    }
    type LigneMembre = { role: Role; organisations: { id: string; nom: string; code_invitation: string } | null };
    const liste = ((data ?? []) as unknown as LigneMembre[])
      .filter((m) => m.organisations)
      .map((m) => ({ ...m.organisations!, role: m.role }));
    await ecrireMeta(cleOrgs(uid), JSON.stringify(liste));
    setOrgs(liste);
    return liste;
  }, []);

  const choisirOrg = useCallback(async (id: string) => {
    await rattacherDonneesLocales(id);
    await ecrireMeta("org_active", id);
    setOrgActiveId(id);
  }, []);

  // Démarrage : session gardée sur l'appareil, puis organisations (en ligne ou depuis le cache)
  useEffect(() => {
    let annule = false;
    (async () => {
      setEnLigne(navigator.onLine);
      const active = await lireMeta("org_active");
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        const u = data.session?.user ?? null;
        if (!annule) setUser(u);
        if (u) {
          const cache = await lireMeta(cleOrgs(u.id));
          if (cache && !annule) setOrgs(JSON.parse(cache));
          const liste = await rechargerOrgs();
          if (!annule) setOrgActiveId(active && liste.some((o) => o.id === active) ? active : (liste[0]?.id ?? active));
        }
      }
      if (!annule) setPret(true);
    })();
    const sub = supabase?.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    const enLigneOn = () => setEnLigne(true);
    const enLigneOff = () => setEnLigne(false);
    window.addEventListener("online", enLigneOn);
    window.addEventListener("offline", enLigneOff);
    return () => {
      annule = true;
      sub?.data.subscription.unsubscribe();
      window.removeEventListener("online", enLigneOn);
      window.removeEventListener("offline", enLigneOff);
    };
  }, [rechargerOrgs]);

  const synchroniserMaintenant = useCallback(async () => {
    if (!supabase || !user || !org || syncEnCours.current || !navigator.onLine) return;
    syncEnCours.current = true;
    setSync((s) => ({ ...s, enCours: true }));
    try {
      await synchroniser(supabase, org.id);
      setSync({ enCours: false, derniere: new Date().toISOString(), erreur: null });
    } catch (e) {
      setSync((s) => ({ ...s, enCours: false, erreur: e instanceof Error ? e.message : String(e) }));
    } finally {
      syncEnCours.current = false;
    }
  }, [user, org]);

  // Synchronisation : au retour du réseau, toutes les minutes, et peu après chaque saisie
  useEffect(() => {
    if (!enLigne) return;
    synchroniserMaintenant();
    const t = setInterval(synchroniserMaintenant, 60_000);
    return () => clearInterval(t);
  }, [enLigne, synchroniserMaintenant]);
  useEffect(() => {
    if (!enAttente) return;
    const t = setTimeout(synchroniserMaintenant, 2_000);
    return () => clearTimeout(t);
  }, [enAttente, synchroniserMaintenant]);

  const deconnexion = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // Appareil partagé : on efface les données de l'organisation sur cet appareil
    await db.transaction("rw", db.chantiers, db.points, db.meta, async () => {
      await db.chantiers.clear();
      await db.points.clear();
      await db.meta.clear();
    });
    setOrgs([]);
    setOrgActiveId(null);
  }, []);

  const valeur = useMemo<Session>(
    () => ({
      pret,
      configure: !!supabase,
      user,
      orgs,
      org,
      orgId,
      enLigne,
      enAttente,
      sync,
      // Hors compte (mode local), l'utilisateur est seul : il peut valider
      peutValider: !user ? true : org?.role === "chef" || org?.role === "controleur",
      synchroniserMaintenant,
      choisirOrg,
      rechargerOrgs,
      deconnexion,
    }),
    [pret, user, orgs, org, orgId, enLigne, enAttente, sync, synchroniserMaintenant, choisirOrg, rechargerOrgs, deconnexion],
  );

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}
