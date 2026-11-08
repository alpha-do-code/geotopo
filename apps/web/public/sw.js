// Service worker de GeoTopo : l'application doit s'ouvrir sans réseau sur le terrain.
// Changer VERSION à chaque évolution de ce fichier.
const VERSION = "geotopo-v9";
const PAGES = ["/", "/planning/", "/raci/", "/indicateurs/", "/terrain/", "/chantier/", "/referentiels/", "/compte/", "/installer/", "/nouveau-chantier/"];
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

// Une page n'entre dans le cache qu'avec tous les fichiers _next/static qu'elle référence : une page
// en cache doit toujours pouvoir démarrer sans réseau. Si un fichier manque, on garde l'ancienne copie.
async function garderPage(cache, chemin, rep) {
  const html = await rep.clone().text();
  const fichiers = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)].map((m) => m[0]))];
  const manquants = [];
  for (const f of fichiers) if (!(await cache.match(f))) manquants.push(f);
  await cache.addAll(manquants);
  await cache.put(chemin, rep);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // L'API (même origine en production) et tout autre domaine : jamais mis en cache ici
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

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

  // Pages : la copie locale d'abord, pour que l'application s'ouvre tout de suite, même sur un
  // réseau lent ou coupé. La page est rafraîchie en arrière-plan : la nouvelle version sert au
  // lancement suivant. Sans copie locale (première visite), on attend le réseau.
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const copie = (await cache.match(req, { ignoreSearch: true })) || (await cache.match(url.pathname));
      const reseau = fetch(req, { cache: "no-cache" });
      // Rangement en cache en arrière-plan : il ne retarde jamais l'affichage
      event.waitUntil(
        reseau
          .then((rep) => {
            if (!rep.ok) return;
            if (req.mode === "navigate") return garderPage(cache, url.pathname, rep.clone());
            if (FIXES.includes(url.pathname)) return cache.put(url.pathname, rep.clone());
          })
          .catch(() => undefined),
      );
      if (copie) return copie;
      try {
        return (await reseau).clone();
      } catch {
        if (req.mode === "navigate") return (await cache.match("/")) || Response.error();
        return Response.error();
      }
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

// Une page n'entre dans le cache qu'avec tous les fichiers _next/static qu'elle référence : une page
// en cache doit toujours pouvoir démarrer sans réseau. Si un fichier manque, on garde l'ancienne copie.
async function garderPage(cache, chemin, rep) {
  const html = await rep.clone().text();
  const fichiers = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)].map((m) => m[0]))];
  const manquants = [];
  for (const f of fichiers) if (!(await cache.match(f))) manquants.push(f);
  await cache.addAll(manquants);
  await cache.put(chemin, rep);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // L'API (même origine en production) et tout autre domaine : jamais mis en cache ici
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

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

  // Pages : la copie locale d'abord, pour que l'application s'ouvre tout de suite, même sur un
  // réseau lent ou coupé. La page est rafraîchie en arrière-plan : la nouvelle version sert au
  // lancement suivant. Sans copie locale (première visite), on attend le réseau.
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const copie = (await cache.match(req, { ignoreSearch: true })) || (await cache.match(url.pathname));
      const reseau = fetch(req, { cache: "no-cache" }).then(async (rep) => {
        if (rep.ok && req.mode === "navigate") await garderPage(cache, url.pathname, rep.clone());
        else if (rep.ok && FIXES.includes(url.pathname)) await cache.put(url.pathname, rep.clone());
        return rep;
      });
      if (copie) {
        event.waitUntil(reseau.catch(() => undefined));
        return copie;
      }
      try {
        return await reseau;
      } catch {
        if (req.mode === "navigate") return (await cache.match("/")) || Response.error();
        return Response.error();
      }
    })(),
  );
});
