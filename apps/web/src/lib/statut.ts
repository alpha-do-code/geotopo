import { evaluerControle, type ResultatControle } from "@geotopo/metier";
import type { Chantier, Point } from "./db";

export type Statut = "conforme" | "non_conforme" | "a_valider" | "en_cours";

export const STATUTS: Record<Statut, { label: string; classe: string }> = {
  conforme: { label: "Conforme", classe: "bg-ok-fond text-ok" },
  non_conforme: { label: "Non conforme", classe: "bg-erreur-fond text-erreur" },
  a_valider: { label: "À valider", classe: "bg-alerte-fond text-alerte" },
  en_cours: { label: "En cours", classe: "bg-info-fond text-info" },
};

export function resultatChantier(c: Chantier, points: Point[]): ResultatControle {
  const actifs = points.filter((p) => !p.supprime && p.chantier_id === c.id);
  return evaluerControle(
    actifs.filter((p) => p.phase === "leve"),
    actifs.filter((p) => p.phase === "controle"),
    c.classe,
    c.tolerance_cm,
    c.coef_tolerance,
  );
}

// Le verdict validé fait foi ; sinon, un contrôle saisi attend sa validation
export function statutChantier(c: Chantier, r: ResultatControle): Statut {
  if (c.verdict) return c.verdict;
  return r.ecarts.length ? "a_valider" : "en_cours";
}
