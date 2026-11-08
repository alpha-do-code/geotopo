"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, ErreurApi } from "@/lib/api";
import { ChangerMotDePasse, Connexion, Equipe, garderInvitation, retirerParametres } from "./compte";
import { Encart } from "./choix";
import { useInstallation } from "./installation";
import { Coquille } from "./coquille";
import { Logo } from "./logo";
import { useSession } from "./session";

// Porte d'entrée de l'application : sans compte, on ne voit que la connexion ; avec un compte
// mais sans équipe, on rejoint ou on crée l'équipe. Les chantiers ne s'ouvrent qu'ensuite.
// Une fois connecté, la session est gardée sur l'appareil : l'application s'ouvre hors ligne.

function Ecran({ children, large = false }: { children: ReactNode; large?: boolean }) {
  return (
    <main className={`mx-auto flex min-h-dvh w-full ${large ? "max-w-2xl" : "max-w-md"} flex-col gap-6 px-4 py-10 md:py-16`}>
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="rounded-2xl bg-nav p-3">
          <Logo taille={48} />
        </span>
        <h1 className="text-2xl font-bold">GeoTopo</h1>
        <p className="text-encre-2">Suivi des travaux topographiques, du terrain à l&apos;acceptation.</p>
      </header>
      {children}
    </main>
  );
}

// Liens reçus par e-mail ou WhatsApp, traités où que l'on soit (connecté ou non) :
// /?invitation=CODE garde le code de l'équipe, /compte/?confirmer=JETON confirme l'adresse e-mail
function useLiensRecus() {
  const [annonce, setAnnonce] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const invitation = p.get("invitation")?.trim().toLowerCase();
    const confirmer = p.get("confirmer");
    if (invitation && /^[0-9a-f]{12}$/.test(invitation)) garderInvitation(invitation);
    if (invitation || confirmer) retirerParametres("invitation", "confirmer");
    if (!confirmer) return;
    api.confirmer(confirmer).then(
      (r) => setAnnonce({ ton: "ok", texte: r.message }),
      (e) => setAnnonce({ ton: "erreur", texte: e instanceof ErreurApi ? e.message : "Confirmation impossible. Réessaie." }),
    );
  }, []);
  useEffect(() => {
    if (!annonce) return;
    const t = setTimeout(() => setAnnonce(null), 8000);
    return () => clearTimeout(t);
  }, [annonce]);
  return annonce;
}

export function Portail({ children }: { children: ReactNode }) {
  const annonce = useLiensRecus();
  return (
    <>
      {annonce && (
        <div className="pas-impression fixed inset-x-0 top-0 z-30 mx-auto max-w-md p-3">
          <Encart ton={annonce.ton} titre={annonce.texte} />
        </div>
      )}
      <Contenu>{children}</Contenu>
    </>
  );
}

function Contenu({ children }: { children: ReactNode }) {
  const { pret, user, org, deconnexion, erreurDemarrage } = useSession();
  const { plateforme } = useInstallation();
  useEffect(() => {
    if (erreurDemarrage) console.error("Démarrage GeoTopo :", erreurDemarrage);
  }, [erreurDemarrage]);
  const chemin = usePathname();

  // Le guide d'installation se partage avant d'avoir un compte
  if (chemin.startsWith("/installer")) {
    if (pret && user && org) return <Coquille>{children}</Coquille>;
    return (
      <>
        <div className="flex items-center justify-between gap-3 bg-nav px-4 py-3">
          <span className="flex items-center gap-2 font-bold text-white"><Logo taille={26} />GeoTopo</span>
          <Link href="/" className="text-sm font-semibold text-white underline">Se connecter</Link>
        </div>
        {children}
      </>
    );
  }

  // Cet écran est écrit dans la page statique : s'il reste affiché, c'est que le démarrage traîne ou que
  // le JavaScript ne s'est pas lancé. Le bloc d'aide apparaît alors par le seul CSS, sans React.
  if (!pret)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6" aria-busy="true">
        <span className="animate-pulse rounded-2xl bg-nav p-3"><Logo taille={48} /></span>
        <span className="sr-only">Chargement…</span>
        <div className="apparition-retardee flex max-w-sm flex-col items-center gap-3 text-center text-sm">
          <p className="text-encre-2">Le démarrage prend plus de temps que prévu.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {/* Vrai lien, pas <Link> : il doit recharger la page même si React n'a pas démarré */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="bouton-principal">Réessayer</a>
            <a href="/reparer.html" className="bouton-secondaire">Réparer l&apos;application</a>
          </div>
          <p className="text-[13px] text-encre-2">« Réparer » recharge l&apos;application sans toucher à tes chantiers.</p>
          <p id="gt-erreurs" className="text-[12px] break-all text-erreur"></p>
        </div>
      </div>
    );

  if (!user)
    return (
      <Ecran>
        {erreurDemarrage && <Encart ton="alerte" titre={`Problème au démarrage : ${erreurDemarrage}`} />}
        <Connexion />
        {/* Inutile dans l'application déjà installée */}
        {plateforme !== "installee" && (
          <Link href="/installer/" className="text-center text-sm text-accent underline">Installer l&apos;application sur cet appareil</Link>
        )}
      </Ecran>
    );

  // Mot de passe provisoire donné par le chef : rien d'autre n'est permis avant d'en choisir un
  if (user.doitChangerMotDePasse)
    return (
      <Ecran>
        <ChangerMotDePasse impose />
        <button type="button" onClick={deconnexion} className="text-center text-sm text-accent underline">Se déconnecter</button>
      </Ecran>
    );

  if (!org)
    return (
      <Ecran large>
        <p className="text-center">Dernière étape : rejoins l&apos;équipe avec le code donné par ton chef de mission, ou crée la tienne.</p>
        <Equipe />
      </Ecran>
    );

  return <Coquille>{children}</Coquille>;
}
