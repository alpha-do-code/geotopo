import request from "supertest";
import { creerApp } from "./outils.js";

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
});
