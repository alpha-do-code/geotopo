"use client";

import { formatCm, niveauAtteinte, type NiveauAtteinte } from "@geotopo/metier";
import Link from "next/link";
import { BasculeSuivi } from "@/components/gestion/bascule-suivi";
import { useOrganisation } from "@/components/gestion/donnees";
import { useSession } from "@/components/session";
import { resultatChantier } from "@/lib/statut";
import { mesurerIndicateurs, moyenne, type IndicateurMesure } from "@/lib/suivi";

const NIVEAUX: Record<NiveauAtteinte, { label: string; classe: string; barre: string }> = {
  atteint: { label: "Atteints", classe: "text-ok", barre: "bg-ok" },
  en_cours: { label: "En bonne voie", classe: "text-info", barre: "bg-info" },
  a_risque: { label: "À risque", classe: "text-erreur", barre: "bg-erreur" },
};
const lienIndicateurs = (id: string) => `/chantier/?id=${id}&volet=indicateurs`;
const valeur = (v: number | null, unite: string) => (v == null ? "—" : `${formatCm(v, Math.abs(v) >= 10 || Number.isInteger(v) ? 0 : 1)}${unite ? ` ${unite}` : ""}`);

// Gestion axée sur les résultats à l'échelle de l'organisation : où en sont les objectifs de chaque chantier
export default function IndicateursGlobal() {
  const { orgId } = useSession();
  const d = useOrganisation(orgId);
  if (!d) return <p className="p-8 text-encre-2">Chargement…</p>;

  const parChantier = d.chantiers.map((c) => {
    const objectifs = d.objectifs.filter((o) => o.chantier_id === c.id);
    const ids = new Set(objectifs.map((o) => o.id));
    const r = resultatChantier(c, d.points);
    const mesures = mesurerIndicateurs(r, d.taches.filter((t) => t.chantier_id === c.id), d.indicateurs.filter((i) => ids.has(i.objectif_id)));
    return { c, objectifs, mesures, atteinte: moyenne(mesures.map((m) => m.pct)) };
  });
  const suivis = parChantier.filter((p) => p.mesures.length);
  const sansIndicateurs = parChantier.filter((p) => !p.mesures.length);
  const toutes = suivis.flatMap((p) => p.mesures.map((m) => ({ ...m, chantier: p.c })));
  const mesurees = toutes.filter((m) => m.pct != null);
  const compte = (n: NiveauAtteinte) => mesurees.filter((m) => niveauAtteinte(m.pct!) === n).length;
  const aRisque = mesurees.filter((m) => niveauAtteinte(m.pct!) === "a_risque").sort((a, b) => a.pct! - b.pct!);
  const globale = moyenne(suivis.map((p) => p.atteinte));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <BasculeSuivi actif="indicateurs" />
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Indicateurs</h1>
        <p className="mt-1 text-encre-2">Gestion axée sur les résultats : l&apos;atteinte des objectifs de chaque chantier. Touche un chantier pour modifier ses indicateurs.</p>
      </header>

      <section aria-label="En bref" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="carte p-4">
          <div className="text-[13px] text-encre-2">Atteinte moyenne</div>
          <div className="mt-1 text-2xl font-bold">{globale == null ? "—" : `${Math.round(globale)} %`}</div>
        </div>
        {(Object.keys(NIVEAUX) as NiveauAtteinte[]).map((n) => (
          <div key={n} className="carte p-4">
            <div className="text-[13px] text-encre-2">{NIVEAUX[n].label}</div>
            <div className={`mt-1 text-2xl font-bold ${compte(n) ? NIVEAUX[n].classe : ""}`}>{compte(n)}</div>
          </div>
        ))}
      </section>

      {suivis.length === 0 ? (
        <div className="carte p-8 text-center">
          <p className="font-semibold">Aucun indicateur suivi.</p>
          <p className="mt-1 text-encre-2">Ouvre un chantier, volet Indicateurs, et propose le cadre type : conformité au cahier des charges et respect des délais.</p>
        </div>
      ) : (
        <section aria-labelledby="h-chantiers" className="flex flex-col gap-3">
          <h2 id="h-chantiers" className="text-lg font-semibold">Par chantier</h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {suivis
              .sort((a, b) => (a.atteinte ?? 101) - (b.atteinte ?? 101))
              .map((p) => <CarteChantier key={p.c.id} nom={p.c.nom} id={p.c.id} objectifs={p.objectifs.length} mesures={p.mesures} atteinte={p.atteinte} />)}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {aRisque.length > 0 && (
          <section aria-labelledby="h-risque" className="carte flex flex-col gap-3 p-5">
            <h2 id="h-risque" className="font-semibold">Indicateurs à risque</h2>
            <ul className="flex flex-col divide-y divide-bord">
              {aRisque.map((m) => (
                <li key={m.indicateur.id}>
                  <Link href={lienIndicateurs(m.chantier.id)} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.indicateur.libelle}</span>
                      <span className="block truncate text-encre-2">{m.chantier.nom}</span>
                    </span>
                    <span className="shrink-0 text-right font-mono text-[13px]">
                      <span className="block text-erreur">{valeur(m.realise, m.indicateur.unite)}</span>
                      <span className="block text-encre-2">cible {valeur(m.indicateur.cible, m.indicateur.unite)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {sansIndicateurs.length > 0 && (
          <section aria-labelledby="h-sans" className="carte flex flex-col gap-3 p-5">
            <h2 id="h-sans" className="font-semibold">Chantiers sans indicateurs</h2>
            <ul className="flex flex-col divide-y divide-bord">
              {sansIndicateurs.map(({ c }) => (
                <li key={c.id}>
                  <Link href={lienIndicateurs(c.id)} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent">
                    <span className="truncate font-medium">{c.nom}</span>
                    <span className="shrink-0 text-accent">Définir →</span>
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

function CarteChantier({ nom, id, objectifs, mesures, atteinte }: { nom: string; id: string; objectifs: number; mesures: IndicateurMesure[]; atteinte: number | null }) {
  const niveau = atteinte == null ? null : NIVEAUX[niveauAtteinte(atteinte)];
  const nb = (n: NiveauAtteinte) => mesures.filter((m) => m.pct != null && niveauAtteinte(m.pct) === n).length;
  return (
    <li>
      <Link href={lienIndicateurs(id)} className="carte flex h-full flex-col gap-3 p-4 hover:border-bord-fort">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 font-semibold">{nom}</span>
          <span className={`shrink-0 text-xl font-bold ${niveau?.classe ?? "text-encre-2"}`}>{atteinte == null ? "—" : `${Math.round(atteinte)} %`}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(atteinte ?? 0)} aria-label="Atteinte moyenne">
          <div className={`h-full rounded-full ${niveau?.barre ?? ""}`} style={{ width: `${Math.max(2, atteinte ?? 0)}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-encre-2">
          <span>{objectifs} objectif(s) · {mesures.length} indicateur(s)</span>
          {nb("a_risque") > 0 && <span className="text-erreur">{nb("a_risque")} à risque</span>}
          {nb("atteint") > 0 && <span className="text-ok">{nb("atteint")} atteint(s)</span>}
        </div>
      </Link>
    </li>
  );
}
