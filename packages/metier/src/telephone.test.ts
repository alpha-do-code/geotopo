import { describe, expect, it } from "vitest";
import { formaterTelephone, normaliserTelephone } from "./telephone.js";

describe("numéros de téléphone", () => {
  it("ramène toutes les écritures d'un numéro sénégalais à la même forme", () => {
    for (const s of ["77 123 45 67", "771234567", "77.123.45.67", "+221 77 123 45 67", "00221771234567", "221771234567", " +221-77-123-45-67 "]) {
      expect(normaliserTelephone(s)).toBe("+221771234567");
    }
    expect(normaliserTelephone("33 821 00 00")).toBe("+221338210000");
  });

  it("accepte les autres pays avec leur indicatif", () => {
    expect(normaliserTelephone("+225 07 08 09 10 11")).toBe("+2250708091011");
    expect(normaliserTelephone("00212 612 345 678")).toBe("+212612345678");
  });

  it("refuse ce qui n'est pas un numéro", () => {
    for (const s of ["", "abc", "12345", "77 123 45", "+221 77 123 45 678", "+0123456789", "7712345678", "x@y.sn"]) {
      expect(normaliserTelephone(s)).toBeNull();
    }
  });

  it("affiche un numéro lisible", () => {
    expect(formaterTelephone("+221771234567")).toBe("+221 77 123 45 67");
    expect(formaterTelephone("+212612345678")).toBe("+212 612345678");
  });
});
