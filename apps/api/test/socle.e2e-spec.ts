import request from "supertest";
import { lireConfig } from "../src/config.js";
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

  it("refuse de démarrer en production sans HTTPS ni secret solide", () => {
    const base = { NODE_ENV: "production", DATABASE_URL: "postgresql://x", PORT: "3000" };
    expect(() => lireConfig({ ...base, JWT_SECRET: "x".repeat(40), ORIGINE_WEB: "http://geotopo.sn" })).toThrow(/HTTPS/);
    expect(() => lireConfig({ ...base, JWT_SECRET: "court", ORIGINE_WEB: "https://geotopo.sn" })).toThrow(/JWT_SECRET/);
    expect(lireConfig({ ...base, JWT_SECRET: "x".repeat(40), ORIGINE_WEB: "https://geotopo.sn/" }).origineWeb).toBe("https://geotopo.sn");
  });
});
