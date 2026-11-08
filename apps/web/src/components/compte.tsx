"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Encart } from "@/components/choix";
import { useSession } from "@/components/session";
import { api, ErreurApi, type Membre } from "@/lib/api";
import { db, ORG_LOCALE } from "@/lib/db";
import { formaterTelephone, normaliserTelephone, ROLES, type Role } from "@geotopo/metier";
import { Liste, optionsDe } from "@/components/liste";

// Formulaires du compte, utilisés par la page Compte et par l'écran d'accueil (portail.tsx)

const messageErreur = (e: unknown) => (e instanceof ErreurApi ? e.message : "L'opération a échoué. Réessaie.");

type Mode = "connexion" | "inscription" | "oubli" | "reinitialiser";

// Paramètres d'adresse lus une fois puis retirés (liens reçus par e-mail), sans toucher aux autres
export function retirerParametres(...noms: string[]) {
  const url = new URL(window.location.href);
  noms.forEach((n) => url.searchParams.delete(n));
  window.history.replaceState(null, "", url.pathname + url.search);
}

// Code d'équipe reçu par un lien d'invitation (/?invitation=…), gardé jusqu'à ce qu'on rejoigne
const CLE_INVITATION = "geotopo-invitation";
export const lireInvitation = () => {
  try {
    return localStorage.getItem(CLE_INVITATION);
  } catch {
    return null;
  }
};
export const garderInvitation = (code: string | null) => {
  try {
    if (code) localStorage.setItem(CLE_INVITATION, code);
    else localStorage.removeItem(CLE_INVITATION);
  } catch {}
};

function ChampMotDePasse({ label, valeur, onChange, nouveau = false, aide }: { label: string; valeur: string; onChange: (v: string) => void; nouveau?: boolean; aide?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="etiquette">
      {label}
      <span className="relative block">
        <input
          type={visible ? "text" : "password"}
          autoComplete={nouveau ? "new-password" : "current-password"}
          required
          minLength={nouveau ? 8 : undefined}
          className="champ pr-20 font-normal"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 px-3 text-sm font-semibold text-accent"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        >
          {visible ? "Masquer" : "Afficher"}
        </button>
      </span>
      {aide && <span className="text-[13px] font-normal text-encre-2">{aide}</span>}
    </label>
  );
}

function ChampTelephone({ label = "Numéro de téléphone", valeur, onChange }: { label?: string; valeur: string; onChange: (v: string) => void }) {
  return (
    <label className="etiquette">
      {label}
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        placeholder="77 123 45 67"
        className="champ font-normal tabular-nums"
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-[13px] font-normal text-encre-2">Sans indicatif : numéro du Sénégal. Ailleurs, commence par +225, +212…</span>
    </label>
  );
}

// Vérifié aussi sur l'appareil : l'erreur s'affiche sans attendre le réseau
const numeroValide = (s: string) => s.includes("@") || normaliserTelephone(s) !== null;

export function Connexion() {
  const { connexion, inscription } = useSession();
  // Lien reçu par e-mail : /compte/?reinitialiser=… (ce composant n'existe que côté navigateur)
  const lienReinit = () => new URLSearchParams(window.location.search).get("reinitialiser");
  const [mode, setMode] = useState<Mode>(() => (lienReinit() ? "reinitialiser" : lireInvitation() ? "inscription" : "connexion"));
  const [jeton] = useState(() => lienReinit() ?? "");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [nom, setNom] = useState("");
  const [etat, setEtat] = useState<{ ton: "erreur" | "ok"; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [invite] = useState(() => lireInvitation() !== null);

  useEffect(() => {
    if (lienReinit()) retirerParametres("reinitialiser");
  }, []);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEtat(null);
    if ((mode === "connexion" || mode === "inscription") && !numeroValide(telephone)) {
      return setEtat({ ton: "erreur", texte: "Numéro de téléphone invalide. Exemple : 77 123 45 67." });
    }
    setEnvoi(true);
    try {
      if (mode === "connexion") await connexion(telephone, mdp);
      else if (mode === "inscription") await inscription(telephone, mdp, nom, email);
      else if (mode === "oubli") setEtat({ ton: "ok", texte: (await api.oubli(telephone)).message });
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

  if (mode === "connexion")
    return (
      <form onSubmit={soumettre} className="carte flex flex-col gap-4 p-5 md:p-6">
        <h2 className="text-lg font-semibold">Connexion</h2>
        <ChampTelephone valeur={telephone} onChange={setTelephone} />
        <ChampMotDePasse label="Mot de passe" valeur={mdp} onChange={setMdp} />
        {etat && <Encart ton={etat.ton} titre={etat.texte} />}
        <button type="submit" disabled={envoi} className="bouton-principal">{envoi ? "Connexion…" : "Se connecter"}</button>
        <button type="button" className="self-start text-sm text-accent underline" onClick={() => changer("oubli")}>Mot de passe oublié ?</button>
        <div className="flex flex-col gap-2 border-t border-bord pt-4">
          <p className="text-center text-sm text-encre-2">Pas encore de compte ?</p>
          <button type="button" className="bouton-secondaire" onClick={() => changer("inscription")}>Créer un compte</button>
        </div>
      </form>
    );

  if (mode === "inscription")
    return (
      <form onSubmit={soumettre} className="carte flex flex-col gap-4 p-5 md:p-6">
        <h2 className="text-lg font-semibold">Créer un compte</h2>
        {invite && <Encart ton="info" titre="Tu as été invité dans une équipe. Crée ton compte : le code de l'équipe sera déjà rempli à l'étape suivante." />}
        <label className="etiquette">Ton nom, tel que l&apos;équipe le verra
          <input autoComplete="name" required maxLength={120} className="champ font-normal" value={nom} onChange={(e) => setNom(e.target.value)} />
        </label>
        <ChampTelephone valeur={telephone} onChange={setTelephone} />
        <ChampMotDePasse label="Mot de passe" nouveau valeur={mdp} onChange={setMdp} aide="8 caractères au moins." />
        <label className="etiquette"><span>E-mail <span className="font-normal text-encre-2">(facultatif)</span></span>
          <input type="email" autoComplete="email" className="champ font-normal" value={email} onChange={(e) => setEmail(e.target.value)} />
          <span className="text-[13px] font-normal text-encre-2">Pour recevoir les invitations d&apos;équipe, et récupérer ton compte seul si tu oublies ton mot de passe.</span>
        </label>
        {etat && <Encart ton={etat.ton} titre={etat.texte} />}
        <button type="submit" disabled={envoi} className="bouton-principal">{envoi ? "Création…" : "Créer mon compte"}</button>
        <button type="button" className="self-center text-sm text-accent underline" onClick={() => changer("connexion")}>J&apos;ai déjà un compte</button>
      </form>
    );

  if (mode === "oubli")
    return (
      <form onSubmit={soumettre} className="carte flex flex-col gap-4 p-5 md:p-6">
        <h2 className="text-lg font-semibold">Mot de passe oublié</h2>
        <p className="text-sm text-encre-2">
          Si tu as donné un e-mail et que tu l&apos;as confirmé, tu reçois un lien pour en choisir un nouveau. Sinon, demande un <strong>mot de passe provisoire</strong> à ton chef de mission : il le crée depuis « Compte et équipe ».
        </p>
        <label className="etiquette">Ton numéro de téléphone (ou ton e-mail)
          <input inputMode="tel" autoComplete="tel" required className="champ font-normal" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
        </label>
        {etat && <Encart ton={etat.ton} titre={etat.texte} />}
        <button type="submit" disabled={envoi} className="bouton-principal">Recevoir un lien</button>
        <button type="button" className="self-center text-sm text-accent underline" onClick={() => changer("connexion")}>Retour à la connexion</button>
      </form>
    );

  return (
    <form onSubmit={soumettre} className="carte flex flex-col gap-4 p-5 md:p-6">
      <h2 className="text-lg font-semibold">Nouveau mot de passe</h2>
      <ChampMotDePasse label="Nouveau mot de passe" nouveau valeur={mdp} onChange={setMdp} aide="8 caractères au moins." />
      {etat && <Encart ton={etat.ton} titre={etat.texte} />}
      <button type="submit" disabled={envoi} className="bouton-principal">Enregistrer</button>
      <button type="button" className="self-center text-sm text-accent underline" onClick={() => changer("connexion")}>Retour à la connexion</button>
    </form>
  );
}

// Changement de mot de passe : obligatoire après un provisoire, volontaire depuis Compte et équipe
export function ChangerMotDePasse({ impose = false, onFini }: { impose?: boolean; onFini?: () => void }) {
  const { changerMotDePasse, mdpProvisoire } = useSession();
  const [actuel, setActuel] = useState(mdpProvisoire ?? "");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (nouveau !== confirmation) return setErreur("Les deux mots de passe ne sont pas identiques.");
    setEnvoi(true);
    try {
      await changerMotDePasse(actuel, nouveau);
      onFini?.();
    } catch (err) {
      setErreur(messageErreur(err));
    }
    setEnvoi(false);
  }

  return (
    <form onSubmit={soumettre} className="carte flex flex-col gap-4 p-5 md:p-6">
      <h2 className="text-lg font-semibold">{impose ? "Choisis ton mot de passe" : "Changer mon mot de passe"}</h2>
      {impose && <p className="text-sm text-encre-2">Ton chef de mission t&apos;a donné un mot de passe provisoire. Choisis le tien pour continuer : toi seul le connaîtras.</p>}
      {!(impose && mdpProvisoire) && <ChampMotDePasse label={impose ? "Mot de passe provisoire" : "Mot de passe actuel"} valeur={actuel} onChange={setActuel} />}
      <ChampMotDePasse label="Nouveau mot de passe" nouveau valeur={nouveau} onChange={setNouveau} aide="8 caractères au moins." />
      <ChampMotDePasse label="Retape le nouveau mot de passe" nouveau valeur={confirmation} onChange={setConfirmation} />
      {erreur && <Encart ton="erreur" titre={erreur} />}
      <button type="submit" disabled={envoi} className="bouton-principal">Enregistrer</button>
    </form>
  );
}

// Lien wa.me : sans numéro, WhatsApp demande à qui envoyer
const lienWhatsApp = (texte: string, telephone?: string | null) => `https://wa.me/${telephone ? telephone.replace(/\D/g, "") : ""}?text=${encodeURIComponent(texte)}`;

export function Equipe() {
  const { user, org, orgs, choisirOrg, rechargerOrgs, deconnexion, enAttente, enLigne } = useSession();
  const [nomOrg, setNomOrg] = useState("");
  const [code, setCode] = useState(() => lireInvitation() ?? ""); // rempli par un lien d'invitation
  // Arrivé par un lien d'invitation : « Rejoindre » est déjà ouvert ; sinon, les deux choix sont fermés
  const [choix, setChoix] = useState<"creer" | "rejoindre" | null>(() => (lireInvitation() ? "rejoindre" : null));
  const [nomAffiche, setNomAffiche] = useState(user?.nomAffiche ?? ""); // déjà donné à l'inscription
  const [changerMdp, setChangerMdp] = useState(false);
  const [mdpOk, setMdpOk] = useState(false);
  const [provisoire, setProvisoire] = useState<{ membre: Membre; motDePasse: string } | null>(null);
  const [emails, setEmails] = useState("");
  const [invitation, setInvitation] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);
  const [copie, setCopie] = useState(false);
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
      garderInvitation(null);
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

  async function donnerProvisoire(m: Membre) {
    const qui = m.nom_affiche || "ce membre";
    if (!confirm(`Créer un mot de passe provisoire pour ${qui} ? Son mot de passe actuel ne marchera plus et ses appareils seront déconnectés. Il devra en choisir un nouveau à sa connexion.`)) return;
    setErreur(null);
    try {
      setProvisoire({ membre: m, motDePasse: (await api.motDePasseProvisoire(org!.id, m.user_id)).motDePasse });
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function inviterParEmail(e: React.FormEvent) {
    e.preventDefault();
    setInvitation(null);
    const liste = emails.split(/[\s,;]+/).filter(Boolean);
    try {
      const r = await api.inviter(org!.id, liste);
      setInvitation(
        r.echecs.length
          ? { ton: "erreur", texte: `${r.envoyes} invitation(s) envoyée(s). Échec pour : ${r.echecs.join(", ")}.` }
          : { ton: "ok", texte: `${r.envoyes} invitation(s) envoyée(s). Dis à tes collègues de regarder aussi dans leurs spams.` },
      );
      if (!r.echecs.length) setEmails("");
    } catch (err) {
      setInvitation({ ton: "erreur", texte: messageErreur(err) });
    }
  }

  const lienInvitation = org?.code_invitation ? `${window.location.origin}/?invitation=${org.code_invitation}` : "";
  const texteInvitation = org
    ? `Rejoins l'équipe « ${org.nom} » sur GeoTopo. Ouvre ce lien, crée ton compte avec ton numéro, puis touche « Rejoindre » (code ${org.code_invitation}) : ${lienInvitation}`
    : "";

  async function copierLien() {
    try {
      await navigator.clipboard.writeText(texteInvitation);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      setInvitation({ ton: "erreur", texte: "Copie impossible sur cet appareil. Utilise WhatsApp ou l'e-mail." });
    }
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
            <div className="font-semibold break-all">{user?.nomAffiche}</div>
            <div className="text-sm break-all text-encre-2">{user?.telephone ? formaterTelephone(user.telephone) : user?.email}</div>
          </div>
          <button type="button" onClick={seDeconnecter} className="bouton-secondaire">Se déconnecter</button>
        </div>
        <p className="text-[13px] text-encre-2">La déconnexion efface les données de cet appareil (elles restent sur le serveur une fois envoyées).</p>
        {mdpOk && <Encart ton="ok" titre="Mot de passe changé. Tes autres appareils ont été déconnectés." />}
        {!changerMdp ? (
          <button type="button" className="self-start text-sm text-accent underline" onClick={() => { setChangerMdp(true); setMdpOk(false); }}>Changer mon mot de passe</button>
        ) : (
          <ChangerMotDePasse onFini={() => { setChangerMdp(false); setMdpOk(true); }} />
        )}
      </section>

      {orgs.length > 1 && (
        <Liste label="Organisation active" valeur={org?.id ?? ""} options={orgs.map((o) => ({ valeur: o.id, label: o.nom, detail: ROLES[o.role] }))} onChange={choisirOrg} />
      )}

      {org ? (
        <section className="carte flex flex-col gap-4 p-5 md:p-6">
          <h2 className="text-lg font-semibold">{org.nom}</h2>
          <p className="text-sm">Ton rôle : <strong>{ROLES[org.role]}</strong></p>
          {org.code_invitation && (
            <div className="flex flex-col gap-3 rounded-md bg-surface-2 p-3.5">
              <div>
                <div className="text-[13px] text-encre-2">Code d&apos;invitation de ton équipe</div>
                <div className="font-mono text-xl font-semibold tracking-wider">{org.code_invitation}</div>
              </div>
              <div className="text-sm font-semibold">Inviter des collègues</div>
              <div className="flex flex-wrap gap-2">
                <a href={lienWhatsApp(texteInvitation)} target="_blank" rel="noopener noreferrer" className="bouton-principal">Inviter par WhatsApp</a>
                <button type="button" onClick={copierLien} className="bouton-secondaire">{copie ? "Lien copié ✓" : "Copier le lien"}</button>
              </div>
              <form onSubmit={inviterParEmail} className="flex flex-col gap-2">
                <label className="etiquette">Ou par e-mail : une ou plusieurs adresses (10 au plus)
                  <input type="text" inputMode="email" autoComplete="off" required placeholder="awa@exemple.sn, moussa@exemple.sn" className="champ font-normal" value={emails} onChange={(e) => setEmails(e.target.value)} />
                </label>
                <button type="submit" className="bouton-secondaire self-start">Envoyer les invitations</button>
              </form>
              {invitation && <Encart ton={invitation.ton} titre={invitation.texte} />}
              <p className="text-[13px] text-encre-2">Le lien ouvre GeoTopo avec le code déjà rempli : ton collègue crée son compte avec son numéro, puis touche « Rejoindre ».</p>
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
                    {m.telephone ? (
                      <a href={`tel:${m.telephone}`} className="block text-[13px] text-encre-2 tabular-nums underline">{formaterTelephone(m.telephone)}</a>
                    ) : (
                      <span className="block text-[13px] text-encre-2">{m.email}</span>
                    )}
                    {org.role === "chef" && m.user_id !== user?.id && (
                      <button type="button" onClick={() => donnerProvisoire(m)} className="mt-1 block text-[13px] text-accent underline">Créer un mot de passe provisoire</button>
                    )}
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
            {provisoire && (
              <div className="mt-3 flex flex-col gap-2 rounded-md border border-accent p-3.5">
                <div className="text-sm">Mot de passe provisoire de <strong>{provisoire.membre.nom_affiche || "ce membre"}</strong>, affiché une seule fois :</div>
                <div className="font-mono text-2xl font-semibold tracking-wider select-all">{provisoire.motDePasse}</div>
                <p className="text-[13px] text-encre-2">Donne-le-lui de vive voix ou par WhatsApp. À sa connexion, il devra choisir son propre mot de passe.</p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={lienWhatsApp(`Ton mot de passe provisoire GeoTopo : ${provisoire.motDePasse} . Connecte-toi avec ton numéro, puis choisis ton nouveau mot de passe : ${window.location.origin}`, provisoire.membre.telephone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bouton-principal"
                  >
                    Envoyer par WhatsApp
                  </a>
                  <button type="button" onClick={() => setProvisoire(null)} className="bouton-secondaire">C&apos;est noté</button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          {locaux > 0 && <Encart ton="info" titre={`${locaux} chantier(s) saisi(s) sur cet appareil rejoindront l'équipe choisie.`} />}
          {/* Les comptes créés avant le nom à l'inscription n'en ont pas : on le demande ici seulement */}
          {!user?.nomAffiche && (
            <label className="etiquette carte p-4">Ton nom, tel que l&apos;équipe le verra
              <input className="champ font-normal" value={nomAffiche} required maxLength={120} onChange={(e) => setNomAffiche(e.target.value)} />
            </label>
          )}

          <ChoixEquipe
            ouvert={choix === "creer"}
            onOuvrir={() => setChoix("creer")}
            titre="Je crée mon équipe"
            detail="Tu es chef de mission, ou tu travailles seul. Tu pourras inviter des collègues ensuite."
          >
            <form onSubmit={creer} className="flex flex-col gap-3">
              <label className="etiquette">Nom du cabinet ou de l&apos;équipe
                <input className="champ font-normal" value={nomOrg} required minLength={2} maxLength={120} placeholder="Cabinet Diop Topographie" autoFocus onChange={(e) => setNomOrg(e.target.value)} />
              </label>
              <button type="submit" className="bouton-principal">Créer mon équipe</button>
            </form>
          </ChoixEquipe>

          <ChoixEquipe
            ouvert={choix === "rejoindre"}
            onOuvrir={() => setChoix("rejoindre")}
            titre="J'ai un code d'invitation"
            detail="Un collègue t'a invité dans son équipe."
          >
            <form onSubmit={rejoindre} className="flex flex-col gap-3">
              <label className="etiquette">Code d&apos;invitation
                <input
                  className="champ font-mono font-normal"
                  value={code}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="c23e89c0db1a"
                  // Le lien entier collé depuis WhatsApp marche aussi : on n'en garde que le code
                  onChange={(e) => setCode(e.target.value.match(/[0-9a-f]{12}/i)?.[0].toLowerCase() ?? e.target.value)}
                />
                <span className="text-[13px] font-normal text-encre-2">12 caractères, ou colle directement le lien reçu.</span>
              </label>
              <button type="submit" className="bouton-principal">Rejoindre l&apos;équipe</button>
            </form>
          </ChoixEquipe>
        </section>
      )}
      {erreur && <Encart ton="erreur" titre={erreur} />}
    </>
  );
}

// Un choix de l'écran « équipe » : une grande carte qui se déplie quand on la touche
function ChoixEquipe({ ouvert, onOuvrir, titre, detail, children }: { ouvert: boolean; onOuvrir: () => void; titre: string; detail: string; children: React.ReactNode }) {
  return (
    <div className={`carte flex flex-col gap-4 p-5 transition-colors ${ouvert ? "border-accent" : ""}`}>
      <button type="button" onClick={onOuvrir} aria-expanded={ouvert} className="flex items-center justify-between gap-3 text-left">
        <span>
          <span className="block text-lg font-semibold">{titre}</span>
          <span className="block text-sm text-encre-2">{detail}</span>
        </span>
        {!ouvert && <span aria-hidden="true" className="text-xl text-accent">→</span>}
      </button>
      {ouvert && children}
    </div>
  );
}
