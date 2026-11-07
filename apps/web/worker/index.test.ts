import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";

const env: Env = {
  ASSETS: { fetch: async () => new Response("site") },
  API_URL: "https://geotopo-api.onrender.com",
  RELAIS_SECRET: "le-vrai-secret",
};

afterEach(() => vi.unstubAllGlobals());

describe("Worker", () => {
  it("relaie /api avec le secret et l'IP réelle, en écrasant ceux envoyés par le visiteur", async () => {
    const appel = vi.fn<(u: URL, i: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", appel);
    const req = new Request("https://geotopo.exemple.workers.dev/api/sync/recevoir?org=1", {
      method: "POST",
      body: "{}",
      headers: { "x-geotopo-relais": "faux", "x-geotopo-ip": "1.2.3.4", "cf-connecting-ip": "196.207.1.1", origin: "https://geotopo.exemple.workers.dev" },
    });
    await worker.fetch(req, env);
    const [url, init] = appel.mock.calls[0];
    const h = new Headers(init.headers);
    expect(url.toString()).toBe("https://geotopo-api.onrender.com/api/sync/recevoir?org=1");
    expect(h.get("x-geotopo-relais")).toBe("le-vrai-secret");
    expect(h.get("x-geotopo-ip")).toBe("196.207.1.1");
    expect(h.get("origin")).toBe("https://geotopo.exemple.workers.dev");
    expect(init.method).toBe("POST");
  });

  it("sert le site pour tout le reste", async () => {
    const rep = await worker.fetch(new Request("https://geotopo.exemple.workers.dev/chantier/"), env);
    expect(await rep.text()).toBe("site");
  });

  it("répond 503 quand l'API est injoignable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("réseau");
    });
    const rep = await worker.fetch(new Request("https://geotopo.exemple.workers.dev/api/ping"), env);
    expect(rep.status).toBe(503);
  });
});
