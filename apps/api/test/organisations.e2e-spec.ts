import { compte, creerApp, viderBase, type Ctx } from "./outils.js";

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
});
