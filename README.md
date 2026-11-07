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

Il faut un compte pour entrer dans l'application : au premier lancement, elle n'affiche que la connexion par **numéro de téléphone et mot de passe** (8 caractères au moins), ou la création de compte (e-mail facultatif), puis demande de rejoindre ou de créer une équipe. Le chef invite par WhatsApp ou par e-mail (lien qui remplit le code) et peut donner un mot de passe provisoire à un membre qui a oublié le sien. Une fois connecté, la session est gardée sur l'appareil et l'application marche hors ligne. En développement, les e-mails (confirmation, mot de passe oublié) s'affichent dans le terminal de l'API.

## Tests

```bash
npm test                              # métier, synchro web, configuration de l'API (Vitest)
npm run test:e2e -w @geotopo/api      # API complète sur une base PostgreSQL jetable
npm run lint
```

## Mise en ligne

Le site et la PWA sont servis par un Worker Cloudflare qui relaie `/api` vers l'API sur Render (base PostgreSQL Neon) : une seule origine pour le navigateur. Procédure complète : `docs/MISE-EN-LIGNE.md`. L'API refuse de démarrer en production sans HTTPS, sans secret JWT solide, sans secret de relais ou sans SMTP. La page `/installer/` explique l'installation sur Android, iPhone et ordinateur : c'est le lien à partager.

Documentation : `docs/MISE-EN-LIGNE.md`, `docs/security/checklist.md`, `docs/CADRAGE.md`, `docs/decisions/`, `docs/REPRISE-CLAUDE.md`.
