import { randomUUID } from "node:crypto";
import { compte, creerApp, viderBase, type Ctx } from "./outils.js";

let ctx: Ctx;
type Compte = Awaited<ReturnType<typeof compte>>;
let chef: Compte, ope: Compte, etranger: Compte;
let org: string, orgEtrangere: string;

const auth = (u: Compte) => ({ authorization: `Bearer ${u.jeton}` });
const envoyer = (u: Compte, table: string, lignes: object[], o = org) =>
  ctx.http().post("/api/sync/envoyer").set(auth(u)).send({ org: o, table, lignes });
const recevoir = (u: Compte, table: string, curseur?: string, o = org) =>
  ctx.http().get("/api/sync/recevoir").set(auth(u)).query({ org: o, table, ...(curseur ? { curseur } : {}) });
const quand = (min: number) => new Date(Date.UTC(2026, 9, 31, 8, min)).toISOString();

const chantier = (id: string, min: number, extra: object = {}) => ({
  id, org_id: org, nom: "Lotissement Keur Massar", lieu: "", client: "", referentiel: "CDC", nature: "bornage", methode: "gnss_rtk",
  appareil: "gnss", appareil_modele: "", etalonnage_le: null, classe: 2, tolerance_cm: null, coef_tolerance: 2.5, systeme_coord: "ENH",
  type_controle: "points_connus", controle_par: "bureau", verdict: null, valide_par: null, valide_le: null, supprime: false,
  updated_at: quand(min), sale: 1, ...extra,
});

beforeAll(async () => {
  ctx = await creerApp();
  await viderBase(ctx.prisma);
  chef = await compte(ctx, "chef@exemple.sn");
  ope = await compte(ctx, "ope@exemple.sn");
  etranger = await compte(ctx, "etranger@exemple.sn");
  org = (await ctx.http().post("/api/organisations").set(auth(chef)).send({ nom: "Cabinet", nomAffiche: "Chef" })).body.id;
  orgEtrangere = (await ctx.http().post("/api/organisations").set(auth(etranger)).send({ nom: "Autre", nomAffiche: "E" })).body.id;
  const code = (await ctx.prisma.organisations.findUniqueOrThrow({ where: { id: org } })).code_invitation;
  await ctx.http().post("/api/organisations/rejoindre").set(auth(ope)).send({ code, nomAffiche: "Ope" }).expect(200);
});
afterAll(() => ctx.app.close());

describe("synchronisation", () => {
  const c1 = randomUUID();

  it("l'opérateur envoie un chantier et un point ; l'auteur est posé par le serveur", async () => {
    const r = await envoyer(ope, "chantiers", [chantier(c1, 0)]).expect(200);
    expect(r.body).toEqual({ acceptees: [c1], rejetees: [] });
    const p = { id: randomUUID(), org_id: org, chantier_id: c1, code: "B1", phase: "leve", systeme: "ENH", a: 1, b: 2, c: 3, observation: "", mesure_le: quand(0), supprime: false, updated_at: quand(0) };
    await envoyer(ope, "points", [p]).expect(200, { acceptees: [p.id], rejetees: [] });
    expect((await ctx.prisma.chantiers.findUniqueOrThrow({ where: { id: c1 } })).cree_par).toBe(ope.id);
  });

  it("la modification la plus récente gagne, une plus ancienne est ignorée", async () => {
    await envoyer(ope, "chantiers", [chantier(c1, 10, { nom: "Récent" })]).expect(200);
    await envoyer(chef, "chantiers", [chantier(c1, 5, { nom: "Ancien" })]).expect(200);
    expect((await ctx.prisma.chantiers.findUniqueOrThrow({ where: { id: c1 } })).nom).toBe("Récent");
  });

  it("le chef valide ; une copie ancienne ou plus récente de l'opérateur n'efface pas la validation", async () => {
    await envoyer(chef, "chantiers", [chantier(c1, 20, { nom: "Récent", verdict: "conforme", valide_par: chef.id, valide_le: quand(20) })]).expect(200);
    await envoyer(ope, "chantiers", [chantier(c1, 15)]).expect(200);
    await envoyer(ope, "chantiers", [chantier(c1, 30, { nom: "Renommé" })]).expect(200);
    const c = await ctx.prisma.chantiers.findUniqueOrThrow({ where: { id: c1 } });
    expect([c.nom, c.verdict, c.valide_par]).toEqual(["Renommé", "conforme", chef.id]);
  });

  it("l'opérateur ne peut pas créer un chantier déjà validé", async () => {
    const id = randomUUID();
    await envoyer(ope, "chantiers", [chantier(id, 0, { verdict: "conforme", valide_par: ope.id, valide_le: quand(0) })]).expect(200);
    const c = await ctx.prisma.chantiers.findUniqueOrThrow({ where: { id } });
    expect([c.verdict, c.valide_par]).toEqual([null, null]);
  });

  it("un étranger ne lit ni n'écrit rien dans l'organisation", async () => {
    await recevoir(etranger, "chantiers").expect(403);
    await envoyer(etranger, "chantiers", [chantier(randomUUID(), 0)]).expect(403);
  });

  it("sans jeton : aucun accès", async () => {
    await ctx.http().get("/api/sync/recevoir").query({ org, table: "chantiers" }).expect(401);
  });

  it("une ligne ne peut pas changer d'organisation ni en écraser une d'une autre organisation", async () => {
    // L'étranger réutilise l'identifiant d'un chantier du cabinet dans sa propre organisation
    await envoyer(etranger, "chantiers", [{ ...chantier(c1, 59, { nom: "Piraté" }), org_id: orgEtrangere }], orgEtrangere).expect(200);
    expect((await ctx.prisma.chantiers.findUniqueOrThrow({ where: { id: c1 } })).nom).toBe("Renommé");
    // Une ligne dont org_id diffère du lot est refusée
    const r = await envoyer(ope, "chantiers", [{ ...chantier(randomUUID(), 0), org_id: orgEtrangere }]).expect(200);
    expect(r.body.rejetees[0].motif).toBe("organisation différente du lot");
  });

  it("un point ne peut pas viser le chantier d'une autre organisation", async () => {
    const cE = randomUUID();
    await envoyer(etranger, "chantiers", [{ ...chantier(cE, 0), org_id: orgEtrangere }], orgEtrangere).expect(200);
    const p = { id: randomUUID(), org_id: org, chantier_id: cE, code: "X", phase: "leve", systeme: "ENH", a: 0, b: 0, c: 0, observation: "", mesure_le: quand(0), supprime: false, updated_at: quand(0) };
    const r = await envoyer(ope, "points", [p]).expect(200);
    expect(r.body).toEqual({ acceptees: [], rejetees: [{ id: p.id, motif: "chantier_id hors de l'organisation" }] });
  });

  it("une ligne refusée par une contrainte ne bloque pas les autres du lot", async () => {
    const bon = chantier(randomUUID(), 0);
    const mauvais = chantier(randomUUID(), 0, { classe: 9 });
    const r = await envoyer(ope, "chantiers", [bon, mauvais]).expect(200);
    expect(r.body.acceptees).toEqual([bon.id]);
    expect(r.body.rejetees).toEqual([{ id: mauvais.id, motif: "chantiers_classe_ck" }]);
  });

  it("refuse une table inconnue et un lot trop gros", async () => {
    await ctx.http().post("/api/sync/envoyer").set(auth(ope)).send({ org, table: "utilisateurs", lignes: [] }).expect(400);
    await ctx.http().post("/api/sync/envoyer").set(auth(ope)).send({ org, table: "points", lignes: Array(201).fill({}) }).expect(400);
  });

  it("réception paginée par curseur, sans perte ni doublon", async () => {
    const lignes = Array.from({ length: 1200 }, (_, i) => ({
      id: randomUUID(), org_id: org, chantier_id: c1, code: `P${i}`, phase: "leve", systeme: "ENH", a: i, b: 0, c: 0, observation: "", mesure_le: quand(0), supprime: false, updated_at: quand(0),
    }));
    for (let i = 0; i < lignes.length; i += 200) await envoyer(ope, "points", lignes.slice(i, i + 200)).expect(200);
    const vus = new Set<string>();
    let curseur: string | undefined;
    for (;;) {
      const r = await recevoir(chef, "points", curseur).expect(200);
      for (const l of r.body.lignes) vus.add(l.id);
      if (!r.body.curseur) break;
      curseur = r.body.curseur;
    }
    expect(vus.size).toBe(1201); // + le point B1
    const fin = await recevoir(chef, "points", curseur).expect(200);
    expect(fin.body).toEqual({ lignes: [], curseur: null });
  });

  it("module de gestion : tâches, dépendances, RACI avec acteur externe, objectifs et indicateurs", async () => {
    const t1 = randomUUID(), t2 = randomUUID(), ext = randomUUID(), o1 = randomUUID();
    const base = { org_id: org, supprime: false, updated_at: quand(1) };
    const tache = (id: string, titre: string, debut: string, fin: string) => ({ ...base, id, chantier_id: c1, titre, debut, fin, avancement: 0, jalon: false, ordre: 0, cle_modele: "" });
    await envoyer(chef, "taches", [tache(t1, "Levé", "2026-11-02", "2026-11-05"), tache(t2, "Contrôle", "2026-11-06", "2026-11-06")]).expect(200, { acceptees: [t1, t2], rejetees: [] });
    await envoyer(chef, "acteurs", [{ ...base, id: ext, nom: "Cadastre de Thiès", organisme: "DGID", fonction: "Service du cadastre", user_id: null }]).expect(200);
    const d = { ...base, id: randomUUID(), tache_id: t2, depend_de: t1 };
    await envoyer(chef, "dependances", [d]).expect(200, { acceptees: [d.id], rejetees: [] });
    const raci = { ...base, id: randomUUID(), tache_id: t2, acteur_id: ext, lettre: "I" };
    await envoyer(chef, "raci", [raci]).expect(200, { acceptees: [raci.id], rejetees: [] });
    await envoyer(chef, "objectifs", [{ ...base, id: o1, chantier_id: c1, libelle: "Livrer un bornage conforme", ordre: 0 }]).expect(200);
    const ind = { ...base, id: randomUUID(), objectif_id: o1, libelle: "Points conformes", unite: "%", reference: null, cible: 100, sens: "hausse", mode: "auto", cle_auto: "taux_conformite", realise: null, source_verification: "PV de contrôle", ordre: 0 };
    await envoyer(chef, "indicateurs", [ind]).expect(200, { acceptees: [ind.id], rejetees: [] });

    // Règles en base : fin ≥ début, lettre RACI, dépendance sur elle-même
    const r = await envoyer(chef, "taches", [tache(randomUUID(), "À l'envers", "2026-11-05", "2026-11-01")]).expect(200);
    expect(r.body.rejetees[0].motif).toBe("taches_dates_ck");
    expect((await envoyer(chef, "raci", [{ ...raci, id: randomUUID(), lettre: "X" }])).body.rejetees[0].motif).toBe("raci_lettre_ck");
    expect((await envoyer(chef, "dependances", [{ ...d, id: randomUUID(), depend_de: t2 }])).body.rejetees[0].motif).toBe("dependances_boucle_ck");
    // Un acteur ne peut pas pointer vers un compte étranger à l'organisation
    expect((await envoyer(chef, "acteurs", [{ ...base, id: randomUUID(), nom: "X", organisme: "", fonction: "", user_id: etranger.id }])).body.rejetees[0].motif)
      .toBe("user_id n'est pas membre de l'organisation");

    // L'opérateur reçoit tout, dates au format jour
    const t = await recevoir(ope, "taches").expect(200);
    expect(t.body.lignes.map((l: { titre: string; debut: string }) => [l.titre, l.debut])).toEqual([["Levé", "2026-11-02"], ["Contrôle", "2026-11-06"]]);
    const a = await recevoir(ope, "acteurs").expect(200);
    expect(a.body.lignes.map((l: { nom: string }) => l.nom).sort()).toEqual(["Cadastre de Thiès", "Chef", "Ope"]);
  });
});
