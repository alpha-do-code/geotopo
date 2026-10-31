import { CLASSES, MATRICE, type Methode, type Systeme } from "./referentiels";

// Un point mesuré, coordonnées en mètres dans son système
export type Mesure = { code: string; systeme: Systeme; a: number; b: number; c: number };

export type Ecart = {
  code: string;
  da: number; // cm
  db: number;
  dc: number;
  ecart: number; // cm, plani en ENH, 3D en XYZ
  dansTolerance: boolean;
};

export type ResultatControle = {
  ecarts: Ecart[];
  sansControle: string[]; // points levés non encore contrôlés
  systemesDifferents: string[]; // levé et contrôle dans deux systèmes : non comparables en v1
  emq: number | null;
  ecartMax: number | null;
  borne: number | null; // cm, borne de la classe ou tolérance du cahier des charges
  tolerance: number | null; // cm, coef × borne
  verdict: "conforme" | "non_conforme" | "incomplet";
  motifs: string[];
};

const arrondi = (v: number) => Math.round(v * 10000) / 10000;

// Borne utilisée pour juger : la tolérance du cahier des charges si elle est saisie, sinon la classe
export function borneClasse(classe: number, toleranceCm: number | null): number | null {
  if (toleranceCm != null && toleranceCm > 0) return toleranceCm;
  return CLASSES[classe]?.max ?? null;
}

export function ecartPoint(leve: Mesure, controle: Mesure): Omit<Ecart, "dansTolerance"> {
  const da = (controle.a - leve.a) * 100;
  const db = (controle.b - leve.b) * 100;
  const dc = (controle.c - leve.c) * 100;
  const ecart = leve.systeme === "XYZ" ? Math.hypot(da, db, dc) : Math.hypot(da, db);
  return { code: leve.code, da: arrondi(da), db: arrondi(db), dc: arrondi(dc), ecart: arrondi(ecart) };
}

// Apparie levé et contrôle par code de point (le dernier relevé de chaque code fait foi),
// puis applique la règle : EMQ ≤ borne et aucun écart > coef × borne.
export function evaluerControle(
  leves: Mesure[],
  controles: Mesure[],
  classe: number,
  toleranceCm: number | null,
  coef: number,
): ResultatControle {
  const parCode = (l: Mesure[]) => new Map(l.map((m) => [m.code.trim().toUpperCase(), m]));
  const mapLeves = parCode(leves);
  const mapControles = parCode(controles);
  const borne = borneClasse(classe, toleranceCm);
  const tolerance = borne == null ? null : arrondi(coef * borne);

  const ecarts: Ecart[] = [];
  const sansControle: string[] = [];
  const systemesDifferents: string[] = [];
  for (const [code, leve] of mapLeves) {
    const ctl = mapControles.get(code);
    if (!ctl) {
      sansControle.push(leve.code);
      continue;
    }
    if (ctl.systeme !== leve.systeme) {
      systemesDifferents.push(leve.code);
      continue;
    }
    const e = ecartPoint(leve, ctl);
    ecarts.push({ ...e, dansTolerance: tolerance == null ? true : e.ecart <= tolerance });
  }

  const motifs: string[] = [];
  if (ecarts.length === 0) {
    motifs.push("Aucun point contrôlé.");
    return { ecarts, sansControle, systemesDifferents, emq: null, ecartMax: null, borne, tolerance, verdict: "incomplet", motifs };
  }
  const emq = arrondi(Math.sqrt(ecarts.reduce((s, e) => s + e.ecart * e.ecart, 0) / ecarts.length));
  const ecartMax = Math.max(...ecarts.map((e) => e.ecart));
  if (borne == null) {
    motifs.push("Classe > 50 cm : saisir la tolérance du cahier des charges.");
    return { ecarts, sansControle, systemesDifferents, emq, ecartMax, borne, tolerance, verdict: "incomplet", motifs };
  }
  const horsTol = ecarts.filter((e) => !e.dansTolerance).length;
  if (emq > borne) motifs.push(`EMQ ${formatCm(emq)} cm supérieur à la borne ${formatCm(borne)} cm.`);
  if (horsTol) motifs.push(`${horsTol} point(s) au-delà de la tolérance ${formatCm(tolerance!)} cm.`);
  return {
    ecarts,
    sansControle,
    systemesDifferents,
    emq,
    ecartMax,
    borne,
    tolerance,
    verdict: motifs.length ? "non_conforme" : "conforme",
    motifs,
  };
}

export type Compatibilite = { niveau: 0 | 1 | 2; meilleure: number };

export function compatibilite(methode: Methode, classe: number): Compatibilite {
  const ligne = MATRICE[methode];
  return { niveau: ligne[classe] as 0 | 1 | 2, meilleure: ligne.findIndex((v) => v === 2) };
}

export function formatCm(v: number, decimales = 1): string {
  return v.toFixed(decimales).replace(".", ",");
}

// Lecture d'un nombre saisi à la française ou à l'anglaise
export function lireNombre(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "" || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

// Import CSV : code;a;b;c[;observation], séparateur ; , ou tabulation, en-tête facultatif
export function lireCsv(texte: string): { lignes: { code: string; a: number; b: number; c: number; observation: string }[]; erreurs: string[] } {
  const lignes: { code: string; a: number; b: number; c: number; observation: string }[] = [];
  const erreurs: string[] = [];
  texte.split(/\r?\n/).forEach((brut, i) => {
    const ligne = brut.trim();
    if (!ligne) return;
    const sep = ligne.includes(";") ? ";" : ligne.includes("\t") ? "\t" : ",";
    const champs = ligne.split(sep).map((c) => c.trim());
    const [code, sa, sb, sc, ...reste] = champs;
    const a = lireNombre(sa ?? ""), b = lireNombre(sb ?? ""), c = lireNombre(sc ?? "");
    if (a == null || b == null || c == null || !code) {
      if (i === 0) return; // en-tête
      erreurs.push(`Ligne ${i + 1} ignorée : « ${ligne.slice(0, 60)} »`);
      return;
    }
    lignes.push({ code: code.slice(0, 60), a, b, c, observation: reste.join(" ").slice(0, 1000) });
  });
  return { lignes, erreurs };
}
