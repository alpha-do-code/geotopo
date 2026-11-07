"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Connexion, Equipe } from "./compte";
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

export function Portail({ children }: { children: ReactNode }) {
  const { pret, user, org } = useSession();
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

  if (!pret)
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <span className="animate-pulse rounded-2xl bg-nav p-3"><Logo taille={48} /></span>
        <span className="sr-only">Chargement…</span>
      </div>
    );

  if (!user)
    return (
      <Ecran>
        <Connexion />
        <Link href="/installer/" className="text-center text-sm text-accent underline">Installer l&apos;application sur cet appareil</Link>
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
