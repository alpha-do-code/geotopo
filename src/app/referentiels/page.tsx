"use client";

import { useState } from "react";
import { APPAREIL_PAR_DEFAUT, APPAREILS, CLASSES, MATRICE, METHODES, SOURCES, type Methode } from "@/lib/referentiels";

const ONGLETS = [
  { id: "CI", label: "Côte d'Ivoire" },
  { id: "MA", label: "Maroc" },
  { id: "matrice", label: "Méthodes et appareils" },
] as const;

export default function Referentiels() {
  const [onglet, setOnglet] = useState<(typeof ONGLETS)[number]["id"]>("CI");
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Référentiels et tolérances</h1>
        <p className="mt-1 max-w-3xl text-encre-2">
          Les règles qui servent à juger un contrôle. Chaque valeur porte sa source. Le cahier des charges du chantier prime quand il est plus exigeant.
        </p>
      </header>

      <div role="tablist" aria-label="Référentiel" className="flex flex-wrap gap-2 border-b border-bord">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={onglet === o.id}
            onClick={() => setOnglet(o.id)}
            className={`-mb-px min-h-11 border-b-[3px] px-4 ${onglet === o.id ? "border-accent font-semibold text-accent" : "border-transparent text-encre-2"}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {onglet !== "matrice" ? (
        <section className="flex flex-col gap-4">
          {SOURCES[onglet].map((s) =>
            s.statut === "lu" ? (
              <div key={s.titre} className="carte p-5 md:p-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-semibold">{s.titre}</h2>
                  <span className="rounded-full bg-ok-fond px-2.5 py-0.5 text-xs font-semibold text-ok">Texte lu</span>
                </div>
                <dl className="mt-4 divide-y divide-bord border-t border-bord text-sm">
                  {s.lignes.map(([k, v]) => (
                    <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[240px_1fr]">
                      <dt className="font-semibold">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div key={s.titre} className="rounded-lg bg-alerte-fond p-5 text-sm text-alerte">
                <strong>{s.titre} : à compléter.</strong> {s.manque}
              </div>
            ),
          )}
        </section>
      ) : (
        <section className="carte flex flex-col gap-3 p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-semibold">Méthode, appareil et classe atteignable</h2>
            <span className="rounded-full bg-info-fond px-2.5 py-0.5 text-xs font-semibold text-info">Indicatif, à valider</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="bg-surface-2 text-center text-encre-2">
                  <th className="px-3 py-2.5 text-left font-semibold">Méthode</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Appareil courant</th>
                  {CLASSES.map((k) => <th key={k.label} className="px-2 py-2.5 font-semibold">{k.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(METHODES) as Methode[]).map((m) => (
                  <tr key={m} className="border-t border-bord text-center">
                    <td className="px-3 py-2.5 text-left font-medium">{METHODES[m]}</td>
                    <td className="px-3 py-2.5 text-left text-encre-2">{APPAREILS[APPAREIL_PAR_DEFAUT[m]]}</td>
                    {MATRICE[m].map((v, i) => (
                      <td key={i} className="p-1.5">
                        {v === 2 && <span className="inline-block min-w-7 rounded bg-ok-fond py-0.5 font-semibold text-ok" aria-label="courant">●</span>}
                        {v === 1 && <span className="inline-block min-w-7 rounded bg-alerte-fond py-0.5 font-semibold text-alerte" aria-label="possible avec précautions">○</span>}
                        {v === 0 && <span className="sr-only">hors portée</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-encre-2">
            ● courant · ○ possible avec précautions (sessions longues, calage dense, points d&apos;appui) · vide : hors portée. Valeurs d&apos;usage, pas réglementaires.
          </p>
        </section>
      )}
    </main>
  );
}
