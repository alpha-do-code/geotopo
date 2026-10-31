"use client";

import { ecartJours, jourIso, LETTRES_RACI, verifierRaci, type LettreRaci } from "@geotopo/metier";
import Link from "next/link";
import { useState } from "react";
import { Encart } from "@/components/choix";
import { useOrganisation, type DonneesOrganisation } from "@/components/gestion/donnees";
import { BasculeSuivi } from "@/components/gestion/bascule-suivi";
import { useSession } from "@/components/session";
import type { Acteur, Tache } from "@/lib/db";

const COULEURS: Record<LettreRaci, string> = {
  R: "bg-accent text-accent-encre",
  A: "bg-alerte-fond text-alerte",
  C: "bg-info-fond text-info",
  I: "bg-surface-2 text-encre-2",
};
const lienRaci = (id: string) => `/chantier/?id=${id}&volet=raci`;

type Affectation = { tache: Tache; lettre: LettreRaci; chantier: string; chantierId: string; enRetard: boolean };

// Qui porte quoi sur l'ensemble des chantiers : la charge de chacun et les trous de la matrice
export default function RaciGlobal() {
  const { orgId } = useSession();
  const d = useOrganisation(orgId);
  if (!d) return <p className="p-8 text-encre-2">Chargement…</p>;

  const aujourdhui = jourIso();
  const nomChantier = new Map(d.chantiers.map((c) => [c.id, c.nom]));
  const tachesActives = d.taches.filter((t) => nomChantier.has(t.chantier_id));
  const parActeur = d.acteurs
    .map((a) => {
      const affectations: Affectation[] = d.raci
        .filter((r) => r.acteur_id === a.id)
        .flatMap((r) => {
          const t = tachesActives.find((k) => k.id === r.tache_id);
          if (!t) return [];
          return [{ tache: t, lettre: r.lettre, chantier: nomChantier.get(t.chantier_id) ?? "", chantierId: t.chantier_id, enRetard: t.avancement < 100 && ecartJours(t.fin, aujourdhui) > 0 }];
        })
        .sort((x, y) => x.tache.fin.localeCompare(y.tache.fin));
      return { acteur: a, affectations };
    })
    .sort((x, y) => enCours(y.affectations) - enCours(x.affectations) || x.acteur.nom.localeCompare(y.acteur.nom, "fr"));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <BasculeSuivi actif="raci" />
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Qui fait quoi</h1>
        <p className="mt-1 text-encre-2">La charge de chaque personne sur tous les chantiers, d&apos;après les matrices RACI. Touche une tâche pour ouvrir sa matrice.</p>
      </header>

      <Manques d={d} />

      {d.acteurs.length === 0 ? (
        <div className="carte p-8 text-center">
          <p className="font-semibold">Aucun acteur.</p>
          <p className="mt-1 text-encre-2">Les membres de l&apos;organisation apparaissent ici. Les acteurs externes s&apos;ajoutent depuis la matrice RACI d&apos;un chantier.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {parActeur.map(({ acteur, affectations }) => <CarteActeur key={acteur.id} acteur={acteur} affectations={affectations} />)}
        </ul>
      )}
    </main>
  );
}

const enCours = (l: Affectation[]) => l.filter((a) => a.tache.avancement < 100).length;

function CarteActeur({ acteur: a, affectations }: { acteur: Acteur; affectations: Affectation[] }) {
  const [tout, setTout] = useState(false);
  const actives = affectations.filter((x) => x.tache.avancement < 100);
  const compte = (l: LettreRaci) => actives.filter((x) => x.lettre === l).length;
  const retards = actives.filter((x) => x.enRetard && (x.lettre === "R" || x.lettre === "A")).length;
  const affichees = tout ? affectations : actives.slice(0, 5);

  return (
    <li className="carte flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{a.nom}</div>
          <div className="truncate text-[13px] text-encre-2">{a.user_id ? "Membre de l'équipe" : [a.fonction, a.organisme].filter(Boolean).join(" · ") || "Externe"}</div>
        </div>
        {retards > 0 && <span className="shrink-0 rounded-full bg-erreur-fond px-2.5 py-0.5 text-[12px] font-medium text-erreur">{retards} en retard</span>}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(LETTRES_RACI) as LettreRaci[]).map((l) => (
          <div key={l} className="rounded-md border border-bord px-2 py-2 text-center">
            <div className="text-xl font-bold">{compte(l)}</div>
            <div className="text-[12px] text-encre-2">{LETTRES_RACI[l].nom}</div>
          </div>
        ))}
      </div>

      {affectations.length === 0 ? (
        <p className="text-sm text-encre-2">Aucune tâche attribuée.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-bord">
            {affichees.map((x) => (
              <li key={x.tache.id + x.lettre}>
                <Link href={lienRaci(x.chantierId)} className="flex items-center gap-3 py-2.5 text-sm hover:text-accent">
                  <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-[13px] font-semibold ${COULEURS[x.lettre]}`}>{x.lettre}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${x.tache.avancement >= 100 ? "text-encre-2 line-through" : ""}`}>{x.tache.titre}</span>
                    <span className="block truncate text-[12px] text-encre-2">{x.chantier}</span>
                  </span>
                  <span className={`shrink-0 font-mono text-[12px] ${x.enRetard ? "text-erreur" : "text-encre-2"}`}>{dateCourte(x.tache.fin)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {(affectations.length > affichees.length || tout) && (
            <button type="button" className="self-start text-sm text-accent underline" onClick={() => setTout(!tout)}>
              {tout ? "Voir seulement les tâches en cours" : `Voir les ${affectations.length} tâches`}
            </button>
          )}
        </>
      )}
    </li>
  );
}

// Chantiers dont la matrice est vide ou incomplète (aucun A, plusieurs A, aucun R)
function Manques({ d }: { d: DonneesOrganisation }) {
  const lignes = d.chantiers.flatMap((c) => {
    const taches = d.taches.filter((t) => t.chantier_id === c.id);
    if (!taches.length) return [];
    const ids = new Set(taches.map((t) => t.id));
    const aff = d.raci.filter((r) => ids.has(r.tache_id) && d.acteurs.some((a) => a.id === r.acteur_id));
    if (!aff.length) return [{ c, texte: "Matrice RACI non remplie" }];
    const n = verifierRaci(taches, aff).length;
    return n ? [{ c, texte: `${n} point(s) à corriger dans la matrice` }] : [];
  });
  if (!lignes.length) return null;
  return (
    <Encart ton="alerte" titre={`${lignes.length} chantier(s) avec une répartition à revoir`}>
      <ul className="mt-1 flex flex-col gap-1">
        {lignes.map(({ c, texte }) => (
          <li key={c.id}>
            <Link href={lienRaci(c.id)} className="underline">{c.nom}</Link> : {texte}
          </li>
        ))}
      </ul>
    </Encart>
  );
}

const dateCourte = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
