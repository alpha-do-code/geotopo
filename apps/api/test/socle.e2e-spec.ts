import request from "supertest";
import { creerApp } from "./outils.js";

const SECRET = "s".repeat(40);

describe("socle", () => {
  it("répond sur /api/sante avec les en-têtes de sécurité", async () => {
    const { app } = await creerApp();
    const res = await request(app.getHttpServer()).get("/api/sante").expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    await app.close();
  });

  it("refuse un corps trop gros", async () => {
    const { app } = await creerApp();
    await request(app.getHttpServer())
      .post("/api/sante")
      .set("content-type", "application/json")
      .send(JSON.stringify({ x: "a".repeat(3 * 1024 * 1024) }))
      .expect(413);
    await app.close();
  });

  it("en production, refuse tout appel qui ne vient pas du Worker, sauf la sonde légère", async () => {
    const { app } = await creerApp({ relaisSecret: SECRET });
    const http = () => request(app.getHttpServer());
    await http().get("/api/ping").expect(200);
    await http().get("/api/sante").expect(403);
    await http().get("/api/sante").set("x-geotopo-relais", SECRET).expect(200);
    await http().post("/api/auth/connexion").send({ email: "a@b.sn", motDePasse: "xxxxxxxxxx" }).expect(403);
    await http().post("/api/auth/connexion").set("x-geotopo-relais", "mauvais").send({ email: "a@b.sn", motDePasse: "xxxxxxxxxx" }).expect(403);
    await http().post("/api/auth/connexion").set("x-geotopo-relais", SECRET).send({ email: "a@b.sn", motDePasse: "xxxxxxxxxx" }).expect(401);
    await app.close();
  });

  it("limite les essais de connexion par visiteur, pas pour tout le Worker", async () => {
    const { app } = await creerApp({ relaisSecret: SECRET });
    const essai = (ip: string) =>
      request(app.getHttpServer()).post("/api/auth/connexion").set("x-geotopo-relais", SECRET).set("x-geotopo-ip", ip).send({ email: "a@b.sn", motDePasse: "xxxxxxxxxx" });
    for (let i = 0; i < 5; i++) await essai("196.207.1.1").expect(401);
    await essai("196.207.1.1").expect(429);
    await essai("41.82.2.2").expect(401);
    await app.close();
  });

  it("explique une saisie invalide en français, sans le nom du code", async () => {
    const { app } = await creerApp();
    const res = await request(app.getHttpServer()).post("/api/auth/inscription").send({ email: "pas-un-email", motDePasse: "court", nomAffiche: "" }).expect(400);
    expect(res.body.message).toBe("Vérifie l'adresse e-mail, le mot de passe (10 caractères au moins), ton nom, tel que l'équipe le verra.");
    expect(JSON.stringify(res.body)).not.toMatch(/must/);
    await app.close();
  });
});
