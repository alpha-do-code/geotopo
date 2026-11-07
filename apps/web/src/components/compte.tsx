"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Encart } from "@/components/choix";
import { useSession } from "@/components/session";
import { api, ErreurApi, type Membre } from "@/lib/api";
import { db, ORG_LOCALE } from "@/lib/db";
import { ROLES, type Role } from "@geotopo/metier";
import { Liste, optionsDe } from "@/components/liste";

// Formulaires du compte, utilisés par la page Compte et par l'écran d'accueil (portail.tsx)

const messageErreur = (e: unknown) => (e instanceof ErreurApi ? e.message : "L'opération a échoué. Réessaie.");

type Mode = "connexion" | "inscription" | "oubli" | "reinitialiser";

export function Connexion() {
  const { connexion } = useSession();
  // Lien reçu par e-mail : /compte/?reinitialiser=… (ce composant n'existe que côté navigateur)
  const lienReinit = () => new URLSearchParams(window.location.search).get("reinitialiser");
  const [mode, setMode] = useState<Mode>(() => (lienReinit() ? "reinitialiser" : "connexion"));
  const [jeton] = useState(() => lienReinit() ?? "");
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [nom, setNom] = useState("");
  const [etat, setEtat] = useState<{ ton: "erreur" | "ok"; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Lien de confirmation : /compte/?confirmer=… ; le jeton est retiré de l'adresse dès la lecture
  useEffect(() => {
    const confirmer = new URLSearchParams(window.location.search).get("confirmer");
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
    if (!confirmer) return;
    api.confirmer(confirmer).then(
      (r) => setEtat({ ton: "ok", texte: r.message }),
      (e) => setEtat({ ton: "erreur", texte: messageErreur(e) }),
    );
  }, []);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setEtat(null);
    try {
      if (mode === "connexion") await connexion(email, mdp);
      else if (mode === "inscription") setEtat({ ton: "ok", texte: (await api.inscription(email, mdp, nom)).message });
      else if (mode === "oubli") setEtat({ ton: "ok", texte: (await api.oubli(email)).message });
      else {
        setEtat({ ton: "ok", texte: (await api.reinitialiser(jeton, mdp)).message });
        setMode("connexion");
        setMdp("");
      }
    } catch (err) {
      setEtat({ ton: "erreur", texte: messageErreur(err) });
    }
    setEnvoi(false);
  }

  const changer = (m: Mode) => {
    setMode(m);
    setEtat(null);
  };
  const titres: Record<Mode, [string, string]> = {
    connexion: ["Connexion", "Se connecter"],
    inscription: ["Créer un compte", "Créer le compte"],
    oubli: ["Mot de passe oublié", "Recevoir un lien"],
    reinitialiser: ["Nouveau mot de passe", "Enregistrer"],
  };

  return (
    <form onSubmit={soumettre} className="carte flex flex-col gap-4 p-5 md:p-6">
      <h2 className="text-lg font-semibold">{titres[mode][0]}</h2>
      {mode === "connexion" && (
        <p className="text-sm text-encre-2">Le compte sert à partager les chantiers avec ton équipe. Une fois connecté, l&apos;application marche aussi hors ligne.</p>
      )}
      {mode === "inscription" && (
        <label className="etiquette">Ton nom, tel que l&apos;équipe le verra
          <input autoComplete="name" required maxLength={120} className="champ font-normal" value={nom} onChange={(e) => setNom(e.target.value)} />
        </label>
      )}
      {mode !== "reinitialiser" && (
        <label className="etiquette">E-mail
          <input type="email" autoComplete="email" required className="champ font-normal" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      )}
      {mode !== "oubli" && (
        <label className="etiquette">Mot de passe
          <input
            type="password"
            autoComplete={mode === "connexion" ? "current-password" : "new-password"}
            required
            minLength={mode === "connexion" ? undefined : 10}
            className="champ font-normal"
            value={mdp}
            onChange={(e) => setMdp(e.target.value)}
          />
        </label>
      )}
      {etat && <Encart ton={etat.ton} titre={etat.texte} />}
      <button type="submit" disabled={envoi} className="bouton-principal">{titres[mode][1]}</button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        {mode === "connexion" ? (
          <>
            <button type="button" className="text-accent underline" onClick={() => changer("inscription")}>Pas encore de compte ? En créer un</button>
            <button type="button" className="text-accent underline" onClick={() => changer("oubli")}>Mot de passe oublié</button>
          </>
        ) : (
          <button type="button" className="text-accent underline" onClick={() => changer("connexion")}>Retour à la connexion</button>
        )}
      </div>
    </form>
  );
}

export function Equipe() {
  const { user, org, orgs, choisirOrg, rechargerOrgs, deconnexion, enAttente, enLigne } = useSession();
  const [nomOrg, setNomOrg] = useState("");
  const [code, setCode] = useState("");
  const [nomAffiche, setNomAffiche] = useState(user?.nomAffiche ?? ""); // déjà donné à l'inscription
  const [erreur, setErreur] = useState<string | null>(null);
  const [membres, setMembres] = useState<Membre[]>([]);
  const locaux = useLiveQuery(() => db.chantiers.where("org_id").equals(ORG_LOCALE).count(), [], 0);

  useEffect(() => {
    if (!org || !enLigne) return;
    api.membres(org.id).then(setMembres, () => setMembres([]));
  }, [org, enLigne]);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    try {
      const o = await api.creerOrganisation(nomOrg, nomAffiche);
      await rechargerOrgs();
      await choisirOrg(o.id);
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function rejoindre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    try {
      const o = await api.rejoindre(code, nomAffiche);
      await rechargerOrgs();
      await choisirOrg(o.id);
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function changerRole(uid: string, role: Role) {
    try {
      await api.changerRole(org!.id, uid, role);
    } catch (err) {
      return setErreur(messageErreur(err));
    }
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
            <div className="font-semibold break-all">{user?.email}</div>
          </div>
          <button type="button" onClick={seDeconnecter} className="bouton-secondaire">Se déconnecter</button>
        </div>
        <p className="text-[13px] text-encre-2">La déconnexion efface les données de cet appareil (elles restent sur le serveur une fois envoyées).</p>
      </section>

      {orgs.length > 1 && (
        <Liste label="Organisation active" valeur={org?.id ?? ""} options={orgs.map((o) => ({ valeur: o.id, label: o.nom, detail: ROLES[o.role] }))} onChange={choisirOrg} />
      )}

      {org ? (
        <section className="carte flex flex-col gap-4 p-5 md:p-6">
          <h2 className="text-lg font-semibold">{org.nom}</h2>
          <p className="text-sm">Ton rôle : <strong>{ROLES[org.role]}</strong></p>
          {org.code_invitation && (
            <div className="rounded-md bg-surface-2 p-3.5">
              <div className="text-[13px] text-encre-2">Code d&apos;invitation à donner à ton équipe</div>
              <div className="font-mono text-xl font-semibold tracking-wider">{org.code_invitation}</div>
            </div>
          )}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Membres</h3>
            {!enLigne && <p className="text-sm text-encre-2">Liste disponible une fois en ligne.</p>}
            <ul className="divide-y divide-bord rounded-md border border-bord">
              {membres.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <span>
                    {m.nom_affiche || "Sans nom"}{m.user_id === user?.id && " (toi)"}
                    <span className="block text-[13px] text-encre-2">{m.email}</span>
                  </span>
                  {org.role === "chef" && m.user_id !== user?.id ? (
                    <Liste
                      ariaLabel={`Rôle de ${m.nom_affiche || "ce membre"}`}
                      className="w-full sm:w-52"
                      valeur={m.role}
                      options={optionsDe(ROLES)}
                      onChange={(role) => changerRole(m.user_id, role)}
                    />
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
        </section>
      )}
      {erreur && <Encart ton="erreur" titre={erreur} />}
    </>
  );
}
