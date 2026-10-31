# GeoTopo

Suivi des travaux de topographie, géodésie et géomatique, du terrain à l'acceptation. L'application couvre la nature des travaux, la méthode, l'appareil et la classe de précision exigée par le cahier des charges, puis le contrôle et le verdict d'acceptabilité. Elle sert aussi à gérer le chantier : planning Gantt, matrice RACI et indicateurs de résultats. C'est une PWA utilisable hors ligne, synchronisée avec une API NestJS.

## Structure

```
apps/web         Next.js en export statique (PWA, base locale IndexedDB)
apps/api         NestJS + Prisma + PostgreSQL (comptes, organisations, synchronisation)
packages/metier  calculs de contrôle, référentiels, planning, RACI, indicateurs
```

## Lancer en local

Il faut Node 24 ou plus récent et un PostgreSQL local.

```bash
npm install
createdb geotopo
cp apps/api/.env.example apps/api/.env                       # remplir DATABASE_URL et JWT_SECRET
cp apps/web/.env.example apps/web/.env.development.local
npm run build -w @geotopo/metier
(cd apps/api && npx prisma migrate deploy)
npm run dev                                                  # API sur :3000, web sur :3001
```

Sans compte, l'application tourne en **mode local** : tout fonctionne sur l'appareil, sans partage. En développement, les e-mails (confirmation, mot de passe oublié) s'affichent dans le terminal de l'API.

## Tests

```bash
npm test                              # métier, synchro web, configuration de l'API (Vitest)
npm run test:e2e -w @geotopo/api      # API complète sur une base PostgreSQL jetable
npm run lint
```

## Mise en ligne

Pas encore faite. Il faut un serveur permanent (VPS + Dokploy) avec un reverse proxy qui sert `apps/web/out` et `/api` sur la **même origine**. L'API refuse de démarrer en production dans trois cas : sans HTTPS, sans secret JWT solide, ou sans fournisseur d'e-mails.

Documentation : `docs/CADRAGE.md`, `docs/decisions/`, `docs/REPRISE-CLAUDE.md`.
