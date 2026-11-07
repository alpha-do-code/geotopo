import { lireConfig } from "./config.js";

describe("configuration", () => {
  it("refuse de démarrer en production sans HTTPS ni secret solide", () => {
    const base = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://x",
      PORT: "3000",
      RELAIS_SECRET: "r".repeat(40),
      SMTP_URL: "smtps://moi:secret@smtp.exemple.sn:465",
      EMAIL_EXPEDITEUR: "GeoTopo <moi@exemple.sn>",
    };
    expect(() => lireConfig({ ...base, JWT_SECRET: "x".repeat(40), ORIGINE_WEB: "http://geotopo.sn" })).toThrow(/HTTPS/);
    expect(() => lireConfig({ ...base, JWT_SECRET: "court", ORIGINE_WEB: "https://geotopo.sn" })).toThrow(/JWT_SECRET/);
    expect(lireConfig({ ...base, JWT_SECRET: "x".repeat(40), ORIGINE_WEB: "https://geotopo.sn/" }).origineWeb).toBe("https://geotopo.sn");
  });

  it("refuse la production sans secret de relais ni fournisseur d'e-mails", () => {
    const base = { NODE_ENV: "production", DATABASE_URL: "postgresql://x", JWT_SECRET: "x".repeat(40), ORIGINE_WEB: "https://geotopo.sn" };
    const smtp = { SMTP_URL: "smtps://moi:secret@smtp.exemple.sn:465", EMAIL_EXPEDITEUR: "moi@exemple.sn" };
    expect(() => lireConfig({ ...base, ...smtp })).toThrow(/RELAIS_SECRET/);
    expect(() => lireConfig({ ...base, RELAIS_SECRET: "r".repeat(40) })).toThrow(/SMTP_URL/);
    expect(() => lireConfig({ ...base, RELAIS_SECRET: "r".repeat(40), ...smtp, SMTP_URL: "pas-une-url" })).toThrow(/SMTP_URL/);
    expect(lireConfig({ ...base, RELAIS_SECRET: "r".repeat(40), ...smtp }).smtp).toEqual({ url: smtp.SMTP_URL, expediteur: smtp.EMAIL_EXPEDITEUR });
  });

  it("accepte une configuration de développement en HTTP", () => {
    const c = lireConfig({ NODE_ENV: "development", DATABASE_URL: "postgresql://x", JWT_SECRET: "x".repeat(40), ORIGINE_WEB: "http://localhost:3001" });
    expect(c).toMatchObject({ production: false, port: 3000, origineWeb: "http://localhost:3001", relaisSecret: null, smtp: null });
  });
});
