"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ErreurApi, renouveler, transport, type Organisation, type Utilisateur } from "@/lib/api";
import { ecrireMeta, lireMeta, ORG_LOCALE, rattacherDonneesLocales, viderBaseLocale } from "@/lib/db";
import { nombreEnAttente, synchroniser } from "@/lib/sync";

export type { Organisation };

type EtatSync = { enCours: boolean; derniere: string | null; erreur: string | null };

type Session = {
  pret: boolean;
  // Erreur survenue au démarrage, affichée pour pouvoir la signaler
  erreurDemarrage: string | null;
  user: Utilisateur | null;
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
  connexion: (identifiant: string, motDePasse: string) => Promise<void>;
  inscription: (telephone: string, motDePasse: string, nomAffiche: string, email: string) => Promise<void>;
  // Après un mot de passe provisoire : le nouveau remplace l'ancien, puis la session est rafraîchie
  changerMotDePasse: (actuel: string, nouveau: string) => Promise<void>;
  // Mot de passe provisoire tapé à la connexion, gardé en mémoire pour ne pas le redemander
  mdpProvisoire: string | null;
  deconnexion: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession hors de SessionProvider");
  return s;
}

const texteErreur = (e: unknown) => (e instanceof Error ? `${e.name} : ${e.message}` : String(e));

const cleOrgs = (uid: string) => `orgs:${uid}`;
const lireJson = async <T,>(cle: string): Promise<T | null> => {
  const v = await lireMeta(cle);
  return v ? (JSON.parse(v) as T) : null;
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [pret, setPret] = useState(false);
  const [erreurDemarrage, setErreurDemarrage] = useState<string | null>(null);
  const [user, setUser] = useState<Utilisateur | null>(null);
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
    const u = await lireJson<Utilisateur>("utilisateur");
    if (!u) return [];
    try {
      const liste = await api.organisations();
      await ecrireMeta(cleOrgs(u.id), JSON.stringify(liste));
      setOrgs(liste);
      return liste;
    } catch {
      const l = (await lireJson<Organisation[]>(cleOrgs(u.id))) ?? [];
      setOrgs(l);
      return l;
    }
  }, []);

  const choisirOrg = useCallback(async (id: string) => {
    await rattacherDonneesLocales(id);
    await ecrireMeta("org_active", id);
    setOrgActiveId(id);
  }, []);

  const ouvrir = useCallback(
    async (u: Utilisateur) => {
      setUser(u);
      const liste = await rechargerOrgs();
      const active = await lireMeta("org_active");
      const id = active && liste.some((o) => o.id === active) ? active : (liste[0]?.id ?? null);
      // Les saisies faites hors compte sur cet appareil rejoignent l'organisation active,
      // sinon elles resteraient invisibles et « à envoyer » pour toujours
      if (id) await choisirOrg(id);
      else setOrgActiveId(null);
    },
    [rechargerOrgs, choisirOrg],
  );

  // Démarrage : session sur le serveur si le réseau le permet, sinon celle gardée sur l'appareil.
  // Quoi qu'il arrive (réseau pendant, base locale illisible, erreur imprévue), l'écran de chargement
  // finit par laisser la place : l'erreur est gardée pour être affichée et comprise.
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        setEnLigne(navigator.onLine);
        let garde: Utilisateur | null = null;
        try {
          garde = await lireJson<Utilisateur>("utilisateur");
        } catch (e) {
          setErreurDemarrage(`Base locale : ${texteErreur(e)}`);
        }
        let u: Utilisateur | null = garde;
        try {
          u = await renouveler(8_000);
          await ecrireMeta("utilisateur", u ? JSON.stringify(u) : null).catch(() => undefined);
        } catch {
          // Hors ligne ou réseau trop lent : on garde l'utilisateur connu de l'appareil, la synchro reprendra
        }
        if (annule) return;
        if (u?.doitChangerMotDePasse) setUser(u);
        else if (u) await ouvrir(u);
      } catch (e) {
        if (!annule) setErreurDemarrage(texteErreur(e));
      } finally {
        if (!annule) setPret(true);
      }
    })();
    const enLigneOn = () => setEnLigne(true);
    const enLigneOff = () => setEnLigne(false);
    window.addEventListener("online", enLigneOn);
    window.addEventListener("offline", enLigneOff);
    return () => {
      annule = true;
      window.removeEventListener("online", enLigneOn);
      window.removeEventListener("offline", enLigneOff);
    };
  }, [ouvrir]);

  const [mdpProvisoire, setMdpProvisoire] = useState<string | null>(null);

  const entrer = useCallback(
    async (u: Utilisateur) => {
      // Un autre compte sur cet appareil : on ne mélange pas ses données
      const precedent = await lireJson<Utilisateur>("utilisateur");
      if (precedent && precedent.id !== u.id) await viderBaseLocale();
      await ecrireMeta("utilisateur", JSON.stringify(u));
      if (u.doitChangerMotDePasse) setUser(u); // rien d'autre n'est permis avant le nouveau mot de passe
      else await ouvrir(u);
    },
    [ouvrir],
  );

  const connexion = useCallback(
    async (identifiant: string, motDePasse: string) => {
      const u = await api.connexion(identifiant, motDePasse);
      setMdpProvisoire(u.doitChangerMotDePasse ? motDePasse : null);
      await entrer(u);
    },
    [entrer],
  );

  const inscription = useCallback(
    async (telephone: string, motDePasse: string, nomAffiche: string, email: string) => entrer(await api.inscription(telephone, motDePasse, nomAffiche, email)),
    [entrer],
  );

  const changerMotDePasse = useCallback(
    async (actuel: string, nouveau: string) => {
      await api.changerMotDePasse(actuel, nouveau);
      setMdpProvisoire(null);
      const u = await renouveler();
      if (u) await entrer(u);
    },
    [entrer],
  );

  const synchroniserMaintenant = useCallback(async () => {
    if (!user || !org || syncEnCours.current || !navigator.onLine) return;
    syncEnCours.current = true;
    setSync((s) => ({ ...s, enCours: true }));
    try {
      const bilan = await synchroniser(transport, org.id);
      const refus = bilan.rejetees.length ? `${bilan.rejetees.length} modification(s) refusée(s) par le serveur : ${bilan.rejetees[0].motif}` : null;
      setSync({ enCours: false, derniere: new Date().toISOString(), erreur: refus });
    } catch (e) {
      if (e instanceof ErreurApi && e.status === 401) {
        setUser(null);
        await ecrireMeta("utilisateur", null);
      }
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
    await api.deconnexion().catch(() => undefined);
    // Appareil partagé : on efface les données de l'organisation sur cet appareil
    await viderBaseLocale();
    setUser(null);
    setOrgs([]);
    setOrgActiveId(null);
  }, []);

  const valeur = useMemo<Session>(
    () => ({
      pret,
      erreurDemarrage,
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
      connexion,
      inscription,
      changerMotDePasse,
      mdpProvisoire,
      deconnexion,
    }),
    [pret, erreurDemarrage, user, orgs, org, orgId, enLigne, enAttente, sync, synchroniserMaintenant, choisirOrg, rechargerOrgs, connexion, inscription, changerMotDePasse, mdpProvisoire, deconnexion],
  );

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}
