import type { TableSync } from "@geotopo/metier";

// Description de chaque table synchronisée. Seules ces colonnes peuvent être écrites par un appareil :
// server_updated_at (curseur) et cree_par (auteur) sont posés par le serveur.
// parents : chaque référence doit viser une ligne de la même organisation.
type Def = { colonnes: string[]; parents: { colonne: string; table: TableSync }[] };

const COMMUNES = ["id", "org_id", "supprime", "updated_at"];

export const TABLES: Record<TableSync, Def> = {
  chantiers: {
    colonnes: [
      ...COMMUNES, "nom", "lieu", "client", "referentiel", "nature", "methode", "appareil", "appareil_modele", "etalonnage_le",
      "classe", "tolerance_cm", "coef_tolerance", "systeme_coord", "type_controle", "controle_par", "verdict", "valide_par", "valide_le",
    ],
    parents: [],
  },
  acteurs: { colonnes: [...COMMUNES, "nom", "organisme", "fonction", "user_id"], parents: [] },
  points: {
    colonnes: [...COMMUNES, "chantier_id", "code", "phase", "systeme", "a", "b", "c", "observation", "mesure_le"],
    parents: [{ colonne: "chantier_id", table: "chantiers" }],
  },
  taches: {
    colonnes: [...COMMUNES, "chantier_id", "titre", "debut", "fin", "avancement", "jalon", "ordre", "cle_modele"],
    parents: [{ colonne: "chantier_id", table: "chantiers" }],
  },
  dependances: {
    colonnes: [...COMMUNES, "tache_id", "depend_de"],
    parents: [
      { colonne: "tache_id", table: "taches" },
      { colonne: "depend_de", table: "taches" },
    ],
  },
  raci: {
    colonnes: [...COMMUNES, "tache_id", "acteur_id", "lettre"],
    parents: [
      { colonne: "tache_id", table: "taches" },
      { colonne: "acteur_id", table: "acteurs" },
    ],
  },
  objectifs: { colonnes: [...COMMUNES, "chantier_id", "libelle", "ordre"], parents: [{ colonne: "chantier_id", table: "chantiers" }] },
  indicateurs: {
    colonnes: [
      ...COMMUNES, "objectif_id", "libelle", "unite", "reference", "cible", "sens", "mode", "cle_auto", "realise", "source_verification", "ordre",
    ],
    parents: [{ colonne: "objectif_id", table: "objectifs" }],
  },
};

// Colonnes de validation d'un contrôle : seuls le chef et le contrôleur les modifient
export const COLONNES_VALIDATION = ["verdict", "valide_par", "valide_le"];
