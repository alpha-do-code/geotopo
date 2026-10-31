"use client";

import { LETTRES_RACI, verifierRaci, type LettreRaci } from "@geotopo/metier";
import { useState } from "react";
import { Encart } from "@/components/choix";
import { useSession } from "@/components/session";
import { enregistrer, type Chantier } from "@/lib/db";
import { cyclerLettre, nouvelleLigne, useGestion, type Acteur } from "./donnees";

const COULEURS: Record<LettreRaci, string> = {
  R: "bg-accent text-accent-encre",
  A: "bg-alerte-fond text-alerte font-bold",
  C: "bg-info-fond text-info",
  I: "bg-surface-2 text-encre-2",
};

export function MatriceRaci({ chantier: c }: { chantier: Chantier }) {
  const { taches, raci, acteurs } = useGestion(c);
  if (!taches || !raci || !acteurs) return <p className="text-encre-2">Chargement…</p>;
  if (!taches.length)
    return (
      <Encart ton="info" titre="Commence par le planning">
        La matrice RACI répartit les tâches du planning entre les personnes. Crée d&apos;abord les tâches dans l&apos;onglet Planning.
      </Encart>
    );

  const lettre = (tacheId: string, acteurId: string) => raci.find((r) => r.tache_id === tacheId && r.acteur_id === acteurId)?.lettre ?? null;
  const alertes = verifierRaci(taches, raci.filter((r) => acteurs.some((a) => a.id === r.acteur_id)));

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Légende" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {(Object.keys(LETTRES_RACI) as LettreRaci[]).map((l) => (
          <span key={l} className="flex items-center gap-2">
            <span className={`inline-flex size-7 items-center justify-center rounded-md font-mono ${COULEURS[l]}`}>{l}</span>
            <span><strong>{LETTRES_RACI[l].nom}</strong> <span className="text-encre-2">· {LETTRES_RACI[l].aide}</span></span>
          </span>
        ))}
      </section>

      <section aria-label="Matrice RACI" className="carte overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2">
              <th scope="col" className="sticky left-0 z-10 min-w-44 bg-surface-2 px-4 py-3 text-left font-semibold text-encre-2">Tâche</th>
              {acteurs.map((a) => (
                <th key={a.id} scope="col" className="min-w-28 px-2 py-3 text-center align-bottom font-semibold">
                  <span className="block">{a.nom}</span>
                  <span className="block text-[12px] font-normal text-encre-2">{a.user_id ? "Membre" : a.organisme || "Externe"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {taches.map((t) => {
              const enAlerte = alertes.some((k) => k.tache_id === t.id);
              return (
                <tr key={t.id} className="border-t border-bord">
                  <th scope="row" className={`sticky left-0 z-10 bg-surface px-4 py-2 text-left font-normal ${enAlerte ? "text-alerte" : ""}`}>
                    {t.titre}
                  </th>
                  {acteurs.map((a) => {
                    const l = lettre(t.id, a.id);
                    return (
                      <td key={a.id} className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          aria-label={`${t.titre}, ${a.nom} : ${l ? LETTRES_RACI[l].nom : "aucun rôle"}. Changer`}
                          onClick={() => cyclerLettre(c.org_id, t.id, a.id)}
                          className={`inline-flex size-11 items-center justify-center rounded-md border font-mono text-base ${l ? `border-transparent ${COULEURS[l]}` : "border-dashed border-bord-fort text-encre-2"}`}
                        >
                          {l ?? "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="-mt-3 text-[13px] text-encre-2">Touche une case pour passer de R à A, C, I, puis vide.</p>

      {alertes.length > 0 ? (
        <Encart ton="alerte" titre={`${alertes.length} point(s) à corriger`}>
          <ul className="list-disc pl-5">{alertes.map((k, i) => <li key={i}>{k.message}</li>)}</ul>
        </Encart>
      ) : (
        <Encart ton="ok" titre="Chaque tâche a une personne qui la réalise et une seule qui en répond." />
      )}

      <Acteurs acteurs={acteurs} orgId={c.org_id} />
    </div>
  );
}

function Acteurs({ acteurs, orgId }: { acteurs: Acteur[]; orgId: string }) {
  const { user } = useSession();
  const [nom, setNom] = useState("");
  const [organisme, setOrganisme] = useState("");
  const [fonction, setFonction] = useState("");

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    await enregistrer("acteurs", { ...nouvelleLigne(orgId), nom: nom.trim(), organisme: organisme.trim(), fonction: fonction.trim(), user_id: null });
    setNom("");
    setOrganisme("");
    setFonction("");
  }

  const externes = acteurs.filter((a) => !a.user_id);
  return (
    <section aria-labelledby="h-acteurs" className="carte flex flex-col gap-4 p-5 md:p-6">
      <h2 id="h-acteurs" className="text-lg font-semibold">Acteurs</h2>
      <p className="text-sm text-encre-2">
        Les membres de l&apos;équipe apparaissent d&apos;office{user ? "" : " une fois l'organisation créée"}. Ajoute ici les acteurs sans compte : maître d&apos;ouvrage, géomètre expert, service du cadastre, riverains. Ils servent à tous les chantiers de l&apos;organisation.
      </p>
      {externes.length > 0 && (
        <ul className="flex flex-col divide-y divide-bord rounded-md border border-bord">
          {externes.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
              <span>
                <strong>{a.nom}</strong>
                <span className="text-encre-2">{[a.fonction, a.organisme].filter(Boolean).map((v) => ` · ${v}`).join("")}</span>
              </span>
              <button
                type="button"
                className="text-sm text-erreur underline"
                onClick={() => confirm(`Retirer ${a.nom} de la matrice ?`) && enregistrer("acteurs", { ...a, supprime: true })}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={ajouter} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className="etiquette">Nom
          <input className="champ font-normal" required maxLength={120} value={nom} onChange={(e) => setNom(e.target.value)} />
        </label>
        <label className="etiquette">Organisme
          <input className="champ font-normal" maxLength={120} value={organisme} onChange={(e) => setOrganisme(e.target.value)} />
        </label>
        <label className="etiquette">Fonction
          <input className="champ font-normal" maxLength={120} value={fonction} onChange={(e) => setFonction(e.target.value)} />
        </label>
        <button type="submit" className="bouton-secondaire">Ajouter</button>
      </form>
    </section>
  );
}
