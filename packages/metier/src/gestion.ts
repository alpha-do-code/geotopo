import type { Nature } from "./referentiels.js";

// ── Dates au format AAAA-MM-JJ (jours calendaires, sans fuseau) ─────────────

const JOUR_MS = 86_400_000;
const versMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

export const jourIso = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const ajouterJours = (d: string, n: number) => new Date(versMs(d) + n * JOUR_MS).toISOString().slice(0, 10);

// Nombre de jours de a à b (b - a)
export const ecartJours = (a: string, b: string) => Math.round((versMs(b) - versMs(a)) / JOUR_MS);

// Durée d'une tâche en jours, bornes comprises (un jalon dure 1 jour pour la pondération)
export const dureeJours = (t: { debut: string; fin: string }) => Math.max(1, ecartJours(t.debut, t.fin) + 1);

// ── Modèles de tâches par nature de travaux ─────────────────────────────────

export type EtapeModele = { cle: string; titre: string; jours: number; jalon?: boolean };

export const MODELES_TACHES: Record<Nature, EtapeModele[]> = {
  bornage: [
    { cle: "reconnaissance", titre: "Reconnaissance du terrain et des limites", jours: 1 },
    { cle: "documents", titre: "Recherche des titres, plans et bornes existantes", jours: 2 },
    { cle: "leve", titre: "Levé des limites et des bornes", jours: 2 },
    { cle: "calculs", titre: "Calculs et implantation des bornes", jours: 2 },
    { cle: "controle", titre: "Contrôle de précision", jours: 1, jalon: true },
    { cle: "pv", titre: "Procès-verbal de bornage contradictoire", jours: 1 },
    { cle: "depot", titre: "Dépôt au service du cadastre", jours: 1, jalon: true },
  ],
  topo_rurale: [
    { cle: "preparation", titre: "Préparation et reconnaissance", jours: 1 },
    { cle: "canevas", titre: "Mise en place du canevas", jours: 2 },
    { cle: "leve", titre: "Levé de détail", jours: 5 },
    { cle: "calculs", titre: "Calculs et compensation", jours: 2 },
    { cle: "dessin", titre: "Dessin du plan", jours: 3 },
    { cle: "controle", titre: "Contrôle de précision", jours: 1, jalon: true },
    { cle: "livraison", titre: "Livraison du plan", jours: 1, jalon: true },
  ],
  topo_urbaine: [
    { cle: "preparation", titre: "Préparation, autorisations et reconnaissance", jours: 2 },
    { cle: "canevas", titre: "Mise en place du canevas", jours: 2 },
    { cle: "leve", titre: "Levé de détail (voirie, réseaux, bâti)", jours: 5 },
    { cle: "calculs", titre: "Calculs et compensation", jours: 2 },
    { cle: "dessin", titre: "Dessin du plan", jours: 4 },
    { cle: "controle", titre: "Contrôle de précision", jours: 1, jalon: true },
    { cle: "livraison", titre: "Livraison du plan", jours: 1, jalon: true },
  ],
  auscultation: [
    { cle: "installation", titre: "Installation des cibles et repères", jours: 2 },
    { cle: "reference", titre: "Mesure de référence (époque zéro)", jours: 1 },
    { cle: "campagnes", titre: "Campagnes de mesure", jours: 10 },
    { cle: "analyse", titre: "Analyse des déplacements", jours: 3 },
    { cle: "controle", titre: "Contrôle de précision", jours: 1, jalon: true },
    { cle: "rapport", titre: "Rapport d'auscultation", jours: 2 },
  ],
  leves_implantations: [
    { cle: "preparation", titre: "Préparation des données d'implantation", jours: 1 },
    { cle: "canevas", titre: "Calage sur le canevas", jours: 1 },
    { cle: "implantation", titre: "Levé et implantation", jours: 3 },
    { cle: "controle", titre: "Contrôle de précision", jours: 1, jalon: true },
    { cle: "pv", titre: "PV d'implantation", jours: 1 },
  ],
};

export type TachePlanifiee = { cle: string; titre: string; debut: string; fin: string; jalon: boolean; ordre: number; apres: string | null };

// Enchaîne les étapes du modèle à partir d'une date : chacune commence le lendemain de la fin de la précédente
export function planifierModele(nature: Nature, debut: string): TachePlanifiee[] {
  let jour = debut;
  let precedente: string | null = null;
  return MODELES_TACHES[nature].map((e, ordre) => {
    const fin = ajouterJours(jour, e.jalon ? 0 : e.jours - 1);
    const t = { cle: e.cle, titre: e.titre, debut: jour, fin, jalon: !!e.jalon, ordre, apres: precedente };
    precedente = e.cle;
    jour = ajouterJours(fin, 1);
    return t;
  });
}

// ── Suivi du planning ───────────────────────────────────────────────────────

type TacheSuivi = { debut: string; fin: string; avancement: number };

// Avancement réel, pondéré par la durée de chaque tâche (%)
export function avancementPondere(taches: TacheSuivi[]): number | null {
  if (!taches.length) return null;
  const total = taches.reduce((s, t) => s + dureeJours(t), 0);
  return taches.reduce((s, t) => s + dureeJours(t) * t.avancement, 0) / total;
}

// Avancement attendu à une date si le planning était tenu (%)
export function avancementPrevu(taches: TacheSuivi[], aujourdhui: string): number | null {
  if (!taches.length) return null;
  const total = taches.reduce((s, t) => s + dureeJours(t), 0);
  const fait = taches.reduce((s, t) => {
    const ecoule = Math.min(dureeJours(t), Math.max(0, ecartJours(t.debut, aujourdhui) + 1));
    return s + ecoule * 100;
  }, 0);
  return fait / total;
}

// Retard : le plus grand nombre de jours écoulés depuis l'échéance d'une tâche non terminée
export function retardJours(taches: TacheSuivi[], aujourdhui: string): number {
  return taches.reduce((max, t) => (t.avancement < 100 ? Math.max(max, ecartJours(t.fin, aujourdhui)) : max), 0);
}

// Parmi les tâches dont l'échéance est passée, part de celles terminées (%)
export function echeancesTenues(taches: TacheSuivi[], aujourdhui: string): number | null {
  const echues = taches.filter((t) => ecartJours(t.fin, aujourdhui) > 0);
  if (!echues.length) return null;
  return (echues.filter((t) => t.avancement >= 100).length / echues.length) * 100;
}

// Fin du chantier au plus tôt compte tenu des dépendances : une tâche ne commence qu'après ses précédentes.
// Renvoie les tâches dont le début prévu est antérieur à la fin d'une tâche dont elles dépendent.
export function conflitsDependances(
  taches: { id: string; debut: string; fin: string }[],
  dependances: { tache_id: string; depend_de: string }[],
): { tache_id: string; depend_de: string; jours: number }[] {
  const parId = new Map(taches.map((t) => [t.id, t]));
  return dependances.flatMap((d) => {
    const t = parId.get(d.tache_id);
    const p = parId.get(d.depend_de);
    if (!t || !p) return [];
    const jours = ecartJours(t.debut, p.fin) + 1; // > 0 : chevauchement
    return jours > 0 ? [{ tache_id: d.tache_id, depend_de: d.depend_de, jours }] : [];
  });
}

// ── Matrice RACI ────────────────────────────────────────────────────────────

export const LETTRES_RACI = {
  R: { nom: "Réalise", aide: "Fait le travail" },
  A: { nom: "Approuve", aide: "Rend des comptes et valide ; un seul par tâche" },
  C: { nom: "Consulté", aide: "Donne son avis avant" },
  I: { nom: "Informé", aide: "Est tenu au courant après" },
} as const;
export type LettreRaci = keyof typeof LETTRES_RACI;

export type AlerteRaci = { tache_id: string; message: string };

// Règles d'une matrice RACI saine : exactement un A, au moins un R
export function verifierRaci(taches: { id: string; titre: string }[], affectations: { tache_id: string; lettre: LettreRaci }[]): AlerteRaci[] {
  return taches.flatMap((t) => {
    const lettres = affectations.filter((a) => a.tache_id === t.id).map((a) => a.lettre);
    const nbA = lettres.filter((l) => l === "A").length;
    const alertes: AlerteRaci[] = [];
    if (nbA === 0) alertes.push({ tache_id: t.id, message: `« ${t.titre} » : personne n'approuve (A).` });
    if (nbA > 1) alertes.push({ tache_id: t.id, message: `« ${t.titre} » : ${nbA} personnes approuvent (A), une seule doit rendre des comptes.` });
    if (!lettres.includes("R")) alertes.push({ tache_id: t.id, message: `« ${t.titre} » : personne ne réalise (R).` });
    return alertes;
  });
}

// ── Indicateurs (gestion axée sur les résultats) ────────────────────────────

export type Sens = "hausse" | "baisse";

export const INDICATEURS_AUTO = {
  taux_conformite: { libelle: "Points contrôlés dans la tolérance", unite: "%", sens: "hausse", cible: 100, source: "Fiche de contrôle GeoTopo" },
  emq_classe: { libelle: "EMQ rapporté à la borne de la classe", unite: "%", sens: "baisse", cible: 100, source: "Fiche de contrôle GeoTopo" },
  avancement: { libelle: "Avancement pondéré par la durée", unite: "%", sens: "hausse", cible: 100, source: "Planning GeoTopo" },
  echeances_tenues: { libelle: "Échéances tenues", unite: "%", sens: "hausse", cible: 100, source: "Planning GeoTopo" },
  retard_jours: { libelle: "Retard sur le planning", unite: "j", sens: "baisse", cible: 0, source: "Planning GeoTopo" },
} as const satisfies Record<string, { libelle: string; unite: string; sens: Sens; cible: number; source: string }>;
export type CleAuto = keyof typeof INDICATEURS_AUTO;

export type DonneesAuto = {
  ecarts: { dansTolerance: boolean }[];
  emq: number | null;
  borne: number | null;
  taches: TacheSuivi[];
  aujourdhui: string;
};

export function calculerAuto(cle: string, d: DonneesAuto): number | null {
  switch (cle as CleAuto) {
    case "taux_conformite":
      return d.ecarts.length ? (d.ecarts.filter((e) => e.dansTolerance).length / d.ecarts.length) * 100 : null;
    case "emq_classe":
      return d.emq != null && d.borne ? (d.emq / d.borne) * 100 : null;
    case "avancement":
      return avancementPondere(d.taches);
    case "echeances_tenues":
      return echeancesTenues(d.taches, d.aujourdhui);
    case "retard_jours":
      return d.taches.length ? retardJours(d.taches, d.aujourdhui) : null;
    default:
      return null;
  }
}

export type NiveauAtteinte = "atteint" | "en_cours" | "a_risque";

// Part du chemin parcouru de la référence vers la cible (%), bornée entre 0 et 100.
// Sans référence : 0 pour un indicateur à la hausse ; pour un indicateur à la baisse,
// la cible est atteinte dès qu'on est en dessous.
export function atteinte(i: { reference: number | null; cible: number; sens: Sens }, realise: number | null): number | null {
  if (realise == null) return null;
  const borner = (v: number) => Math.max(0, Math.min(100, v));
  if (i.sens === "baisse") {
    if (realise <= i.cible) return 100;
    if (i.reference == null || i.reference <= i.cible) return i.cible > 0 ? borner((i.cible / realise) * 100) : 0;
    return borner(((i.reference - realise) / (i.reference - i.cible)) * 100);
  }
  const ref = i.reference ?? 0;
  if (realise >= i.cible) return 100;
  if (i.cible <= ref) return 0;
  return borner(((realise - ref) / (i.cible - ref)) * 100);
}

export const niveauAtteinte = (pct: number): NiveauAtteinte => (pct >= 100 ? "atteint" : pct >= 50 ? "en_cours" : "a_risque");
