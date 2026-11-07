import { creerApp, MDP, nouveauNumero, ORIGINE, viderBase, type Ctx } from "./outils.js";

let ctx: Ctx;
beforeAll(async () => {
  ctx = await creerApp();
  await viderBase(ctx.prisma);
});
afterAll(() => ctx.app.close());
beforeEach(() => ctx.remettreLimites());

const cookieDe = (setCookie: string[] | string) => (Array.isArray(setCookie) ? setCookie : [setCookie]).find((c) => c.startsWith("geotopo_session="))!.split(";")[0];
const connexion = (identifiant: string, motDePasse = MDP) => ctx.http().post("/api/auth/connexion").set("origin", ORIGINE).send({ identifiant, motDePasse });

describe("authentification par numéro de téléphone", () => {
  it("inscription : le compte s'ouvre tout de suite, mot de passe haché en argon2id, numéro normalisé", async () => {
    const res = await ctx.http().post("/api/auth/inscription").set("origin", ORIGINE).send({ telephone: "77 555 12 34", motDePasse: MDP, nomAffiche: "Awa" }).expect(201);
    expect(res.body.jetonAcces).toBeTruthy();
    expect(res.body.utilisateur).toMatchObject({ telephone: "+221775551234", email: null, nomAffiche: "Awa", doitChangerMotDePasse: false });
    const cookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    const u = await ctx.prisma.utilisateurs.findUniqueOrThrow({ where: { telephone: "+221775551234" } });
    expect(u.mot_de_passe.startsWith("$argon2id$")).toBe(true);
    // Sans e-mail, aucun message ne part
    expect(ctx.boite.recus.filter((m) => m.texte.includes("confirmer=")).length).toBe(0);
  });

  it("connexion avec le numéro écrit de n'importe quelle façon", async () => {
    for (const n of ["775551234", "+221 77 555 12 34", "00221775551234"]) {
      ctx.remettreLimites();
      const r = await connexion(n).expect(200);
      expect(r.body.utilisateur.telephone).toBe("+221775551234");
    }
  });

  it("un numéro déjà pris est refusé à l'inscription", async () => {
    const r = await ctx.http().post("/api/auth/inscription").set("origin", ORIGINE).send({ telephone: "+221775551234", motDePasse: MDP, nomAffiche: "Autre" }).expect(409);
    expect(r.body.message).toMatch(/déjà un compte/);
    expect(await ctx.prisma.utilisateurs.count({ where: { telephone: "+221775551234" } })).toBe(1);
  });

  it("e-mail facultatif : lien de confirmation, et l'adresse ne peut servir qu'à un compte", async () => {
    await ctx.http().post("/api/auth/inscription").set("origin", ORIGINE).send({ telephone: nouveauNumero(), email: " Binta@Exemple.SN ", motDePasse: MDP, nomAffiche: "Binta" }).expect(201);
    const jeton = ctx.boite.jeton("binta@exemple.sn", "confirmer");
    await ctx.http().post("/api/auth/confirmer").send({ jeton }).expect(200);
    await ctx.http().post("/api/auth/confirmer").send({ jeton }).expect(400); // usage unique
    expect((await ctx.prisma.utilisateurs.findUniqueOrThrow({ where: { email: "binta@exemple.sn" } })).email_confirme_le).not.toBeNull();
    ctx.remettreLimites();
    await ctx.http().post("/api/auth/inscription").set("origin", ORIGINE).send({ telephone: nouveauNumero(), email: "binta@exemple.sn", motDePasse: MDP, nomAffiche: "X" }).expect(409);
    // Un champ e-mail laissé vide est accepté
    await ctx.http().post("/api/auth/inscription").set("origin", ORIGINE).send({ telephone: nouveauNumero(), email: "", motDePasse: MDP, nomAffiche: "Y" }).expect(201);
  });

  it("même message pour un numéro inconnu et un mauvais mot de passe", async () => {
    const a = await connexion("775551234", "mauvais-mot-de-passe").expect(401);
    const b = await connexion("770000999", "mauvais-mot-de-passe").expect(401);
    const c = await connexion("pas un numéro", "mauvais-mot-de-passe").expect(401);
    expect(a.body.message).toBe("Numéro ou mot de passe incorrect.");
    expect(b.body.message).toBe(a.body.message);
    expect(c.body.message).toBe(a.body.message);
  });

  it("les comptes créés avant le passage au numéro se connectent encore avec leur e-mail", async () => {
    const argon2 = (await import("argon2")).default;
    await ctx.prisma.utilisateurs.create({ data: { email: "ancien@exemple.sn", mot_de_passe: await argon2.hash(MDP, { type: argon2.argon2id }), nom_affiche: "Ancien" } });
    await connexion("Ancien@Exemple.sn").expect(200);
  });

  it("limite les tentatives de connexion", async () => {
    for (let i = 0; i < 5; i++) await connexion("775551234", "mauvais-mot-de-passe").expect(401);
    await connexion("775551234").expect(429);
  });

  it("refuse les champs inconnus et les entrées invalides", async () => {
    const ins = (corps: object) => ctx.http().post("/api/auth/inscription").set("origin", ORIGINE).send({ telephone: nouveauNumero(), motDePasse: MDP, nomAffiche: "X", ...corps });
    await ins({ role: "chef" }).expect(400);
    await ins({ telephone: "12345" }).expect(400);
    await ins({ email: "pas-un-email" }).expect(400);
    ctx.remettreLimites();
    const r = await ins({ motDePasse: "court" }).expect(400);
    expect(r.body.message).toMatch(/8 caractères/);
    await ins({ motDePasse: "huit-car" }).expect(201); // 8 caractères : accepté
  });

  it("exige un jeton d'accès valide", async () => {
    await ctx.http().get("/api/auth/moi").expect(401);
    await ctx.http().get("/api/auth/moi").set("authorization", "Bearer faux.jeton.ici").expect(401);
  });

  it("renouvellement à usage unique : un jeton rejoué révoque toute la session", async () => {
    const c1 = cookieDe((await connexion("775551234").expect(200)).headers["set-cookie"] as unknown as string[]);
    const r2 = await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", c1).expect(200);
    const c2 = cookieDe(r2.headers["set-cookie"] as unknown as string[]);
    expect(c2).not.toBe(c1);
    await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", c1).expect(401);
    await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", c2).expect(401);
  });

  it("refuse la connexion et le renouvellement depuis une autre origine", async () => {
    const c = cookieDe((await connexion("775551234").expect(200)).headers["set-cookie"] as unknown as string[]);
    await ctx.http().post("/api/auth/renouveler").set("origin", "https://pirate.example").set("cookie", c).expect(403);
    await ctx.http().post("/api/auth/connexion").set("origin", "https://pirate.example").send({ identifiant: "775551234", motDePasse: MDP }).expect(403);
  });

  it("déconnexion : le cookie ne renouvelle plus", async () => {
    const c = cookieDe((await connexion("775551234").expect(200)).headers["set-cookie"] as unknown as string[]);
    await ctx.http().post("/api/auth/deconnexion").set("origin", ORIGINE).set("cookie", c).expect(204);
    await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", c).expect(401);
  });

  it("mot de passe oublié : un lien seulement vers un e-mail confirmé, même réponse dans tous les cas", async () => {
    const avant = ctx.boite.recus.length;
    const sansEmail = await ctx.http().post("/api/auth/oubli").send({ identifiant: "775551234" }).expect(202);
    const inconnu = await ctx.http().post("/api/auth/oubli").send({ identifiant: "770000999" }).expect(202);
    expect(ctx.boite.recus.length).toBe(avant); // ni Awa (sans e-mail) ni l'inconnu ne reçoivent rien
    const binta = await ctx.prisma.utilisateurs.findUniqueOrThrow({ where: { email: "binta@exemple.sn" } });
    const c = cookieDe((await connexion(binta.telephone!).expect(200)).headers["set-cookie"] as unknown as string[]);
    const avecEmail = await ctx.http().post("/api/auth/oubli").send({ identifiant: binta.telephone }).expect(202);
    expect(sansEmail.body.message).toBe(inconnu.body.message);
    expect(avecEmail.body.message).toBe(inconnu.body.message);
    const jeton = ctx.boite.jeton("binta@exemple.sn", "reinitialiser");
    await ctx.http().post("/api/auth/reinitialiser").send({ jeton, motDePasse: "nouveau-mot-de-passe" }).expect(200);
    await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", c).expect(401);
    ctx.remettreLimites();
    await connexion(binta.telephone!).expect(401);
    await connexion(binta.telephone!, "nouveau-mot-de-passe").expect(200);
  });

  it("changer son mot de passe : l'actuel est exigé, les autres appareils sont déconnectés", async () => {
    const a = await connexion("775551234").expect(200);
    const autre = cookieDe((await connexion("775551234").expect(200)).headers["set-cookie"] as unknown as string[]);
    const ici = cookieDe(a.headers["set-cookie"] as unknown as string[]);
    const changer = (corps: object) => ctx.http().post("/api/auth/mot-de-passe").set("origin", ORIGINE).set("cookie", ici).set("authorization", `Bearer ${a.body.jetonAcces}`).send(corps);
    await changer({ actuel: "mauvais-mot-de-passe", nouveau: "encore-un-autre" }).expect(400);
    await changer({ actuel: MDP, nouveau: "encore-un-autre" }).expect(204);
    await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", autre).expect(401);
    await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", ici).expect(200);
  });
});
