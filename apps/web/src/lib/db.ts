import Dexie, { type EntityTable } from "dexie";
import { TABLES_SYNC, type Appareil, type LettreRaci, type ControlePar, type Methode, type Nature, type Referentiel, type Systeme, type TypeControle } from "@geotopo/metier";

// Organisation des données saisies avant toute connexion. Elles rejoignent la vraie
// organisation au moment où l'utilisateur en crée une ou en rejoint une.
export const ORG_LOCALE = "00000000-0000-0000-0000-000000000000";

export type Chantier = {
  id: string;
  org_id: string;
  nom: string;
  lieu: string;
  client: string;
  referentiel: Referentiel;
  nature: Nature;
  methode: Methode;
  appareil: Appareil;
  appareil_modele: string;
  etalonnage_le: string | null;
  classe: number;
  tolerance_cm: number | null;
  coef_tolerance: number;
  systeme_coord: Systeme;
  type_controle: TypeControle;
  controle_par: ControlePar;
  verdict: "conforme" | "non_conforme" | null;
  valide_par: string | null;
  valide_le: string | null;
  supprime: boolean;
  updated_at: string;
  server_updated_at?: string;
  sale: 0 | 1; // 1 = modifié sur l'appareil, pas encore envoyé
};

export type Point = {
  id: string;
  org_id: string;
  chantier_id: string;
  code: string;
  phase: "leve" | "controle";
  systeme: Systeme;
  a: number;
  b: number;
  c: number;
  observation: string;
  mesure_le: string;
  supprime: boolean;
  updated_at: string;
  server_updated_at?: string;
  sale: 0 | 1;
};

// ── Module de gestion ────────────────────────────────────────────────────────

type Synchro = { id: string; org_id: string; supprime: boolean; updated_at: string; server_updated_at?: string; sale: 0 | 1 };

export type Tache = Synchro & {
  chantier_id: string;
  titre: string;
  debut: string; // AAAA-MM-JJ
  fin: string;
  avancement: number; // 0 à 100
  jalon: boolean;
  ordre: number;
  cle_modele: string; // étape du modèle de tâches (« controle » se met à jour avec la validation)
};

// La tâche tache_id ne commence qu'après la fin de depend_de
export type Dependance = Synchro & { tache_id: string; depend_de: string };

// Personne de la matrice RACI : membre (user_id) ou externe sans compte
export type Acteur = Synchro & { nom: string; organisme: string; fonction: string; user_id: string | null };


export type Raci = Synchro & { tache_id: string; acteur_id: string; lettre: LettreRaci };

export type Objectif = Synchro & { chantier_id: string; libelle: string; ordre: number };

export type Indicateur = Synchro & {
  objectif_id: string;
  libelle: string;
  unite: string;
  reference: number | null;
  cible: number;
  sens: "hausse" | "baisse";
  mode: "manuel" | "auto";
  cle_auto: string;
  realise: number | null;
  source_verification: string;
  ordre: number;
};

export type Meta = { cle: string; valeur: string };

export class BaseLocale extends Dexie {
  chantiers!: EntityTable<Chantier, "id">;
  points!: EntityTable<Point, "id">;
  taches!: EntityTable<Tache, "id">;
  dependances!: EntityTable<Dependance, "id">;
  acteurs!: EntityTable<Acteur, "id">;
  raci!: EntityTable<Raci, "id">;
  objectifs!: EntityTable<Objectif, "id">;
  indicateurs!: EntityTable<Indicateur, "id">;
  meta!: EntityTable<Meta, "cle">;

  constructor(nom = "geotopo") {
    super(nom);
    this.version(1).stores({
      chantiers: "id, org_id, sale, updated_at",
      points: "id, chantier_id, org_id, sale, [chantier_id+phase]",
      meta: "cle",
    });
    this.version(2).stores({
      taches: "id, chantier_id, org_id, sale",
      dependances: "id, tache_id, org_id, sale",
      acteurs: "id, org_id, sale",
      raci: "id, tache_id, org_id, sale",
      objectifs: "id, chantier_id, org_id, sale",
      indicateurs: "id, objectif_id, org_id, sale",
    });
  }
}

export const db = new BaseLocale();

export async function lireMeta(cle: string, base: BaseLocale = db): Promise<string | null> {
  return (await base.meta.get(cle))?.valeur ?? null;
}

export async function ecrireMeta(cle: string, valeur: string | null, base: BaseLocale = db) {
  if (valeur == null) await base.meta.delete(cle);
  else await base.meta.put({ cle, valeur });
}

export const maintenant = () => new Date().toISOString();

export function nouveauChantier(orgId: string): Chantier {
  return {
    id: crypto.randomUUID(),
    org_id: orgId,
    nom: "",
    lieu: "",
    client: "",
    referentiel: "CDC",
    nature: "leves_implantations",
    methode: "gnss_rtk",
    appareil: "gnss",
    appareil_modele: "",
    etalonnage_le: null,
    classe: 1,
    tolerance_cm: null,
    coef_tolerance: 2.5,
    systeme_coord: "ENH",
    type_controle: "points_connus",
    controle_par: "bureau",
    verdict: null,
    valide_par: null,
    valide_le: null,
    supprime: false,
    updated_at: maintenant(),
    sale: 1,
  };
}

// Toute écriture locale passe par ici : horodatage et marquage « à envoyer »
export async function enregistrerChantier(c: Chantier, base: BaseLocale = db) {
  await base.chantiers.put({ ...c, updated_at: maintenant(), sale: 1 });
}

export async function enregistrerPoint(p: Point, base: BaseLocale = db) {
  await base.points.put({ ...p, updated_at: maintenant(), sale: 1 });
}

type Lignes = { taches: Tache; dependances: Dependance; acteurs: Acteur; raci: Raci; objectifs: Objectif; indicateurs: Indicateur };

export async function enregistrer<T extends keyof Lignes>(table: T, ligne: Lignes[T], base: BaseLocale = db) {
  await (base[table] as unknown as EntityTable<Lignes[T], "id">).put({ ...ligne, updated_at: maintenant(), sale: 1 });
}

// Identifiant tiré de deux autres : deux appareils qui posent la même lettre RACI ou la même
// dépendance hors ligne produisent la même ligne, et la plus récente gagne au lieu d'un doublon.
export async function idDerive(a: string, b: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${a}:${b}`))).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h].map((o) => o.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// Rattache les saisies faites hors compte à l'organisation choisie
export async function rattacherDonneesLocales(orgId: string, base: BaseLocale = db) {
  const t = maintenant();
  const tables = TABLES_SYNC.map((n) => base.table(n));
  await base.transaction("rw", tables, async () => {
    for (const table of tables) await table.where("org_id").equals(ORG_LOCALE).modify({ org_id: orgId, updated_at: t, sale: 1 });
  });
}

// Efface toutes les données de l'appareil (déconnexion d'un appareil partagé)
export async function viderBaseLocale(base: BaseLocale = db) {
  await base.transaction("rw", [...TABLES_SYNC.map((n) => base.table(n)), base.meta], async () => {
    for (const n of TABLES_SYNC) await base.table(n).clear();
    await base.meta.clear();
  });
}
