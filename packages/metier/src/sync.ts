// Tables synchronisées, dans l'ordre d'envoi : un parent passe toujours avant ses enfants
export const TABLES_SYNC = ["chantiers", "acteurs", "points", "taches", "dependances", "raci", "objectifs", "indicateurs"] as const;
export type TableSync = (typeof TABLES_SYNC)[number];

// Taille maximale d'un lot envoyé ou reçu
export const LOT_ENVOI = 200;
export const LOT_RECEPTION = 1000;

export type ResultatEnvoi = { acceptees: string[]; rejetees: { id: string; motif: string }[] };
export type ResultatReception = { lignes: Record<string, unknown>[]; curseur: string | null };
