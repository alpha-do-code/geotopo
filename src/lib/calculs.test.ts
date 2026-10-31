import { describe, expect, it } from "vitest";
import { compatibilite, evaluerControle, lireCsv, lireNombre, type Mesure } from "./calculs";

const m = (code: string, a: number, b: number, c: number, systeme: "ENH" | "XYZ" = "ENH"): Mesure => ({ code, systeme, a, b, c });

describe("evaluerControle", () => {
  it("calcule l'écart planimétrique en ENH, sans l'altitude", () => {
    const r = evaluerControle([m("B1", 100, 200, 10)], [m("B1", 100.03, 200.04, 10.5)], 2, null, 2.5);
    expect(r.ecarts[0].ecart).toBeCloseTo(5, 6); // 3-4-5 cm, dH ignoré
    expect(r.ecarts[0].dc).toBeCloseTo(50, 6);
  });

  it("calcule l'écart 3D en XYZ", () => {
    const r = evaluerControle([m("B1", 0, 0, 0, "XYZ")], [m("B1", 0.02, 0.03, 0.06, "XYZ")], 3, null, 2.5);
    expect(r.ecarts[0].ecart).toBeCloseTo(7, 6); // √(4+9+36)
  });

  it("déclare conforme quand EMQ ≤ borne et aucun écart hors tolérance", () => {
    const r = evaluerControle(
      [m("B1", 0, 0, 0), m("B2", 0, 0, 0)],
      [m("B1", 0.01, 0, 0), m("B2", 0, 0.02, 0)],
      1, // 1 à 3 cm
      null,
      2.5,
    );
    expect(r.emq).toBeCloseTo(Math.sqrt((1 + 4) / 2), 4);
    expect(r.verdict).toBe("conforme");
  });

  it("refuse quand l'EMQ dépasse la borne de la classe", () => {
    const r = evaluerControle([m("B1", 0, 0, 0)], [m("B1", 0.04, 0, 0)], 1, null, 2.5);
    expect(r.verdict).toBe("non_conforme");
    expect(r.motifs[0]).toContain("EMQ");
  });

  it("refuse un point au-delà de coef × borne même si l'EMQ passe", () => {
    const leves = Array.from({ length: 10 }, (_, i) => m(`P${i}`, 0, 0, 0));
    const controles = leves.map((p, i) => (i === 0 ? m(p.code, 0.08, 0, 0) : m(p.code, 0, 0, 0)));
    const r = evaluerControle(leves, controles, 1, null, 2.5); // tolérance 7,5 cm, EMQ ≈ 2,53
    expect(r.emq!).toBeLessThan(3);
    expect(r.verdict).toBe("non_conforme");
    expect(r.ecarts[0].dansTolerance).toBe(false);
  });

  it("prend la tolérance du cahier des charges quand elle est saisie", () => {
    const r = evaluerControle([m("B1", 0, 0, 0)], [m("B1", 0.04, 0, 0)], 1, 5, 2.5);
    expect(r.borne).toBe(5);
    expect(r.verdict).toBe("conforme");
  });

  it("reste incomplet pour la classe > 50 cm sans tolérance saisie", () => {
    const r = evaluerControle([m("B1", 0, 0, 0)], [m("B1", 1, 0, 0)], 5, null, 2.5);
    expect(r.verdict).toBe("incomplet");
  });

  it("apparie les codes sans tenir compte de la casse et signale les manques", () => {
    const r = evaluerControle(
      [m("b1", 0, 0, 0), m("B2", 0, 0, 0), m("B3", 0, 0, 0)],
      [m("B1", 0, 0, 0), m("B3", 0, 0, 0, "XYZ")],
      1,
      null,
      2.5,
    );
    expect(r.ecarts.map((e) => e.code)).toEqual(["b1"]);
    expect(r.sansControle).toEqual(["B2"]);
    expect(r.systemesDifferents).toEqual(["B3"]);
  });

  it("reste incomplet sans aucun point contrôlé", () => {
    expect(evaluerControle([m("B1", 0, 0, 0)], [], 1, null, 2.5).verdict).toBe("incomplet");
  });
});

describe("compatibilite", () => {
  it("signale qu'un drone n'atteint pas la classe < 1 cm", () => {
    expect(compatibilite("photogrammetrie_drone", 0).niveau).toBe(0);
    expect(compatibilite("gnss_statique", 0).niveau).toBe(2);
  });
});

describe("saisie", () => {
  it("lit les nombres à la française", () => {
    expect(lireNombre("1 234,567")).toBe(1234.567);
    expect(lireNombre("-0.5")).toBe(-0.5);
    expect(lireNombre("abc")).toBeNull();
    expect(lireNombre("")).toBeNull();
  });

  it("lit un CSV avec en-tête, point-virgule et décimales à virgule", () => {
    const { lignes, erreurs } = lireCsv("code;E;N;H\nB1;1000,12;2000,5;12,3;borne\n\nB2;1;2;x\n");
    expect(lignes).toEqual([{ code: "B1", a: 1000.12, b: 2000.5, c: 12.3, observation: "borne" }]);
    expect(erreurs).toHaveLength(1);
  });
});
