"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BandeauInstallation } from "@/components/installation";
import { Pastille } from "@/components/pastille";
import { useSession } from "@/components/session";
import { db, enregistrerChantier, nouveauChantier } from "@/lib/db";
import { CLASSES, formatCm, METHODES, NATURES, REFERENTIELS, type Nature, type Referentiel } from "@geotopo/metier";
import { resultatChantier, STATUTS, statutChantier, type Statut } from "@/lib/statut";
import { suiviChantier, type Suivi } from "@/lib/suivi";
import { Liste, optionsDe } from "@/components/liste";

export default function TableauDeBord() {
  const { orgId, pret } = useSession();
  const router = useRouter();
  const [filtreStatut, setFiltreStatut] = useState<Statut | "tous">("tous");
  const [filtreNature, setFiltreNature] = useState<Nature | "toutes">("toutes");
  const [filtreRef, setFiltreRef] = useState<Referentiel | "tous">("tous");

  const chantiers = useLiveQuery(() => db.chantiers.where("org_id").equals(orgId).filter((c) => !c.supprime).toArray(), [orgId]);
  const points = useLiveQuery(() => db.points.where("org_id").equals(orgId).toArray(), [orgId]);
  const taches = useLiveQuery(() => db.taches.where("org_id").equals(orgId).filter((t) => !t.supprime).toArray(), [orgId]);
  const objectifs = useLiveQuery(() => db.objectifs.where("org_id").equals(orgId).filter((o) => !o.supprime).toArray(), [orgId]);
  const indicateurs = useLiveQuery(() => db.indicateurs.where("org_id").equals(orgId).filter((i) => !i.supprime).toArray(), [orgId]);

  const lignes = useMemo(() => {
    if (!chantiers || !points || !taches || !objectifs || !indicateurs) return [];
    return chantiers
      .map((c) => {
        const r = resultatChantier(c, points);
        const objs = new Set(objectifs.filter((o) => o.chantier_id === c.id).map((o) => o.id));
        const suivi = suiviChantier(r, taches.filter((t) => t.chantier_id === c.id), indicateurs.filter((i) => objs.has(i.objectif_id)));
        return { c, r, statut: statutChantier(c, r), suivi };
      })
      .sort((a, b) => b.c.updated_at.localeCompare(a.c.updated_at));
  }, [chantiers, points, taches, objectifs, indicateurs]);

  const compte = (s: Statut) => lignes.filter((l) => l.statut === s).length;
  const visibles = lignes.filter(
    (l) =>
      (filtreStatut === "tous" || l.statut === filtreStatut) &&
      (filtreNature === "toutes" || l.c.nature === filtreNature) &&
      (filtreRef === "tous" || l.c.referentiel === filtreRef),
  );

  async function creer() {
    const c = { ...nouveauChantier(orgId), nom: "Nouveau chantier" };
    await enregistrerChantier(c);
    router.push(`/chantier/?id=${c.id}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <BandeauInstallation />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Chantiers</h1>
          <p className="mt-1 text-encre-2">Conformité au cahier des charges, avancement et résultats, par chantier.</p>
        </div>
        <button type="button" onClick={creer} disabled={!pret} className="bouton-principal">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M8 2v12M2 8h12" /></svg>
          Nouveau chantier
        </button>
      </header>

      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Indicateur titre="Chantiers" valeur={lignes.length} />
        <Indicateur titre="Conformes" valeur={compte("conforme")} classe="text-ok" />
        <Indicateur titre="À valider" valeur={compte("a_valider")} classe="text-alerte" />
        <Indicateur titre="Non conformes" valeur={compte("non_conforme")} classe="text-erreur" />
      </section>

      <section aria-label="Filtres" className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <Liste
          label="Nature des travaux"
          classeLabel="font-normal text-encre-2"
          className="sm:w-64"
          valeur={filtreNature}
          options={[{ valeur: "toutes" as const, label: "Toutes" }, ...optionsDe(NATURES)]}
          onChange={setFiltreNature}
        />
        <Liste
          label="Référentiel"
          classeLabel="font-normal text-encre-2"
          className="sm:w-56"
          valeur={filtreRef}
          options={[{ valeur: "tous" as const, label: "Tous" }, ...optionsDe(REFERENTIELS)]}
          onChange={setFiltreRef}
        />
        <div role="group" aria-label="Statut" className="col-span-2 -mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {(["tous", "conforme", "a_valider", "non_conforme", "en_cours"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filtreStatut === s}
              onClick={() => setFiltreStatut(s)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm whitespace-nowrap ${filtreStatut === s ? "border-accent bg-accent text-accent-encre" : "border-bord-fort bg-surface"}`}
            >
              {s === "tous" ? "Tous" : STATUTS[s].label}
            </button>
          ))}
        </div>
      </section>

      {chantiers && lignes.length === 0 ? (
        <div className="carte p-8 text-center">
          <p className="font-semibold">Aucun chantier pour l&apos;instant.</p>
          <p className="mt-1 text-encre-2">Crée ton premier chantier pour saisir ses exigences, ses points levés et ses contrôles.</p>
        </div>
      ) : (
        <>
          {/* Tableau sur très grand écran (1280 px et plus), cartes en dessous */}
          <section aria-label="Liste des chantiers" className="carte hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="bg-surface-2 text-left text-encre-2">
                  {["Chantier", "Nature", "Méthode", "Classe exigée", "EMQ obtenu", "Avancement", "Retard", "Indicateurs", "Statut"].map((t) => (
                    <th key={t} className="px-4 py-3 font-semibold">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ c, r, statut, suivi }) => (
                  <tr key={c.id} className="border-t border-bord">
                    <td className="px-4 py-3.5">
                      <Link href={`/chantier/?id=${c.id}`} className="font-semibold text-accent hover:underline">{c.nom}</Link>
                      <div className="mt-0.5 text-[13px] text-encre-2">{[c.lieu, REFERENTIELS[c.referentiel]].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-4 py-3.5">{NATURES[c.nature]}</td>
                    <td className="px-4 py-3.5">{METHODES[c.methode]}</td>
                    <td className="px-4 py-3.5 font-mono">{c.tolerance_cm ? `${formatCm(c.tolerance_cm)} cm (CDC)` : CLASSES[c.classe].label}</td>
                    <td className="px-4 py-3.5 font-mono">{r.emq == null ? "—" : `${formatCm(r.emq)} cm`}</td>
                    <td className="px-4 py-3.5"><Avancement suivi={suivi} /></td>
                    <td className={`px-4 py-3.5 font-mono ${suivi.retard ? "text-erreur" : ""}`}>{suivi.avancement == null ? "—" : suivi.retard ? `${suivi.retard} j` : "0 j"}</td>
                    <td className="px-4 py-3.5 font-mono">{suivi.atteinte == null ? "—" : `${Math.round(suivi.atteinte)} %`}</td>
                    <td className="px-4 py-3.5"><Pastille statut={statut} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Cartes sur téléphone */}
          <ul aria-label="Liste des chantiers" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
            {visibles.map(({ c, r, statut, suivi }) => (
              <li key={c.id}>
                <Link href={`/chantier/?id=${c.id}`} className="carte flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{c.nom}</span>
                    <Pastille statut={statut} />
                  </div>
                  <span className="text-sm text-encre-2">{NATURES[c.nature]} · {METHODES[c.methode]}</span>
                  <span className="font-mono text-sm">
                    {CLASSES[c.classe].label} · EMQ {r.emq == null ? "—" : `${formatCm(r.emq)} cm`}
                  </span>
                  {suivi.avancement != null && (
                    <span className="flex flex-wrap gap-x-2 text-sm">
                      <span className="whitespace-nowrap">Avancement {Math.round(suivi.avancement)} %</span>
                      {suivi.retard > 0 && <span className="whitespace-nowrap text-erreur">· {suivi.retard} j de retard</span>}
                      {suivi.atteinte != null && <span className="whitespace-nowrap text-encre-2">· indicateurs {Math.round(suivi.atteinte)} %</span>}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

// Avancement réel, et en dessous l'avancement prévu à ce jour
function Avancement({ suivi }: { suivi: Suivi }) {
  if (suivi.avancement == null) return <span className="text-encre-2">—</span>;
  const enRetard = suivi.prevu != null && suivi.avancement + 0.5 < suivi.prevu;
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(suivi.avancement)} aria-label="Avancement">
        <div className={`h-full rounded-full ${enRetard ? "bg-alerte" : "bg-accent"}`} style={{ width: `${Math.max(2, suivi.avancement)}%` }} />
      </div>
      <span className="font-mono text-[12px] text-encre-2">{Math.round(suivi.avancement)} % · prévu {suivi.prevu == null ? "—" : `${Math.round(suivi.prevu)} %`}</span>
    </div>
  );
}

function Indicateur({ titre, valeur, classe = "" }: { titre: string; valeur: number; classe?: string }) {
  return (
    <div className="carte p-4">
      <div className="text-[13px] text-encre-2">{titre}</div>
      <div className={`mt-1 text-3xl font-bold ${classe}`}>{valeur}</div>
    </div>
  );
}
