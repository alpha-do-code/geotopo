import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { BaseLocale, enregistrerChantier, enregistrerPoint, nouveauChantier, type Point } from "./db";
import { nombreEnAttente, synchroniser } from "./sync";

const ORG = "org-1";

// Faux Supabase en mémoire : imite upsert (la plus récente gagne, horodatage serveur)
// et la lecture filtrée par org_id et server_updated_at.
function fauxSupabase() {
  const tables: Record<string, Map<string, Record<string, unknown>>> = { chantiers: new Map(), points: new Map() };
  let horloge = Date.parse("2026-11-01T00:00:00Z");
  const tick = () => new Date((horloge += 1)).toISOString().replace("Z", "+00:00");
  const sb = {
    from(nom: string) {
      const t = tables[nom];
      return {
        async upsert(lignes: Record<string, unknown>[]) {
          for (const l of lignes) {
            const ex = t.get(l.id as string);
            if (ex && Date.parse(l.updated_at as string) < Date.parse(ex.updated_at as string)) continue;
            t.set(l.id as string, { ...l, server_updated_at: tick() });
          }
          return { error: null };
        },
        select() {
          const filtres: ((r: Record<string, unknown>) => boolean)[] = [];
          let lim = Infinity;
          const q = {
            eq(col: string, v: unknown) { filtres.push((r) => r[col] === v); return q; },
            gt(col: string, v: string) { filtres.push((r) => Date.parse(r[col] as string) > Date.parse(v)); return q; },
            order() { return q; },
            limit(n: number) { lim = n; return q; },
            then(ok: (r: { data: unknown[]; error: null }) => void) {
              const data = [...t.values()]
                .filter((r) => filtres.every((f) => f(r)))
                .sort((a, b) => Date.parse(a.server_updated_at as string) - Date.parse(b.server_updated_at as string))
                .slice(0, lim);
              ok({ data: structuredClone(data), error: null });
            },
          };
          return q;
        },
      };
    },
  };
  return { sb: sb as unknown as SupabaseClient, tables };
}

let n = 0;
const nouvelleBase = () => new BaseLocale(`test-${++n}`);

function point(chantierId: string, code: string): Point {
  return {
    id: crypto.randomUUID(), org_id: ORG, chantier_id: chantierId, code, phase: "leve", systeme: "ENH",
    a: 1, b: 2, c: 3, observation: "", mesure_le: new Date().toISOString(), supprime: false, updated_at: "", sale: 1,
  };
}

describe("synchroniser", () => {
  let serveur: ReturnType<typeof fauxSupabase>;
  beforeEach(() => { serveur = fauxSupabase(); });

  it("envoie les saisies d'un appareil et les fait arriver sur un autre", async () => {
    const terrain = nouvelleBase();
    const bureau = nouvelleBase();
    const c = { ...nouveauChantier(ORG), nom: "Lotissement" };
    await enregistrerChantier(c, terrain);
    await enregistrerPoint(point(c.id, "B1"), terrain);
    expect(await nombreEnAttente(terrain)).toBe(2);

    expect(await synchroniser(serveur.sb, ORG, terrain)).toMatchObject({ envoyes: 2 });
    expect(await nombreEnAttente(terrain)).toBe(0);
    expect(serveur.tables.points.get([...serveur.tables.points.keys()][0])).not.toHaveProperty("sale");

    await synchroniser(serveur.sb, ORG, bureau);
    expect((await bureau.chantiers.get(c.id))?.nom).toBe("Lotissement");
    expect(await bureau.points.count()).toBe(1);
  });

  it("garde une modification locale plus récente que celle reçue", async () => {
    const a = nouvelleBase();
    const b = nouvelleBase();
    const c = { ...nouveauChantier(ORG), nom: "V1" };
    await enregistrerChantier(c, a);
    await synchroniser(serveur.sb, ORG, a);
    await synchroniser(serveur.sb, ORG, b);

    // b modifie hors ligne, puis a modifie plus tard et synchronise
    await enregistrerChantier({ ...(await b.chantiers.get(c.id))!, nom: "Version B" }, b);
    await new Promise((r) => setTimeout(r, 5));
    await enregistrerChantier({ ...(await a.chantiers.get(c.id))!, nom: "Version A" }, a);
    await synchroniser(serveur.sb, ORG, a);

    // b revient en ligne : sa version est plus ancienne, le serveur l'ignore et b reçoit celle de a
    await synchroniser(serveur.sb, ORG, b);
    expect((await b.chantiers.get(c.id))?.nom).toBe("Version A");
  });

  it("ne perd pas une saisie faite pendant l'envoi", async () => {
    const a = nouvelleBase();
    const c = nouveauChantier(ORG);
    await enregistrerChantier(c, a);
    const upsertOrigine = serveur.sb.from;
    // Simule une retouche locale pendant que l'envoi est en cours
    (serveur.sb as unknown as { from: unknown }).from = (nom: string) => {
      const t = upsertOrigine.call(serveur.sb, nom);
      return {
        ...t,
        upsert: async (l: Record<string, unknown>[]) => {
          if (nom === "chantiers") {
            await new Promise((r) => setTimeout(r, 2));
            await enregistrerChantier({ ...(await a.chantiers.get(c.id))!, nom: "Retouché" }, a);
          }
          return t.upsert(l);
        },
      };
    };
    await synchroniser(serveur.sb, ORG, a);
    expect((await a.chantiers.get(c.id))?.sale).toBe(1);
  });

  it("n'envoie pas les données d'une autre organisation", async () => {
    const a = nouvelleBase();
    await enregistrerChantier(nouveauChantier("autre-org"), a);
    expect(await synchroniser(serveur.sb, ORG, a)).toMatchObject({ envoyes: 0 });
  });
});
