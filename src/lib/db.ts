import Dexie, { type EntityTable } from "dexie";
import type { Appareil, ControlePar, Methode, Nature, Referentiel, Systeme, TypeControle } from "./referentiels";

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

export type Meta = { cle: string; valeur: string };

export class BaseLocale extends Dexie {
  chantiers!: EntityTable<Chantier, "id">;
  points!: EntityTable<Point, "id">;
  meta!: EntityTable<Meta, "cle">;

  constructor(nom = "geotopo") {
    super(nom);
    this.version(1).stores({
      chantiers: "id, org_id, sale, updated_at",
      points: "id, chantier_id, org_id, sale, [chantier_id+phase]",
      meta: "cle",
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

// Rattache les saisies faites hors compte à l'organisation choisie
export async function rattacherDonneesLocales(orgId: string, base: BaseLocale = db) {
  const t = maintenant();
  await base.transaction("rw", base.chantiers, base.points, async () => {
    await base.chantiers.where("org_id").equals(ORG_LOCALE).modify({ org_id: orgId, updated_at: t, sale: 1 });
    await base.points.where("org_id").equals(ORG_LOCALE).modify({ org_id: orgId, updated_at: t, sale: 1 });
  });
}
