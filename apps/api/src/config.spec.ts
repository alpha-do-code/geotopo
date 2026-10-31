import { lireConfig } from "./config.js";

describe("configuration", () => {
  it("refuse de démarrer en production sans HTTPS ni secret solide", () => {
    const base = { NODE_ENV: "production", DATABASE_URL: "postgresql://x", PORT: "3000" };
    expect(() => lireConfig({ ...base, JWT_SECRET: "x".repeat(40), ORIGINE_WEB: "http://geotopo.sn" })).toThrow(/HTTPS/);
    expect(() => lireConfig({ ...base, JWT_SECRET: "court", ORIGINE_WEB: "https://geotopo.sn" })).toThrow(/JWT_SECRET/);
    expect(lireConfig({ ...base, JWT_SECRET: "x".repeat(40), ORIGINE_WEB: "https://geotopo.sn/" }).origineWeb).toBe("https://geotopo.sn");
  });

  it("accepte une configuration de développement en HTTP", () => {
    const c = lireConfig({ NODE_ENV: "development", DATABASE_URL: "postgresql://x", JWT_SECRET: "x".repeat(40), ORIGINE_WEB: "http://localhost:3001" });
    expect(c).toMatchObject({ production: false, port: 3000, origineWeb: "http://localhost:3001" });
  });
});
