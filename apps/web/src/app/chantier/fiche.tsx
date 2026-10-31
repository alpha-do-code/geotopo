"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controle } from "@/components/controle";
import { Indicateurs } from "@/components/gestion/indicateurs";
import { Planning } from "@/components/gestion/planning";
import { MatriceRaci } from "@/components/gestion/raci";
import { Pastille } from "@/components/pastille";
import { db, enregistrerChantier, type Chantier, type Point } from "@/lib/db";
import { NATURES, REFERENTIELS } from "@geotopo/metier";
import { resultatChantier, statutChantier } from "@/lib/statut";

// [clé, libellé, libellé court sur téléphone]
const ONGLETS = [
  ["controle", "Contrôle", "Contrôle"],
  ["planning", "Planning", "Planning"],
  ["raci", "Qui fait quoi (RACI)", "RACI"],
  ["indicateurs", "Indicateurs", "Indicateurs"],
] as const;
export type Onglet = (typeof ONGLETS)[number][0];
const estOnglet = (v: string | null): v is Onglet => ONGLETS.some(([k]) => k === v);

export function FicheChantier() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const volet = params.get("volet");
  // null : introuvable sur cet appareil ; undefined : lecture en cours
  const chantier = useLiveQuery(() => db.chantiers.get(id).then((c) => c ?? null), [id]);
  const points = useLiveQuery(() => db.points.where("chantier_id").equals(id).filter((p) => !p.supprime).toArray(), [id]);

  if (chantier === undefined || points === undefined) return <p className="p-8 text-encre-2">Chargement…</p>;
  if (!chantier || chantier.supprime)
    return (
      <main className="p-8">
        <p>Ce chantier n&apos;existe pas sur cet appareil.</p>
        <Link href="/" className="text-accent underline">Retour aux chantiers</Link>
      </main>
    );
  // Les vues globales (Planning, RACI, Indicateurs) ouvrent la fiche directement sur le bon volet
  return <Fiche key={`${id}-${volet}`} chantier={chantier} points={points} voletInitial={estOnglet(volet) ? volet : "controle"} />;
}

function Fiche({ chantier: c, points, voletInitial }: { chantier: Chantier; points: Point[]; voletInitial: Onglet }) {
  const [onglet, setOnglet] = useState<Onglet>(voletInitial);
  const router = useRouter();
  const maj = (champs: Partial<Chantier>) => enregistrerChantier({ ...c, ...champs });
  const r = resultatChantier(c, points);
  const statut = statutChantier(c, r);

  async function supprimer() {
    if (!confirm(`Supprimer le chantier « ${c.nom} » et ses points ?`)) return;
    await maj({ supprime: true });
    router.push("/");
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <header className="flex flex-col gap-2">
        <Link href="/" className="pas-impression text-sm text-accent">← Chantiers</Link>
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Nom du chantier"
            value={c.nom}
            maxLength={200}
            onChange={(e) => maj({ nom: e.target.value || " " })}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-transparent bg-transparent text-2xl font-bold hover:border-bord focus:border-bord-fort md:text-3xl"
          />
          <Pastille statut={statut} />
        </div>
        <p className="text-encre-2">{[NATURES[c.nature], c.lieu, REFERENTIELS[c.referentiel], c.client && `Maître d'ouvrage : ${c.client}`].filter(Boolean).join(" · ")}</p>
      </header>

      <nav aria-label="Volets du chantier" className="pas-impression">
        <div role="tablist" className="grid grid-cols-4 border-b border-bord sm:flex sm:gap-1">
          {ONGLETS.map(([cle, label, court]) => (
            <button
              key={cle}
              type="button"
              role="tab"
              aria-selected={onglet === cle}
              onClick={() => setOnglet(cle)}
              className={`-mb-px min-h-11 border-b-2 px-1 text-[13px] font-medium sm:px-4 sm:text-sm ${onglet === cle ? "border-accent text-encre" : "border-transparent text-encre-2 hover:text-encre"}`}
            >
              <span className="sm:hidden">{court}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {onglet === "controle" && <Controle chantier={c} points={points} resultat={r} />}
      {onglet === "planning" && <Planning chantier={c} />}
      {onglet === "raci" && <MatriceRaci chantier={c} />}
      {onglet === "indicateurs" && <Indicateurs chantier={c} points={points} />}

      <div className="pas-impression flex justify-end">
        <button type="button" onClick={supprimer} className="bouton text-erreur">Supprimer le chantier</button>
      </div>
    </main>
  );
}
