import { creerApp, MDP, ORIGINE, viderBase, type Ctx } from "./outils.js";

let ctx: Ctx;
beforeAll(async () => {
  ctx = await creerApp();
  await viderBase(ctx.prisma);
});
afterAll(() => ctx.app.close());
beforeEach(() => ctx.remettreLimites());

const cookieDe = (setCookie: string[] | string) => (Array.isArray(setCookie) ? setCookie : [setCookie]).find((c) => c.startsWith("geotopo_session="))!.split(";")[0];

describe("authentification", () => {
  it("inscription → confirmation → connexion, mot de passe haché en argon2id", async () => {
    await ctx.http().post("/api/auth/inscription").send({ email: " Awa@Exemple.SN ", motDePasse: MDP, nomAffiche: "Awa" }).expect(202);
    const u = await ctx.prisma.utilisateurs.findUniqueOrThrow({ where: { email: "awa@exemple.sn" } });
    expect(u.mot_de_passe.startsWith("$argon2id$")).toBe(true);

    // Avant confirmation : refus, et un nouveau lien part
    const avant = ctx.boite.recus.length;
    await ctx.http().post("/api/auth/connexion").send({ email: "awa@exemple.sn", motDePasse: MDP }).expect(403);
    expect(ctx.boite.recus.length).toBe(avant + 1);

    const jeton = ctx.boite.jeton("awa@exemple.sn", "confirmer");
    await ctx.http().post("/api/auth/confirmer").send({ jeton }).expect(200);
    await ctx.http().post("/api/auth/confirmer").send({ jeton }).expect(400); // usage unique

    const res = await ctx.http().post("/api/auth/connexion").set("origin", ORIGINE).send({ email: "awa@exemple.sn", motDePasse: MDP }).expect(200);
    expect(res.body.jetonAcces).toBeTruthy();
    const cookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    await ctx.http().get("/api/auth/moi").set("authorization", `Bearer ${res.body.jetonAcces}`).expect(200, { id: u.id, email: "awa@exemple.sn", nomAffiche: "Awa" });
  });

  it("même message pour un e-mail inconnu et un mauvais mot de passe", async () => {
    const a = await ctx.http().post("/api/auth/connexion").send({ email: "awa@exemple.sn", motDePasse: "mauvais-mot-de-passe" }).expect(401);
    const b = await ctx.http().post("/api/auth/connexion").send({ email: "inconnu@exemple.sn", motDePasse: "mauvais-mot-de-passe" }).expect(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it("l'inscription ne révèle pas qu'une adresse existe déjà", async () => {
    const res = await ctx.http().post("/api/auth/inscription").send({ email: "awa@exemple.sn", motDePasse: MDP, nomAffiche: "Autre" }).expect(202);
    expect(res.body.message).toMatch(/Si l'adresse est valide/);
    expect(await ctx.prisma.utilisateurs.count({ where: { email: "awa@exemple.sn" } })).toBe(1);
  });

  it("limite les tentatives de connexion", async () => {
    for (let i = 0; i < 5; i++) await ctx.http().post("/api/auth/connexion").send({ email: "awa@exemple.sn", motDePasse: "mauvais-mot-de-passe" }).expect(401);
    await ctx.http().post("/api/auth/connexion").send({ email: "awa@exemple.sn", motDePasse: MDP }).expect(429);
  });

  it("refuse les champs inconnus et les entrées invalides", async () => {
    await ctx.http().post("/api/auth/inscription").send({ email: "x@exemple.sn", motDePasse: MDP, nomAffiche: "X", role: "chef" }).expect(400);
    await ctx.http().post("/api/auth/inscription").send({ email: "pas-un-email", motDePasse: MDP, nomAffiche: "X" }).expect(400);
    await ctx.http().post("/api/auth/inscription").send({ email: "x@exemple.sn", motDePasse: "court", nomAffiche: "X" }).expect(400);
  });

  it("exige un jeton d'accès valide", async () => {
    await ctx.http().get("/api/auth/moi").expect(401);
    await ctx.http().get("/api/auth/moi").set("authorization", "Bearer faux.jeton.ici").expect(401);
  });

  it("renouvellement à usage unique : un jeton rejoué révoque toute la session", async () => {
    const res = await ctx.http().post("/api/auth/connexion").set("origin", ORIGINE).send({ email: "awa@exemple.sn", motDePasse: MDP }).expect(200);
    const c1 = cookieDe(res.headers["set-cookie"] as unknown as string[]);
    const r2 = await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", c1).expect(200);
    const c2 = cookieDe(r2.headers["set-cookie"] as unknown as string[]);
    expect(c2).not.toBe(c1);
    // c1 rejoué (vol) : refusé, et c2 tombe avec lui
    await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", c1).expect(401);
    await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", c2).expect(401);
  });

  it("refuse le renouvellement depuis une autre origine", async () => {
    const res = await ctx.http().post("/api/auth/connexion").set("origin", ORIGINE).send({ email: "awa@exemple.sn", motDePasse: MDP }).expect(200);
    const c = cookieDe(res.headers["set-cookie"] as unknown as string[]);
    await ctx.http().post("/api/auth/renouveler").set("origin", "https://pirate.example").set("cookie", c).expect(403);
  });

  it("déconnexion : le cookie ne renouvelle plus", async () => {
    const res = await ctx.http().post("/api/auth/connexion").set("origin", ORIGINE).send({ email: "awa@exemple.sn", motDePasse: MDP }).expect(200);
    const c = cookieDe(res.headers["set-cookie"] as unknown as string[]);
    await ctx.http().post("/api/auth/deconnexion").set("origin", ORIGINE).set("cookie", c).expect(204);
    await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", c).expect(401);
  });

  it("mot de passe oublié : nouveau mot de passe, sessions fermées", async () => {
    const res = await ctx.http().post("/api/auth/connexion").set("origin", ORIGINE).send({ email: "awa@exemple.sn", motDePasse: MDP }).expect(200);
    const c = cookieDe(res.headers["set-cookie"] as unknown as string[]);
    const o = await ctx.http().post("/api/auth/oubli").send({ email: "inconnu@exemple.sn" }).expect(202);
    const p = await ctx.http().post("/api/auth/oubli").send({ email: "awa@exemple.sn" }).expect(202);
    expect(o.body.message).toBe(p.body.message);
    const jeton = ctx.boite.jeton("awa@exemple.sn", "reinitialiser");
    await ctx.http().post("/api/auth/reinitialiser").send({ jeton, motDePasse: "nouveau-mot-de-passe" }).expect(200);
    await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", c).expect(401);
    ctx.remettreLimites();
    await ctx.http().post("/api/auth/connexion").send({ email: "awa@exemple.sn", motDePasse: MDP }).expect(401);
    await ctx.http().post("/api/auth/connexion").send({ email: "awa@exemple.sn", motDePasse: "nouveau-mot-de-passe" }).expect(200);
  });
});
