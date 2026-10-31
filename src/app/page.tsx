"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Pastille } from "@/components/pastille";
import { useSession } from "@/components/session";
import { formatCm } from "@/lib/calculs";
import { db, enregistrerChantier, nouveauChantier } from "@/lib/db";
import { APPAREILS, CLASSES, METHODES, NATURES, REFERENTIELS, TYPES_CONTROLE, type Nature, type Referentiel } from "@/lib/referentiels";
import { resultatChantier, STATUTS, statutChantier, type Statut } from "@/lib/statut";

export default function TableauDeBord() {
  const { orgId, pret } = useSession();
  const router = useRouter();
  const [filtreStatut, setFiltreStatut] = useState<Statut | "tous">("tous");
  const [filtreNature, setFiltreNature] = useState<Nature | "toutes">("toutes");
  const [filtreRef, setFiltreRef] = useState<Referentiel | "tous">("tous");

  const chantiers = useLiveQuery(() => db.chantiers.where("org_id").equals(orgId).filter((c) => !c.supprime).toArray(), [orgId]);
  const points = useLiveQuery(() => db.points.where("org_id").equals(orgId).toArray(), [orgId]);

  const lignes = useMemo(() => {
    if (!chantiers || !points) return [];
    return chantiers
      .map((c) => {
        const r = resultatChantier(c, points);
        return { c, r, statut: statutChantier(c, r) };
      })
      .sort((a, b) => b.c.updated_at.localeCompare(a.c.updated_at));
  }, [chantiers, points]);

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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Chantiers</h1>
          <p className="mt-1 text-encre-2">Suivi de la conformité au cahier des charges, par chantier.</p>
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

      <section aria-label="Filtres" className="flex flex-wrap items-end gap-3">
        <label className="etiquette font-normal text-encre-2">
          Nature des travaux
          <select className="champ" value={filtreNature} onChange={(e) => setFiltreNature(e.target.value as Nature | "toutes")}>
            <option value="toutes">Toutes</option>
            {Object.entries(NATURES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="etiquette font-normal text-encre-2">
          Référentiel
          <select className="champ" value={filtreRef} onChange={(e) => setFiltreRef(e.target.value as Referentiel | "tous")}>
            <option value="tous">Tous</option>
            {Object.entries(REFERENTIELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <div role="group" aria-label="Statut" className="flex flex-wrap gap-2">
          {(["tous", "conforme", "a_valider", "non_conforme", "en_cours"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filtreStatut === s}
              onClick={() => setFiltreStatut(s)}
              className={`min-h-11 rounded-full border px-4 text-sm ${filtreStatut === s ? "border-accent bg-accent text-accent-encre" : "border-bord-fort bg-surface"}`}
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
          {/* Tableau sur grand écran */}
          <section aria-label="Liste des chantiers" className="carte hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="bg-surface-2 text-left text-encre-2">
                  {["Chantier", "Nature", "Méthode", "Appareil", "Classe exigée", "EMQ obtenu", "Contrôle", "Statut"].map((t) => (
                    <th key={t} className="px-4 py-3 font-semibold">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ c, r, statut }) => (
                  <tr key={c.id} className="border-t border-bord">
                    <td className="px-4 py-3.5">
                      <Link href={`/chantier/?id=${c.id}`} className="font-semibold text-accent hover:underline">{c.nom}</Link>
                      <div className="mt-0.5 text-[13px] text-encre-2">{[c.lieu, REFERENTIELS[c.referentiel]].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-4 py-3.5">{NATURES[c.nature]}</td>
                    <td className="px-4 py-3.5">{METHODES[c.methode]}</td>
                    <td className="px-4 py-3.5">{APPAREILS[c.appareil]}</td>
                    <td className="px-4 py-3.5 font-mono">{c.tolerance_cm ? `${formatCm(c.tolerance_cm)} cm (CDC)` : CLASSES[c.classe].label}</td>
                    <td className="px-4 py-3.5 font-mono">{r.emq == null ? "—" : `${formatCm(r.emq)} cm`}</td>
                    <td className="px-4 py-3.5">{TYPES_CONTROLE[c.type_controle]}</td>
                    <td className="px-4 py-3.5"><Pastille statut={statut} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Cartes sur téléphone */}
          <ul aria-label="Liste des chantiers" className="flex flex-col gap-3 md:hidden">
            {visibles.map(({ c, r, statut }) => (
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
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
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
