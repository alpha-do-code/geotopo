import { describe, expect, it } from "vitest";
import {
  ajouterJours, atteinte, avancementPondere, avancementPrevu, calculerAuto, conflitsDependances, dureeJours, echeancesTenues,
  ecartJours, MODELES_TACHES, planifierModele, retardJours, verifierRaci,
} from "./gestion.js";

describe("dates", () => {
  it("compte les jours sans dépendre du fuseau ni de l'heure d'été", () => {
    expect(ajouterJours("2026-02-27", 2)).toBe("2026-03-01");
    expect(ecartJours("2026-03-28", "2026-03-30")).toBe(2);
    expect(dureeJours({ debut: "2026-11-02", fin: "2026-11-04" })).toBe(3);
    expect(dureeJours({ debut: "2026-11-02", fin: "2026-11-02" })).toBe(1);
  });
});

describe("modèles de tâches", () => {
  it("enchaîne les étapes du bornage, le contrôle est un jalon", () => {
    const p = planifierModele("bornage", "2026-11-02");
    expect(p.map((t) => [t.cle, t.debut, t.fin])).toEqual([
      ["reconnaissance", "2026-11-02", "2026-11-02"],
      ["documents", "2026-11-03", "2026-11-04"],
      ["leve", "2026-11-05", "2026-11-06"],
      ["calculs", "2026-11-07", "2026-11-08"],
      ["controle", "2026-11-09", "2026-11-09"],
      ["pv", "2026-11-10", "2026-11-10"],
      ["depot", "2026-11-11", "2026-11-11"],
    ]);
    expect(p.find((t) => t.cle === "controle")).toMatchObject({ jalon: true, apres: "calculs" });
    expect(p[0].apres).toBeNull();
  });

  it("chaque nature a une étape de contrôle (reliée à la validation)", () => {
    for (const etapes of Object.values(MODELES_TACHES)) expect(etapes.some((e) => e.cle === "controle")).toBe(true);
  });
});

describe("suivi du planning", () => {
  const taches = [
    { debut: "2026-11-02", fin: "2026-11-04", avancement: 100 }, // 3 j
    { debut: "2026-11-05", fin: "2026-11-05", avancement: 0 }, // 1 j
  ];

  it("avancement pondéré par la durée", () => {
    expect(avancementPondere(taches)).toBe(75);
    expect(avancementPondere([])).toBeNull();
  });

  it("avancement prévu à une date", () => {
    expect(avancementPrevu(taches, "2026-11-01")).toBe(0);
    expect(avancementPrevu(taches, "2026-11-03")).toBe(50);
    expect(avancementPrevu(taches, "2026-11-30")).toBe(100);
  });

  it("retard et échéances tenues", () => {
    expect(retardJours(taches, "2026-11-05")).toBe(0);
    expect(retardJours(taches, "2026-11-08")).toBe(3);
    expect(echeancesTenues(taches, "2026-11-05")).toBe(100);
    expect(echeancesTenues(taches, "2026-11-08")).toBe(50);
    expect(echeancesTenues(taches, "2026-11-01")).toBeNull();
  });

  it("signale une tâche qui commence avant la fin de celle dont elle dépend", () => {
    const t = [
      { id: "a", debut: "2026-11-02", fin: "2026-11-04" },
      { id: "b", debut: "2026-11-04", fin: "2026-11-05" },
      { id: "c", debut: "2026-11-06", fin: "2026-11-06" },
    ];
    expect(conflitsDependances(t, [{ tache_id: "b", depend_de: "a" }, { tache_id: "c", depend_de: "b" }])).toEqual([{ tache_id: "b", depend_de: "a", jours: 1 }]);
  });
});

describe("matrice RACI", () => {
  const taches = [{ id: "t1", titre: "Levé" }, { id: "t2", titre: "PV" }, { id: "t3", titre: "Dépôt" }];
  it("exige exactement un A et au moins un R", () => {
    const alertes = verifierRaci(taches, [
      { tache_id: "t1", lettre: "R" }, { tache_id: "t1", lettre: "A" }, { tache_id: "t1", lettre: "I" },
      { tache_id: "t2", lettre: "A" }, { tache_id: "t2", lettre: "A" }, { tache_id: "t2", lettre: "R" },
      { tache_id: "t3", lettre: "C" },
    ]);
    expect(alertes.map((a) => [a.tache_id, a.message])).toEqual([
      ["t2", "« PV » : 2 personnes approuvent (A), une seule doit rendre des comptes."],
      ["t3", "« Dépôt » : personne n'approuve (A)."],
      ["t3", "« Dépôt » : personne ne réalise (R)."],
    ]);
  });
});

describe("indicateurs", () => {
  it("atteinte d'un indicateur à la hausse", () => {
    expect(atteinte({ reference: null, cible: 100, sens: "hausse" }, 80)).toBe(80);
    expect(atteinte({ reference: 60, cible: 100, sens: "hausse" }, 80)).toBe(50);
    expect(atteinte({ reference: 60, cible: 100, sens: "hausse" }, 50)).toBe(0);
    expect(atteinte({ reference: 60, cible: 100, sens: "hausse" }, 120)).toBe(100);
    expect(atteinte({ reference: null, cible: 100, sens: "hausse" }, null)).toBeNull();
  });

  it("atteinte d'un indicateur à la baisse", () => {
    expect(atteinte({ reference: null, cible: 0, sens: "baisse" }, 0)).toBe(100);
    expect(atteinte({ reference: null, cible: 0, sens: "baisse" }, 3)).toBe(0);
    expect(atteinte({ reference: 10, cible: 0, sens: "baisse" }, 4)).toBe(60);
    expect(atteinte({ reference: null, cible: 100, sens: "baisse" }, 125)).toBe(80);
  });

  it("calcule les indicateurs automatiques depuis le contrôle et le planning", () => {
    const d = {
      ecarts: [{ dansTolerance: true }, { dansTolerance: true }, { dansTolerance: false }, { dansTolerance: true }],
      emq: 1.5,
      borne: 3,
      taches: [{ debut: "2026-11-02", fin: "2026-11-03", avancement: 50 }],
      aujourdhui: "2026-11-06",
    };
    expect(calculerAuto("taux_conformite", d)).toBe(75);
    expect(calculerAuto("emq_classe", d)).toBe(50);
    expect(calculerAuto("avancement", d)).toBe(50);
    expect(calculerAuto("echeances_tenues", d)).toBe(0);
    expect(calculerAuto("retard_jours", d)).toBe(3);
    expect(calculerAuto("inconnu", d)).toBeNull();
    expect(calculerAuto("taux_conformite", { ...d, ecarts: [] })).toBeNull();
  });
});
