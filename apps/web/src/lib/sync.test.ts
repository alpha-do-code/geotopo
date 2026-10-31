import "fake-indexeddb/auto";
import { LOT_RECEPTION, type TableSync } from "@geotopo/metier";
import { beforeEach, describe, expect, it } from "vitest";
import { BaseLocale, enregistrer, enregistrerChantier, enregistrerPoint, idDerive, nouveauChantier, type Point } from "./db";
import { nombreEnAttente, synchroniser, type Transport } from "./sync";

const ORG = "org-1";

// Faux serveur en mémoire : imite l'API (la plus récente gagne, horodatage serveur au format
// PostgreSQL, réception paginée par curseur « horodatage|id »).
function fauxServeur(pasMs = 1) {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const t = (nom: string) => tables.get(nom) ?? tables.set(nom, new Map()).get(nom)!;
  let horloge = Date.parse("2026-11-01T00:00:00Z");
  const tick = () => new Date((horloge += pasMs)).toISOString().replace("T", " ").replace("Z", "+00");
  const cle = (l: Record<string, unknown>) => `${l.server_updated_at}|${l.id}`;
  const transport: Transport & { refuser?: (l: Record<string, unknown>) => string | null; avantEnvoi?: (table: TableSync) => Promise<void> } = {
    async envoyer(org, table, lignes) {
      await transport.avantEnvoi?.(table);
      const acceptees: string[] = [];
      const rejetees: { id: string; motif: string }[] = [];
      for (const l of lignes) {
        const motif = transport.refuser?.(l) ?? null;
        if (motif) { rejetees.push({ id: l.id as string, motif }); continue; }
        acceptees.push(l.id as string);
        const ex = t(table).get(l.id as string);
        if (ex && Date.parse(l.updated_at as string) <= Date.parse(ex.updated_at as string)) continue;
        t(table).set(l.id as string, { ...l, org_id: org, server_updated_at: tick() });
      }
      return { acceptees, rejetees };
    },
    async recevoir(org, table, curseur) {
      const [ts, id] = (curseur ?? "1970-01-01T00:00:00.000Z|0").split("|");
      const depuis = Date.parse(ts.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
      const lignes = [...t(table).values()]
        .filter((l) => l.org_id === org)
        .filter((l) => {
          const d = Date.parse((l.server_updated_at as string).replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
          return d > depuis || (d === depuis && (l.id as string) > id);
        })
        .sort((a, b) => (cle(a) < cle(b) ? -1 : 1))
        .slice(0, LOT_RECEPTION);
      return { lignes: structuredClone(lignes), curseur: lignes.length ? cle(lignes.at(-1)!) : null };
    },
  };
  return { transport, t };
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
  let serveur: ReturnType<typeof fauxServeur>;
  beforeEach(() => { serveur = fauxServeur(); });

  it("envoie les saisies d'un appareil et les fait arriver sur un autre", async () => {
    const terrain = nouvelleBase();
    const bureau = nouvelleBase();
    const c = { ...nouveauChantier(ORG), nom: "Lotissement" };
    await enregistrerChantier(c, terrain);
    await enregistrerPoint(point(c.id, "B1"), terrain);
    expect(await nombreEnAttente(terrain)).toBe(2);

    expect(await synchroniser(serveur.transport, ORG, terrain)).toMatchObject({ envoyes: 2, rejetees: [] });
    expect(await nombreEnAttente(terrain)).toBe(0);
    expect([...serveur.t("points").values()][0]).not.toHaveProperty("sale");

    await synchroniser(serveur.transport, ORG, bureau);
    expect((await bureau.chantiers.get(c.id))?.nom).toBe("Lotissement");
    expect(await bureau.points.count()).toBe(1);
  });

  it("garde une modification locale plus récente que celle reçue", async () => {
    const a = nouvelleBase();
    const b = nouvelleBase();
    const c = { ...nouveauChantier(ORG), nom: "V1" };
    await enregistrerChantier(c, a);
    await synchroniser(serveur.transport, ORG, a);
    await synchroniser(serveur.transport, ORG, b);

    // b modifie hors ligne, puis a modifie plus tard et synchronise
    await enregistrerChantier({ ...(await b.chantiers.get(c.id))!, nom: "Version B" }, b);
    await new Promise((r) => setTimeout(r, 5));
    await enregistrerChantier({ ...(await a.chantiers.get(c.id))!, nom: "Version A" }, a);
    await synchroniser(serveur.transport, ORG, a);

    // b revient en ligne : sa version est plus ancienne, le serveur l'ignore et b reçoit celle de a
    await synchroniser(serveur.transport, ORG, b);
    expect((await b.chantiers.get(c.id))?.nom).toBe("Version A");
  });

  it("ne perd pas une saisie faite pendant l'envoi", async () => {
    const a = nouvelleBase();
    const c = nouveauChantier(ORG);
    await enregistrerChantier(c, a);
    serveur.transport.avantEnvoi = async (table) => {
      if (table !== "chantiers") return;
      await new Promise((r) => setTimeout(r, 2));
      await enregistrerChantier({ ...(await a.chantiers.get(c.id))!, nom: "Retouché" }, a);
    };
    await synchroniser(serveur.transport, ORG, a);
    expect((await a.chantiers.get(c.id))?.sale).toBe(1);
  });

  it("n'envoie pas les données d'une autre organisation", async () => {
    const a = nouvelleBase();
    await enregistrerChantier(nouveauChantier("autre-org"), a);
    expect(await synchroniser(serveur.transport, ORG, a)).toMatchObject({ envoyes: 0 });
  });

  it("une ligne refusée reste à envoyer et son motif remonte", async () => {
    const a = nouvelleBase();
    const c = nouveauChantier(ORG);
    await enregistrerChantier(c, a);
    serveur.transport.refuser = () => "chantiers_classe_ck";
    const bilan = await synchroniser(serveur.transport, ORG, a);
    expect(bilan.rejetees).toEqual([{ table: "chantiers", id: c.id, motif: "chantiers_classe_ck" }]);
    expect(await nombreEnAttente(a)).toBe(1);
  });

  it("reçoit plus d'un lot, puis seulement les nouveautés au tour suivant", async () => {
    serveur = fauxServeur(1000); // une ligne par seconde côté serveur
    const a = nouvelleBase();
    const b = nouvelleBase();
    const c = nouveauChantier(ORG);
    await enregistrerChantier(c, a);
    for (let i = 0; i < 1500; i++) await enregistrerPoint(point(c.id, `P${i}`), a);
    await synchroniser(serveur.transport, ORG, a);
    expect((await synchroniser(serveur.transport, ORG, b)).recus).toBe(1501);
    expect(await b.points.count()).toBe(1500);
    // Tour suivant : seule la fenêtre de recouvrement est relue, pas toute la table
    const bilan = await synchroniser(serveur.transport, ORG, b);
    // Relu : les 5 dernières secondes de chaque table (6 points, bornes comprises, et le chantier)
    expect(bilan.recus).toBe(7);
  });

  it("synchronise le module de gestion ; une même lettre RACI posée sur deux appareils ne fait qu'une ligne", async () => {
    const a = nouvelleBase();
    const b = nouvelleBase();
    const c = nouveauChantier(ORG);
    await enregistrerChantier(c, a);
    const base = { org_id: ORG, supprime: false, updated_at: "", sale: 1 as const };
    const tache = { ...base, id: crypto.randomUUID(), chantier_id: c.id, titre: "Levé", debut: "2026-11-02", fin: "2026-11-04", avancement: 0, jalon: false, ordre: 0, cle_modele: "leve" };
    const acteur = { ...base, id: crypto.randomUUID(), nom: "Cadastre", organisme: "DGID", fonction: "", user_id: null };
    await enregistrer("taches", tache, a);
    await enregistrer("acteurs", acteur, a);
    await synchroniser(serveur.transport, ORG, a);
    await synchroniser(serveur.transport, ORG, b);
    expect((await b.taches.get(tache.id))?.titre).toBe("Levé");

    const id = await idDerive(tache.id, acteur.id);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await enregistrer("raci", { ...base, id, tache_id: tache.id, acteur_id: acteur.id, lettre: "R" }, a);
    await new Promise((r) => setTimeout(r, 5));
    await enregistrer("raci", { ...base, id: await idDerive(tache.id, acteur.id), tache_id: tache.id, acteur_id: acteur.id, lettre: "A" }, b);
    await synchroniser(serveur.transport, ORG, a);
    await synchroniser(serveur.transport, ORG, b);
    await synchroniser(serveur.transport, ORG, a);
    expect(serveur.t("raci").size).toBe(1);
    expect((await a.raci.get(id))?.lettre).toBe("A");
  });
});
