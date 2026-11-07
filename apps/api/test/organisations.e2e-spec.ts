import { compte, creerApp, MDP, ORIGINE, viderBase, type Ctx } from "./outils.js";

let ctx: Ctx;
let chef: Awaited<ReturnType<typeof compte>>;
let ope: Awaited<ReturnType<typeof compte>>;
let etranger: Awaited<ReturnType<typeof compte>>;
let orgId: string;

beforeAll(async () => {
  ctx = await creerApp();
  await viderBase(ctx.prisma);
  chef = await compte(ctx, "chef@exemple.sn", "Moussa");
  ope = await compte(ctx, "ope@exemple.sn", "Fatou");
  etranger = await compte(ctx, "etranger@exemple.sn");
});
afterAll(() => ctx.app.close());

const auth = (u: { jeton: string }) => ({ authorization: `Bearer ${u.jeton}` });

describe("organisations", () => {
  it("le créateur devient chef et un acteur RACI est créé pour lui", async () => {
    const res = await ctx.http().post("/api/organisations").set(auth(chef)).send({ nom: "Cabinet Ndiaye", nomAffiche: "Moussa" }).expect(201);
    orgId = res.body.id;
    expect(res.body.role).toBe("chef");
    expect(res.body.code_invitation).toMatch(/^[0-9a-f]{12}$/);
    const acteurs = await ctx.prisma.acteurs.findMany({ where: { org_id: orgId } });
    expect(acteurs).toMatchObject([{ nom: "Moussa", user_id: chef.id }]);
  });

  it("rejoindre par code : opérateur, code d'invitation masqué", async () => {
    const code = (await ctx.prisma.organisations.findUniqueOrThrow({ where: { id: orgId } })).code_invitation;
    await ctx.http().post("/api/organisations/rejoindre").set(auth(ope)).send({ code: "000000000000", nomAffiche: "Fatou" }).expect(404);
    const res = await ctx.http().post("/api/organisations/rejoindre").set(auth(ope)).send({ code, nomAffiche: "Fatou" }).expect(200);
    expect(res.body).toMatchObject({ role: "operateur", code_invitation: null });
    await ctx.http().post("/api/organisations/rejoindre").set(auth(ope)).send({ code, nomAffiche: "Fatou" }).expect(400);
    const liste = await ctx.http().get("/api/organisations").set(auth(ope)).expect(200);
    expect(liste.body).toEqual([{ id: orgId, nom: "Cabinet Ndiaye", role: "operateur", code_invitation: null }]);
  });

  it("seul un membre voit la liste des membres", async () => {
    const res = await ctx.http().get(`/api/organisations/${orgId}/membres`).set(auth(ope)).expect(200);
    expect(res.body.map((m: { role: string }) => m.role)).toEqual(["chef", "operateur"]);
    await ctx.http().get(`/api/organisations/${orgId}/membres`).set(auth(etranger)).expect(403);
    await ctx.http().get(`/api/organisations/pas-un-uuid/membres`).set(auth(chef)).expect(400);
  });

  it("seul le chef change les rôles, et il en reste toujours un", async () => {
    await ctx.http().patch(`/api/organisations/${orgId}/membres/${ope.id}`).set(auth(ope)).send({ role: "chef" }).expect(403);
    await ctx.http().patch(`/api/organisations/${orgId}/membres/${chef.id}`).set(auth(chef)).send({ role: "operateur" }).expect(400);
    await ctx.http().patch(`/api/organisations/${orgId}/membres/${ope.id}`).set(auth(chef)).send({ role: "admin" }).expect(400);
    await ctx.http().patch(`/api/organisations/${orgId}/membres/${ope.id}`).set(auth(chef)).send({ role: "controleur" }).expect(204);
    await ctx.http().patch(`/api/organisations/${orgId}/membres/${ope.id}`).set(auth(etranger)).send({ role: "chef" }).expect(403);
  });

  it("les membres voient le numéro de leurs collègues (pour appeler ou écrire sur WhatsApp)", async () => {
    const res = await ctx.http().get(`/api/organisations/${orgId}/membres`).set(auth(ope)).expect(200);
    expect(res.body.map((m: { telephone: string }) => m.telephone).sort()).toEqual([chef.telephone, ope.telephone].sort());
  });

  it("mot de passe provisoire : seul le chef le donne, il doit être remplacé avant tout le reste", async () => {
    const url = `/api/organisations/${orgId}/membres/${ope.id}/mot-de-passe-provisoire`;
    await ctx.http().post(url).set(auth(etranger)).expect(403);
    await ctx.http().post(url).set(auth(ope)).expect(403); // ope est contrôleur ici, pas chef
    await ctx.http().post(`/api/organisations/${orgId}/membres/${chef.id}/mot-de-passe-provisoire`).set(auth(chef)).expect(400);
    const r = await ctx.http().post(url).set(auth(chef)).expect(200);
    expect(r.body.motDePasse).toMatch(/^[a-z2-9]{10}$/);
    const u = await ctx.prisma.utilisateurs.findUniqueOrThrow({ where: { id: ope.id } });
    expect(u).toMatchObject({ doit_changer_mdp: true, mdp_provisoire_par: chef.id });

    // Ses anciens appareils sont déconnectés, l'ancien mot de passe ne marche plus
    await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", ope.cookie.find((x) => x.startsWith("geotopo_session="))!.split(";")[0]).expect(401);
    ctx.remettreLimites();
    await ctx.http().post("/api/auth/connexion").set("origin", ORIGINE).send({ identifiant: ope.telephone, motDePasse: MDP }).expect(401);
    const c = await ctx.http().post("/api/auth/connexion").set("origin", ORIGINE).send({ identifiant: ope.telephone, motDePasse: r.body.motDePasse }).expect(200);
    expect(c.body.utilisateur.doitChangerMotDePasse).toBe(true);

    // Avec le provisoire, le jeton n'ouvre que le changement de mot de passe
    const jeton = { authorization: `Bearer ${c.body.jetonAcces}` };
    await ctx.http().get("/api/organisations").set(jeton).expect(403);
    await ctx.http().get("/api/auth/moi").set(jeton).expect(200);
    const cookie = (c.headers["set-cookie"] as unknown as string[]).find((x) => x.startsWith("geotopo_session="))!.split(";")[0];
    await ctx.http().post("/api/auth/mot-de-passe").set("origin", ORIGINE).set(jeton).set("cookie", cookie).send({ actuel: r.body.motDePasse, nouveau: "mon-nouveau-mdp" }).expect(204);
    const renouvele = await ctx.http().post("/api/auth/renouveler").set("origin", ORIGINE).set("cookie", cookie).expect(200);
    expect(renouvele.body.utilisateur.doitChangerMotDePasse).toBe(false);
    await ctx.http().get("/api/organisations").set({ authorization: `Bearer ${renouvele.body.jetonAcces}` }).expect(200);
  });

  it("un chef ne peut pas reprendre le compte d'un membre qui travaille aussi dans une autre équipe", async () => {
    const autre = await ctx.http().post("/api/organisations").set(auth(etranger)).send({ nom: "Autre cabinet", nomAffiche: "E" }).expect(201);
    const membre = await compte(ctx, "double@exemple.sn", "Double");
    const code = (await ctx.prisma.organisations.findUniqueOrThrow({ where: { id: orgId } })).code_invitation;
    await ctx.http().post("/api/organisations/rejoindre").set(auth(membre)).send({ code, nomAffiche: "Double" }).expect(200);
    await ctx.http().post("/api/organisations/rejoindre").set(auth(membre)).send({ code: autre.body.code_invitation, nomAffiche: "Double" }).expect(200);
    await ctx.http().post(`/api/organisations/${orgId}/membres/${membre.id}/mot-de-passe-provisoire`).set(auth(chef)).expect(403);
  });

  it("invitations par e-mail : réservées au chef, avec le code et le lien qui le remplit", async () => {
    const url = `/api/organisations/${orgId}/invitations`;
    await ctx.http().post(url).set(auth(etranger)).send({ emails: ["a@exemple.sn"] }).expect(403);
    await ctx.http().post(url).set(auth(chef)).send({ emails: [] }).expect(400);
    await ctx.http().post(url).set(auth(chef)).send({ emails: ["pas-un-email"] }).expect(400);
    await ctx.http().post(url).set(auth(chef)).send({ emails: Array.from({ length: 11 }, (_, i) => `x${i}@exemple.sn`) }).expect(400);
    const r = await ctx.http().post(url).set(auth(chef)).send({ emails: ["Recrue@Exemple.sn", "recrue@exemple.sn", "autre@exemple.sn"] }).expect(200);
    expect(r.body).toEqual({ envoyes: 2, echecs: [] });
    const code = (await ctx.prisma.organisations.findUniqueOrThrow({ where: { id: orgId } })).code_invitation;
    const mail = ctx.boite.recus.find((m) => m.a === "recrue@exemple.sn")!;
    expect(mail.sujet).toBe("GeoTopo : invitation dans l'équipe Cabinet Ndiaye");
    expect(mail.texte).toContain(`/?invitation=${code}`);
    expect(mail.texte).toContain("Moussa");
  });
});

