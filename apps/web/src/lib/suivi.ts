import { atteinte, avancementPondere, avancementPrevu, calculerAuto, jourIso, retardJours, type ResultatControle } from "@geotopo/metier";
import type { Indicateur, Tache } from "./db";

export type Suivi = { avancement: number | null; prevu: number | null; retard: number; atteinte: number | null };
export type IndicateurMesure = { indicateur: Indicateur; realise: number | null; pct: number | null };

// Valeur réalisée et atteinte de chaque indicateur d'un chantier (les indicateurs « auto » sont calculés)
export function mesurerIndicateurs(r: ResultatControle, taches: Tache[], indicateurs: Indicateur[], aujourdhui = jourIso()): IndicateurMesure[] {
  const donnees = { ecarts: r.ecarts, emq: r.emq, borne: r.borne, taches, aujourdhui };
  return indicateurs.map((i) => {
    const realise = i.mode === "auto" ? calculerAuto(i.cle_auto, donnees) : i.realise;
    return { indicateur: i, realise, pct: atteinte(i, realise) };
  });
}

export const moyenne = (v: (number | null)[]) => {
  const l = v.filter((x): x is number => x != null);
  return l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
};

// Vue d'ensemble d'un chantier pour le tableau de bord : planning et indicateurs de résultats
export function suiviChantier(r: ResultatControle, taches: Tache[], indicateurs: Indicateur[], aujourdhui = jourIso()): Suivi {
  return {
    avancement: avancementPondere(taches),
    prevu: avancementPrevu(taches, aujourdhui),
    retard: retardJours(taches, aujourdhui),
    atteinte: moyenne(mesurerIndicateurs(r, taches, indicateurs, aujourdhui).map((m) => m.pct)),
  };
}
