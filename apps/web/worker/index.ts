// Worker Cloudflare de GeoTopo : sert le site statique (apps/web/out) et relaie /api vers l'API
// sur Render. Le navigateur ne voit qu'une seule origine, ce qui garde le cookie de session
// en SameSite=Strict et le CORS fermé (ADR 0002).

export type Env = {
  ASSETS: { fetch(req: Request): Promise<Response> };
  API_URL: string; // https://geotopo-api.onrender.com
  RELAIS_SECRET: string; // wrangler secret put RELAIS_SECRET
};

// En-têtes que seul le Worker a le droit de poser : ceux envoyés par le visiteur sont écrasés
const SECRET = "x-geotopo-relais";
const IP = "x-geotopo-ip";

export async function relayer(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const cible = new URL(url.pathname + url.search, env.API_URL);
  const entetes = new Headers(req.headers);
  entetes.delete("host");
  entetes.set(SECRET, env.RELAIS_SECRET);
  entetes.set(IP, req.headers.get("cf-connecting-ip") ?? "");
  const avecCorps = req.method !== "GET" && req.method !== "HEAD";
  try {
    return await fetch(cible, {
      method: req.method,
      headers: entetes,
      body: avecCorps ? req.body : undefined,
      redirect: "manual",
      // @ts-expect-error propriété propre à Cloudflare et à Node pour un corps en flux
      duplex: avecCorps ? "half" : undefined,
    });
  } catch {
    // L'application reste utilisable hors ligne : la synchro réessaiera plus tard
    return Response.json({ statusCode: 503, message: "Serveur momentanément indisponible." }, { status: 503 });
  }
}

const worker = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    // HTTPS partout : workers.dev répond aussi en http (wrangler dev en local reste en http)
    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith("/api/")) return relayer(req, env);
    return env.ASSETS.fetch(req);
  },

  // Le plan gratuit de Render endort l'API après 15 minutes sans requête et le réveil prend
  // près d'une minute. Une sonde légère toutes les 10 minutes la garde éveillée (750 h offertes
  // par mois, un seul service en consomme au plus 744).
  async scheduled(_evt: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(fetch(new URL("/api/ping", env.API_URL)));
  },
};

export default worker;
