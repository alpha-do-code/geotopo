"use client";

import Link from "next/link";
import { Connexion, Equipe } from "@/components/compte";
import { useInstallation } from "@/components/installation";
import { useSession } from "@/components/session";

export default function Compte() {
  const s = useSession();
  const { plateforme } = useInstallation();
  if (!s.pret) return <p className="p-8 text-encre-2">Chargement…</p>;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:py-8">
      <h1 className="text-2xl font-bold md:text-3xl">Compte et équipe</h1>
      {!s.user ? <Connexion /> : <Equipe />}
      {/* Sur téléphone, les référentiels n'ont pas de place dans la barre du bas : on y accède d'ici */}
      <Link href="/referentiels/" className="carte flex items-center justify-between gap-3 p-4 hover:border-bord-fort md:hidden">
        <span>
          <span className="block font-semibold">Référentiels et tolérances</span>
          <span className="block text-sm text-encre-2">Classes de précision, textes ivoiriens et marocains, méthodes</span>
        </span>
        <span aria-hidden="true" className="text-accent">→</span>
      </Link>
      {plateforme !== "installee" && (
        <Link href="/installer/" className="carte flex items-center justify-between gap-3 p-4 hover:border-bord-fort">
          <span>
            <span className="block font-semibold">Installer l&apos;application</span>
            <span className="block text-sm text-encre-2">Sur Android, iPhone ou ordinateur, pour l&apos;ouvrir sans réseau</span>
          </span>
          <span aria-hidden="true" className="text-accent">→</span>
        </Link>
      )}
    </main>
  );
}
