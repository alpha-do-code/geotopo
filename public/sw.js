// Service worker de GeoTopo : l'application doit s'ouvrir sans réseau sur le terrain.
// Changer VERSION à chaque évolution de ce fichier.
const VERSION = "geotopo-v1";
const PAGES = ["/", "/terrain/", "/chantier/", "/referentiels/", "/compte/"];
const FIXES = ["/manifest.webmanifest", "/icone.svg", "/icone-192.png", "/icone-512.png"];

// À l'installation : les pages, puis tous les fichiers _next/static qu'elles référencent,
// pour qu'une page jamais visitée s'ouvre quand même hors ligne.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(FIXES);
      const statiques = new Set();
      for (const page of PAGES) {
        const rep = await fetch(page, { cache: "no-cache" });
        if (!rep.ok) continue;
        const html = await rep.clone().text();
        await cache.put(page, rep);
        for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) statiques.add(m[0]);
      }
      await Promise.all([...statiques].map((u) => cache.add(u).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const cle of await caches.keys()) if (cle !== VERSION) await caches.delete(cle);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Supabase et tout autre domaine : jamais mis en cache ici
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Fichiers versionnés par Next.js : le cache d'abord
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (r) =>
          r ||
          fetch(req).then((rep) => {
            if (rep.ok) caches.open(VERSION).then((c) => c.put(req, rep.clone()));
            return rep;
          }),
      ),
    );
    return;
  }

  // Pages et données de navigation : le réseau d'abord (sans cache HTTP), sinon la copie locale
  event.respondWith(
    (async () => {
      try {
        const rep = await fetch(req, { cache: "no-cache" });
        if (rep.ok && (req.mode === "navigate" || FIXES.includes(url.pathname))) {
          const cache = await caches.open(VERSION);
          await cache.put(url.pathname, rep.clone());
        }
        return rep;
      } catch {
        const cache = await caches.open(VERSION);
        const copie = (await cache.match(req, { ignoreSearch: true })) || (await cache.match(url.pathname));
        if (copie) return copie;
        if (req.mode === "navigate") return (await cache.match("/")) || Response.error();
        return Response.error();
      }
    })(),
  );
});
