import type { Metadata } from "next";
import { GuideInstallation } from "@/components/installation";

export const metadata: Metadata = { title: "Installer GeoTopo" };

// Page à partager aux collègues : l'adresse de l'application suivie de /installer/
export default function Installer() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Installer GeoTopo</h1>
        <p className="mt-1 text-encre-2">
          GeoTopo s&apos;installe directement depuis le navigateur, sans passer par un store. Une fois installée, elle s&apos;ouvre comme une application et fonctionne hors ligne sur le terrain.
        </p>
      </header>

      <section className="carte flex flex-col gap-4 p-5 md:p-6">
        <h2 className="text-lg font-semibold">Sur cet appareil</h2>
        <GuideInstallation />
      </section>

      <section className="carte flex flex-col gap-3 p-5 md:p-6">
        <h2 className="text-lg font-semibold">Travailler en équipe</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Crée ton compte dans <strong>Compte</strong>, puis confirme ton adresse avec le lien reçu par e-mail.</li>
          <li>Le chef de mission crée l&apos;organisation et te donne son <strong>code d&apos;invitation</strong>.</li>
          <li>Saisis le code dans <strong>Compte</strong> : les chantiers de l&apos;équipe arrivent sur ton appareil.</li>
        </ol>
        <p className="text-sm text-encre-2">
          Hors ligne, tes saisies restent sur l&apos;appareil. Elles partent dès que le réseau revient, et l&apos;application récupère le travail des autres toutes les minutes. Si deux personnes modifient la même fiche, la modification la plus récente l&apos;emporte.
        </p>
      </section>
    </main>
  );
}
