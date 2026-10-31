# GeoTopo

Suivi des travaux de topographie, géodésie et géomatique, du terrain à l'acceptation : nature des travaux, méthode, appareil, classe de précision exigée par le cahier des charges, contrôle et verdict d'acceptabilité. PWA utilisable hors ligne, synchronisée avec Supabase.

## Lancer en local

```bash
npm install
npm run dev
```

Sans `.env.local`, l'application tourne en **mode local** : tout fonctionne, sans comptes ni synchronisation.

## Activer la synchronisation

1. Créer un projet Supabase, puis exécuter `supabase/migrations/0001_schema.sql` dans le SQL Editor
2. Copier `.env.example` en `.env.local` et y mettre l'URL et la clé publique (Publishable key)
3. Dans Authentication → URL Configuration, mettre l'adresse du site comme Site URL

## Tests

```bash
npm test            # calculs et synchronisation (Vitest)
npm run test:sql    # migrations et règles d'accès sur une base PostgreSQL jetable
```

## Mise en ligne

`npm run build` produit le dossier `out/`, à héberger sur n'importe quel hébergeur de fichiers statiques (Vercel, Cloudflare Pages). Les deux variables `NEXT_PUBLIC_…` se règlent chez l'hébergeur.

Documentation : `docs/CADRAGE.md`, `docs/decisions/`, `docs/REPRISE-CLAUDE.md`.
