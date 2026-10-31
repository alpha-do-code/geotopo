"use client";

import { planifierModele, type Nature } from "@geotopo/metier";
import { useLiveQuery } from "dexie-react-hooks";
import { db, enregistrer, idDerive, type Acteur, type Chantier, type Dependance, type Indicateur, type Objectif, type Raci, type Tache } from "@/lib/db";

const parOrdre = <T extends { ordre: number }>(a: T, b: T) => a.ordre - b.ordre;

// Tout ce que les volets de gestion lisent pour un chantier, tenu à jour en direct
export function useGestion(c: Chantier) {
  const taches = useLiveQuery(
    () => db.taches.where("chantier_id").equals(c.id).filter((t) => !t.supprime).toArray().then((l) => l.sort((a, b) => a.ordre - b.ordre || a.debut.localeCompare(b.debut))),
    [c.id],
  );
  const ids = taches?.map((t) => t.id) ?? [];
  const cle = ids.join(",");
  const dependances = useLiveQuery(() => db.dependances.where("tache_id").anyOf(ids).filter((d) => !d.supprime).toArray(), [cle]);
  const raci = useLiveQuery(() => db.raci.where("tache_id").anyOf(ids).filter((r) => !r.supprime).toArray(), [cle]);
  const acteurs = useLiveQuery(
    () => db.acteurs.where("org_id").equals(c.org_id).filter((a) => !a.supprime).toArray().then((l) => l.sort((a, b) => Number(!!b.user_id) - Number(!!a.user_id) || a.nom.localeCompare(b.nom, "fr"))),
    [c.org_id],
  );
  const objectifs = useLiveQuery(() => db.objectifs.where("chantier_id").equals(c.id).filter((o) => !o.supprime).toArray().then((l) => l.sort(parOrdre)), [c.id]);
  const idsObj = objectifs?.map((o) => o.id) ?? [];
  const indicateurs = useLiveQuery(
    () => db.indicateurs.where("objectif_id").anyOf(idsObj).filter((i) => !i.supprime).toArray().then((l) => l.sort(parOrdre)),
    [idsObj.join(",")],
  );
  return { taches, dependances, raci, acteurs, objectifs, indicateurs };
}

// Champs communs à toute nouvelle ligne synchronisée
export const nouvelleLigne = (orgId: string) => ({ id: crypto.randomUUID(), org_id: orgId, supprime: false, updated_at: "", sale: 1 as const });

export async function appliquerModele(c: Chantier, nature: Nature, debut: string, ordreDepart: number) {
  const plan = planifierModele(nature, debut);
  const ids = new Map<string, string>();
  for (const e of plan) {
    const t: Tache = { ...nouvelleLigne(c.org_id), chantier_id: c.id, titre: e.titre, debut: e.debut, fin: e.fin, avancement: 0, jalon: e.jalon, ordre: ordreDepart + e.ordre, cle_modele: e.cle };
    ids.set(e.cle, t.id);
    await enregistrer("taches", t);
  }
  for (const e of plan) {
    if (!e.apres) continue;
    await definirDependance(c.org_id, ids.get(e.cle)!, ids.get(e.apres)!);
  }
}

// Une tâche du planning dépend au plus d'une autre (choix « après ») ; l'identifiant est dérivé du couple
export async function definirDependance(orgId: string, tacheId: string, dependDe: string | null, existantes: Dependance[] = []) {
  for (const d of existantes) if (d.tache_id === tacheId && d.depend_de !== dependDe) await enregistrer("dependances", { ...d, supprime: true });
  if (!dependDe) return;
  const id = await idDerive(tacheId, dependDe);
  const actuelle = await db.dependances.get(id);
  await enregistrer("dependances", { ...(actuelle ?? nouvelleLigne(orgId)), id, tache_id: tacheId, depend_de: dependDe, supprime: false });
}

const CYCLE_RACI: (Raci["lettre"] | null)[] = [null, "R", "A", "C", "I"];
let fileRaci: Promise<unknown> = Promise.resolve();

// Fait passer une case de la matrice à la lettre suivante (vide → R → A → C → I → vide).
// La lettre actuelle est lue en base et les touches sont traitées une par une :
// deux touches rapides donnent bien deux crans, même avant le rafraîchissement de l'écran.
export function cyclerLettre(orgId: string, tacheId: string, acteurId: string) {
  fileRaci = fileRaci.then(async () => {
    const id = await idDerive(tacheId, acteurId);
    const actuelle = await db.raci.get(id);
    const lettre = actuelle && !actuelle.supprime ? actuelle.lettre : null;
    const suivante = CYCLE_RACI[(CYCLE_RACI.indexOf(lettre) + 1) % CYCLE_RACI.length];
    if (!suivante) {
      if (actuelle) await enregistrer("raci", { ...actuelle, supprime: true });
      return;
    }
    await enregistrer("raci", { ...(actuelle ?? nouvelleLigne(orgId)), id, tache_id: tacheId, acteur_id: acteurId, lettre: suivante, supprime: false });
  });
  return fileRaci;
}

export type { Acteur, Dependance, Indicateur, Objectif, Raci, Tache };
