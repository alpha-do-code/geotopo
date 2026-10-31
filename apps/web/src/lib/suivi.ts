import { atteinte, avancementPondere, avancementPrevu, calculerAuto, jourIso, retardJours, type ResultatControle } from "@geotopo/metier";
import type { Indicateur, Tache } from "./db";

export type Suivi = { avancement: number | null; prevu: number | null; retard: number; atteinte: number | null };

// Vue d'ensemble d'un chantier pour le tableau de bord : planning et indicateurs de résultats
export function suiviChantier(r: ResultatControle, taches: Tache[], indicateurs: Indicateur[], aujourdhui = jourIso()): Suivi {
  const donnees = { ecarts: r.ecarts, emq: r.emq, borne: r.borne, taches, aujourdhui };
  const atteintes = indicateurs
    .map((i) => atteinte(i, i.mode === "auto" ? calculerAuto(i.cle_auto, donnees) : i.realise))
    .filter((v): v is number => v != null);
  return {
    avancement: avancementPondere(taches),
    prevu: avancementPrevu(taches, aujourdhui),
    retard: retardJours(taches, aujourdhui),
    atteinte: atteintes.length ? atteintes.reduce((a, b) => a + b, 0) / atteintes.length : null,
  };
}
