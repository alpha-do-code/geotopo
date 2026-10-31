"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Encart } from "@/components/choix";
import { useSession } from "@/components/session";
import { db, ORG_LOCALE } from "@/lib/db";
import { ROLES, type Role } from "@/lib/referentiels";
import { supabase } from "@/lib/supabase";

// Messages d'erreur courts, sans détail technique pour l'utilisateur
function messageErreur(e: { message?: string } | null): string {
  const m = e?.message ?? "";
  if (/invalid login/i.test(m)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(m)) return "Confirme ton adresse avec le lien reçu par e-mail.";
  if (/code d'invitation/i.test(m)) return "Code d'invitation inconnu.";
  if (/rate limit|too many/i.test(m)) return "Trop de tentatives. Réessaie dans quelques minutes.";
  if (/fetch|network/i.test(m)) return "Pas de connexion. Réessaie une fois en ligne.";
  return "L'opération a échoué. Réessaie.";
}

export default function Compte() {
  const s = useSession();
  if (!s.pret) return <p className="p-8 text-encre-2">Chargement…</p>;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:py-8">
      <h1 className="text-2xl font-bold md:text-3xl">Compte et équipe</h1>
      {!s.configure ? (
        <Encart ton="info" titre="Mode local">
          La synchronisation n&apos;est pas configurée sur ce déploiement. Les données restent sur cet appareil.
        </Encart>
      ) : !s.user ? (
        <Connexion />
      ) : (
        <Equipe />
      )}
    </main>
  );
}

function Connexion() {
  const [mode, setMode] = useState<"connexion" | "inscription">("connexion");
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [etat, setEtat] = useState<{ ton: "erreur" | "ok"; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setEnvoi(true);
    setEtat(null);
    if (mode === "connexion") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: mdp });
      if (error) setEtat({ ton: "erreur", texte: messageErreur(error) });
      else window.location.reload();
    } else {
      const { error } = await supabase.auth.signUp({ email, password: mdp, options: { emailRedirectTo: `${window.location.origin}/compte/` } });
      if (error) setEtat({ ton: "erreur", texte: /password/i.test(error.message) ? "Mot de passe trop faible (10 caractères minimum)." : messageErreur(error) });
      else setEtat({ ton: "ok", texte: "Compte créé. Ouvre le lien reçu par e-mail pour confirmer ton adresse, puis connecte-toi." });
    }
    setEnvoi(false);
  }

  return (
    <form onSubmit={soumettre} className="carte flex flex-col gap-4 p-5 md:p-6">
      <h2 className="text-lg font-semibold">{mode === "connexion" ? "Connexion" : "Créer un compte"}</h2>
      <p className="text-sm text-encre-2">Le compte sert à partager les chantiers avec ton équipe. Une fois connecté, l&apos;application marche aussi hors ligne.</p>
      <label className="etiquette">E-mail
        <input type="email" autoComplete="email" required className="champ font-normal" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="etiquette">Mot de passe
        <input
          type="password"
          autoComplete={mode === "connexion" ? "current-password" : "new-password"}
          required
          minLength={mode === "inscription" ? 10 : undefined}
          className="champ font-normal"
          value={mdp}
          onChange={(e) => setMdp(e.target.value)}
        />
      </label>
      {etat && <Encart ton={etat.ton} titre={etat.texte} />}
      <button type="submit" disabled={envoi} className="bouton-principal">{mode === "connexion" ? "Se connecter" : "Créer le compte"}</button>
      <button type="button" className="text-sm text-accent underline" onClick={() => { setMode(mode === "connexion" ? "inscription" : "connexion"); setEtat(null); }}>
        {mode === "connexion" ? "Pas encore de compte ? En créer un" : "Déjà un compte ? Se connecter"}
      </button>
    </form>
  );
}

type Membre = { user_id: string; role: Role; nom_affiche: string };

function Equipe() {
  const { user, org, orgs, choisirOrg, rechargerOrgs, deconnexion, enAttente, enLigne } = useSession();
  const [nomOrg, setNomOrg] = useState("");
  const [code, setCode] = useState("");
  const [nomAffiche, setNomAffiche] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [membres, setMembres] = useState<Membre[]>([]);
  const locaux = useLiveQuery(() => db.chantiers.where("org_id").equals(ORG_LOCALE).count(), [], 0);

  useEffect(() => {
    if (!supabase || !org || !enLigne) return;
    supabase.from("membres").select("user_id, role, nom_affiche").eq("org_id", org.id).then(({ data }) => setMembres((data ?? []) as Membre[]));
  }, [org, enLigne]);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const { data, error } = await supabase!.rpc("creer_organisation", { p_nom: nomOrg, p_nom_affiche: nomAffiche });
    if (error) return setErreur(messageErreur(error));
    await rechargerOrgs();
    await choisirOrg(data as string);
  }

  async function rejoindre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const { data, error } = await supabase!.rpc("rejoindre_organisation", { p_code: code, p_nom_affiche: nomAffiche });
    if (error) return setErreur(messageErreur(error));
    await rechargerOrgs();
    await choisirOrg(data as string);
  }

  async function changerRole(uid: string, role: Role) {
    const { error } = await supabase!.rpc("changer_role", { p_org: org!.id, p_user: uid, p_role: role });
    if (error) return setErreur(messageErreur(error));
    setMembres((l) => l.map((m) => (m.user_id === uid ? { ...m, role } : m)));
  }

  async function seDeconnecter() {
    if (enAttente && !confirm(`${enAttente} modification(s) ne sont pas encore envoyées et seront perdues. Se déconnecter quand même ?`)) return;
    await deconnexion();
  }

  return (
    <>
      <section className="carte flex flex-col gap-3 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-encre-2">Connecté</div>
            <div className="font-semibold">{user?.email}</div>
          </div>
          <button type="button" onClick={seDeconnecter} className="bouton-secondaire">Se déconnecter</button>
        </div>
        <p className="text-[13px] text-encre-2">La déconnexion efface les données de cet appareil (elles restent sur le serveur une fois envoyées).</p>
      </section>

      {orgs.length > 1 && (
        <label className="etiquette">Organisation active
          <select className="champ font-normal" value={org?.id ?? ""} onChange={(e) => choisirOrg(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </label>
      )}

      {org ? (
        <section className="carte flex flex-col gap-4 p-5 md:p-6">
          <h2 className="text-lg font-semibold">{org.nom}</h2>
          <p className="text-sm">Ton rôle : <strong>{ROLES[org.role]}</strong></p>
          <div className="rounded-md bg-surface-2 p-3.5">
            <div className="text-[13px] text-encre-2">Code d&apos;invitation à donner à ton équipe</div>
            <div className="font-mono text-xl font-semibold tracking-wider">{org.code_invitation}</div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Membres</h3>
            {!enLigne && <p className="text-sm text-encre-2">Liste disponible une fois en ligne.</p>}
            <ul className="divide-y divide-bord rounded-md border border-bord">
              {membres.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <span>{m.nom_affiche || "Sans nom"}{m.user_id === user?.id && " (toi)"}</span>
                  {org.role === "chef" && m.user_id !== user?.id ? (
                    <select aria-label={`Rôle de ${m.nom_affiche || "ce membre"}`} className="champ w-auto font-normal" value={m.role} onChange={(e) => changerRole(m.user_id, e.target.value as Role)}>
                      {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  ) : (
                    <span className="text-encre-2">{ROLES[m.role]}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section className="carte flex flex-col gap-5 p-5 md:p-6">
          <h2 className="text-lg font-semibold">Rejoindre ou créer une organisation</h2>
          {locaux > 0 && <Encart ton="info" titre={`${locaux} chantier(s) saisi(s) sur cet appareil rejoindront l'organisation choisie.`} />}
          <label className="etiquette">Ton nom, tel que l&apos;équipe le verra
            <input className="champ font-normal" value={nomAffiche} maxLength={120} onChange={(e) => setNomAffiche(e.target.value)} />
          </label>
          <form onSubmit={rejoindre} className="flex flex-col gap-2">
            <label className="etiquette">Code d&apos;invitation
              <input className="champ font-mono font-normal" value={code} required onChange={(e) => setCode(e.target.value)} />
            </label>
            <button type="submit" className="bouton-principal">Rejoindre</button>
          </form>
          <div className="border-t border-bord pt-4">
            <form onSubmit={creer} className="flex flex-col gap-2">
              <label className="etiquette">Nom du bureau d&apos;études ou de l&apos;équipe
                <input className="champ font-normal" value={nomOrg} required minLength={2} maxLength={120} onChange={(e) => setNomOrg(e.target.value)} />
              </label>
              <button type="submit" className="bouton-secondaire">Créer l&apos;organisation (tu en seras chef de mission)</button>
            </form>
          </div>
          {erreur && <Encart ton="erreur" titre={erreur} />}
        </section>
      )}
    </>
  );
}
