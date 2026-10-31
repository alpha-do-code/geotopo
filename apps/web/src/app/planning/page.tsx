"use client";

import { ajouterJours, avancementPondere, ecartJours, jourIso, NATURES, retardJours } from "@geotopo/metier";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useOrganisation } from "@/components/gestion/donnees";
import { useSession } from "@/components/session";
import type { Chantier, Tache } from "@/lib/db";

const H = 52; // hauteur d'une ligne
const ENTETE = 44;
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

type Ligne = { c: Chantier; taches: Tache[]; debut: string; fin: string; avancement: number; retard: number };
type Filtre = "tous" | "retard" | "en_cours";

const lienPlanning = (id: string) => `/chantier/?id=${id}&volet=planning`;

// Vue de tous les chantiers sur un même calendrier : chevauchements, retards, jalons à venir
export default function PlanningGlobal() {
  const { orgId } = useSession();
  const d = useOrganisation(orgId);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  if (!d) return <p className="p-8 text-encre-2">Chargement…</p>;

  const aujourdhui = jourIso();
  const lignes: Ligne[] = d.chantiers.flatMap((c) => {
    const taches = d.taches.filter((t) => t.chantier_id === c.id);
    if (!taches.length) return [];
    return [{
      c,
      taches,
      debut: taches.reduce((m, t) => (t.debut < m ? t.debut : m), taches[0].debut),
      fin: taches.reduce((m, t) => (t.fin > m ? t.fin : m), taches[0].fin),
      avancement: avancementPondere(taches) ?? 0,
      retard: retardJours(taches, aujourdhui),
    }];
  }).sort((a, b) => a.debut.localeCompare(b.debut));
  const sansPlanning = d.chantiers.filter((c) => !lignes.some((l) => l.c.id === c.id));
  const visibles = lignes.filter((l) => filtre === "tous" || (filtre === "retard" ? l.retard > 0 : l.avancement < 100));
  // Jalons non tenus : en retard, ou attendus dans les 14 prochains jours
  const jalons = d.taches
    .filter((t) => t.jalon && t.avancement < 100 && ecartJours(aujourdhui, t.debut) <= 14 && d.chantiers.some((c) => c.id === t.chantier_id))
    .sort((a, b) => a.debut.localeCompare(b.debut));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Planning</h1>
        <p className="mt-1 text-encre-2">Tous les chantiers sur un même calendrier. Touche un chantier pour modifier ses tâches.</p>
      </header>

      <section aria-label="En bref" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Chiffre titre="Chantiers planifiés" valeur={String(lignes.length)} />
        <Chiffre titre="En retard" valeur={String(lignes.filter((l) => l.retard > 0).length)} classe={lignes.some((l) => l.retard > 0) ? "text-erreur" : ""} />
        <Chiffre titre="Jalons à tenir (14 j)" valeur={String(jalons.length)} classe={jalons.some((t) => t.debut < aujourdhui) ? "text-erreur" : ""} />
        <Chiffre titre="Sans planning" valeur={String(sansPlanning.length)} classe={sansPlanning.length ? "text-alerte" : ""} />
      </section>

      {lignes.length === 0 ? (
        <div className="carte p-8 text-center">
          <p className="font-semibold">Aucun chantier planifié.</p>
          <p className="mt-1 text-encre-2">Ouvre un chantier, volet Planning, et applique le modèle de tâches de sa nature de travaux.</p>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Filtrer" className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {([["tous", "Tous"], ["en_cours", "En cours"], ["retard", "En retard"]] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={filtre === k}
                onClick={() => setFiltre(k)}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-sm whitespace-nowrap ${filtre === k ? "border-accent bg-accent text-accent-encre" : "border-bord-fort bg-surface"}`}
              >
                {l}
              </button>
            ))}
          </div>
          {visibles.length ? <GanttGlobal lignes={visibles} aujourdhui={aujourdhui} /> : <p className="text-encre-2">Aucun chantier pour ce filtre.</p>}
        </>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {jalons.length > 0 && (
          <section aria-labelledby="h-jalons" className="carte flex flex-col gap-3 p-5">
            <h2 id="h-jalons" className="font-semibold">Jalons à tenir</h2>
            <ul className="flex flex-col divide-y divide-bord">
              {jalons.map((t) => {
                const c = d.chantiers.find((k) => k.id === t.chantier_id);
                return (
                  <li key={t.id}>
                    <Link href={lienPlanning(t.chantier_id)} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{t.titre}</span>
                        <span className="block truncate text-encre-2">{c?.nom}</span>
                      </span>
                      <span className={`shrink-0 font-mono ${t.debut < aujourdhui ? "text-erreur" : "text-encre-2"}`}>{t.debut < aujourdhui ? `en retard · ${dateCourte(t.debut)}` : dateCourte(t.debut)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {sansPlanning.length > 0 && (
          <section aria-labelledby="h-sans" className="carte flex flex-col gap-3 p-5">
            <h2 id="h-sans" className="font-semibold">Chantiers sans planning</h2>
            <ul className="flex flex-col divide-y divide-bord">
              {sansPlanning.map((c) => (
                <li key={c.id}>
                  <Link href={lienPlanning(c.id)} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.nom}</span>
                      <span className="block truncate text-encre-2">{NATURES[c.nature]}</span>
                    </span>
                    <span className="shrink-0 text-accent">Planifier →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function GanttGlobal({ lignes, aujourdhui }: { lignes: Ligne[]; aujourdhui: string }) {
  const router = useRouter();
  // Largeur disponible : sur une période courte, les jours s'élargissent pour remplir la carte
  const zone = useRef<HTMLDivElement>(null);
  const [dispo, setDispo] = useState(0);
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDispo(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  let debutVue = ajouterJours(lignes.reduce((m, l) => (l.debut < m ? l.debut : m), lignes[0].debut), -2);
  let finVue = ajouterJours(lignes.reduce((m, l) => (l.fin > m ? l.fin : m), lignes[0].fin), 3);
  if (aujourdhui < debutVue && ecartJours(aujourdhui, debutVue) <= 30) debutVue = ajouterJours(aujourdhui, -2);
  if (aujourdhui > finVue && ecartJours(finVue, aujourdhui) <= 30) finVue = ajouterJours(aujourdhui, 3);
  const nbJours = ecartJours(debutVue, finVue) + 1;
  // Jours plus serrés quand la période est longue
  const J = Math.max(nbJours > 120 ? 8 : nbJours > 60 ? 14 : 24, Math.min(72, Math.floor(dispo / nbJours)));
  const largeur = nbJours * J;
  const hauteur = ENTETE + lignes.length * H;
  const x = (d: string) => ecartJours(debutVue, d) * J;
  const jours = Array.from({ length: nbJours }, (_, i) => ajouterJours(debutVue, i));

  return (
    <section aria-label="Calendrier des chantiers" className="carte flex overflow-hidden">
      <div className="w-36 shrink-0 border-r border-bord sm:w-56 lg:w-72">
        <div style={{ height: ENTETE }} className="flex items-end border-b border-bord px-3 pb-1.5 text-[13px] font-semibold text-encre-2">Chantier</div>
        {lignes.map((l) => (
          <Link key={l.c.id} href={lienPlanning(l.c.id)} style={{ height: H }} className="flex flex-col justify-center border-b border-bord px-3 last:border-b-0 hover:bg-surface-2">
            <span className="truncate text-sm font-medium">{l.c.nom}</span>
            <span className="truncate text-[12px] text-encre-2">
              {Math.round(l.avancement)} %{l.retard > 0 && <span className="text-erreur"> · {l.retard} j de retard</span>}
            </span>
          </Link>
        ))}
      </div>
      <div ref={zone} className="min-w-0 flex-1 overflow-x-auto">
        <svg width={largeur} height={hauteur} role="img" aria-label={`Chantiers du ${dateCourte(debutVue)} au ${dateCourte(finVue)}`} className="block">
          {jours.map((d, i) => {
            const jd = new Date(`${d}T00:00:00Z`);
            const premier = jd.getUTCDate() === 1 || i === 0;
            const lundi = jd.getUTCDay() === 1;
            const we = jd.getUTCDay() === 0 || jd.getUTCDay() === 6;
            return (
              <g key={d}>
                {we && J >= 14 && <rect x={i * J} y={ENTETE} width={J} height={hauteur - ENTETE} fill="var(--surface-2)" />}
                {(premier || lundi) && <line x1={i * J} x2={i * J} y1={ENTETE - 20} y2={hauteur} stroke="var(--bord)" strokeWidth={premier ? 1 : 0.5} />}
                {(J >= 14 || lundi) && <text x={i * J + (J >= 14 ? J / 2 : 2)} y={ENTETE - 6} textAnchor={J >= 14 ? "middle" : "start"} fontSize="11" fill="var(--encre-2)">{jd.getUTCDate()}</text>}
                {premier && <text x={i * J + 4} y={16} fontSize="12" fontWeight="600" fill="var(--encre)">{`${MOIS[jd.getUTCMonth()]} ${jd.getUTCFullYear()}`}</text>}
              </g>
            );
          })}
          <line x1={0} x2={largeur} y1={ENTETE} y2={ENTETE} stroke="var(--bord)" />
          {lignes.map((l, i) => <line key={l.c.id} x1={0} x2={largeur} y1={ENTETE + (i + 1) * H} y2={ENTETE + (i + 1) * H} stroke="var(--bord)" strokeWidth={0.5} />)}

          {aujourdhui >= debutVue && aujourdhui <= finVue && (
            <line x1={x(aujourdhui) + J / 2} x2={x(aujourdhui) + J / 2} y1={ENTETE} y2={hauteur} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" />
          )}

          {lignes.map((l, i) => {
            const y = ENTETE + i * H;
            const bx = x(l.debut) + 1;
            const bw = (ecartJours(l.debut, l.fin) + 1) * J - 2;
            const couleur = l.retard > 0 ? "var(--erreur)" : "var(--accent)";
            return (
              <g key={l.c.id} className="cursor-pointer" onClick={() => router.push(lienPlanning(l.c.id))}>
                <title>{`${l.c.nom} · ${dateCourte(l.debut)} → ${dateCourte(l.fin)} · ${Math.round(l.avancement)} %`}</title>
                <rect x={bx} y={y + 16} width={bw} height={H - 32} rx={4} fill={couleur} opacity={0.22} />
                <rect x={bx} y={y + 16} width={(bw * l.avancement) / 100} height={H - 32} rx={4} fill={couleur} />
                {l.taches.filter((t) => t.jalon).map((t) => {
                  const cx = x(t.debut) + J / 2;
                  const cy = y + 10;
                  return <rect key={t.id} x={cx - 4.5} y={cy - 4.5} width={9} height={9} transform={`rotate(45 ${cx} ${cy})`} fill={t.avancement >= 100 ? couleur : "var(--surface)"} stroke={couleur} strokeWidth={1.5} />;
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function Chiffre({ titre, valeur, classe = "" }: { titre: string; valeur: string; classe?: string }) {
  return (
    <div className="carte p-4">
      <div className="text-[13px] text-encre-2">{titre}</div>
      <div className={`mt-1 text-2xl font-bold ${classe}`}>{valeur}</div>
    </div>
  );
}

const dateCourte = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
