# Reprise : GeoTopo

> Dernière mise à jour : 2026-10-31 · Dernier commit : voir `git log -1` · Tout est poussé : **non, aucun dépôt distant**

## 1. Ce que fait l'application

Une PWA pour suivre les travaux de topographie, géodésie et géomatique d'une équipe ou d'un bureau d'études. Pour chaque chantier, on saisit les exigences du cahier des charges (nature, méthode, appareil, classe de précision), puis les points levés et les points de contrôle. L'application calcule les écarts et l'EMQ, et propose un verdict d'acceptabilité que le contrôleur valide. Elle sert aussi à gérer le chantier : planning Gantt, matrice RACI et indicateurs de résultats (GAR). Elle marche hors ligne sur le terrain et se synchronise avec une API NestJS.

## 2. Fonctionnalités livrées

- ✅ **Tableau de bord** : conformité, avancement réel face au prévu, retard et atteinte des indicateurs (testé dans le navigateur)
- ✅ **Fiche chantier, volet Contrôle** : exigences, alerte de compatibilité méthode / classe, import CSV, coordonnées E, N, H ou X, Y, Z, EMQ et verdict, export CSV, PV imprimable
- ✅ **Volet Planning** :
  - modèle de tâches par nature de travaux, Gantt SVG (glisser pour décaler ou allonger), dépendances, jalons, retards en rouge (testé dans le navigateur, y compris sur téléphone) ;
  - la validation du contrôle met le jalon « Contrôle de précision » à 100 % (testé)
- ✅ **Volet RACI** : membres et acteurs externes, alertes aucun A, plusieurs A ou aucun R (testé, y compris les clics rapides)
- ✅ **Volet Indicateurs** : objectifs, référence / cible / réalisé, 5 indicateurs automatiques, cadre type (testé)
- ✅ **Comptes** : inscription, confirmation d'e-mail, connexion, mot de passe oublié, organisations, invitation par code, rôles (tests e2e et navigateur)
- ✅ **Synchronisation** des 8 tables : envoi par lots, réception paginée, la plus récente gagne, lignes refusées signalées (tests e2e, tests web, et vérifiée en base réelle)
- ✅ **Hors ligne** : service worker v2, pages ouvertes serveur coupé (testé)
- ⚠️ **Jamais déployé.** Pas de fournisseur d'e-mails, pas de VPS, pas de sauvegarde automatique
- ⚠️ **Parcours à deux comptes** (opérateur qui saisit hors ligne, chef qui valide) : couvert par les tests e2e, **pas rejoué dans le navigateur**
- ⚠️ **Référentiels** : il manque l'arrêté ivoirien sur les classes de précision et les tables ANCFCC. La matrice méthode / classe et les modèles de tâches sont indicatifs

## 3. Structure des fichiers

- `apps/web/src/app/` : les pages (`/`, `/chantier/?id=`, `/terrain/?id=`, `/referentiels/`, `/compte/`)
- `apps/web/src/components/gestion/` : planning (Gantt), RACI, indicateurs, accès aux données (`donnees.ts`)
- `apps/web/src/lib/` :
  - `db.ts` : base locale Dexie v2 ;
  - `sync.ts` : synchronisation par transport ;
  - `api.ts` : client de l'API et jetons ;
  - `suivi.ts` : synthèse pour le tableau de bord
- `apps/api/src/` :
  - `auth/` : comptes, sessions, e-mails ;
  - `organisations/` : membres, rôles, `AccesService` ;
  - `sync/` : envoi et réception, et `tables.ts` (liste des colonnes modifiables) ;
  - `config.ts` : refus de démarrer si la configuration est dangereuse
- `apps/api/prisma/` : schéma et migrations (contraintes CHECK et déclencheurs ajoutés à la main dans le SQL)
- `apps/api/test/` : tests e2e et `lancer-e2e.sh` (base PostgreSQL jetable)
- `packages/metier/src/` : `calculs.ts` (contrôle), `gestion.ts` (planning, RACI, indicateurs), `sync.ts` (liste des tables)

## 4. Technologies

- **Monorepo** : npm workspaces + Turborepo
- **Web** : Next.js 16.4 (export statique), React 19, Tailwind 4, Dexie 4
- **API** : NestJS 12 (modules ES), Prisma 7 avec `@prisma/adapter-pg`, argon2, `@nestjs/jwt`, `@nestjs/throttler`, helmet
- **Tests** : Vitest partout, supertest pour l'e2e
- **Base** : PostgreSQL 16

## 5. Décisions de design et d'architecture

Voir `docs/decisions/` :
- **ADR 0001** : hors ligne d'abord, la plus récente gagne.
- **ADR 0002** : NestJS à la place de Supabase, authentification maison, même origine en production.

En bref :
- **Règle d'acceptation** : EMQ ≤ borne, et aucun écart > 2,5 × la borne (coefficient paramétrable).
- **Identifiants dérivés** : en RACI et pour les dépendances, l'identifiant est tiré d'un hachage, ce qui évite les doublons entre appareils.

## 6. Instructions pour la prochaine session

- **Next.js** : lire `apps/web/AGENTS.md`. Cette version diffère de ce que les modèles connaissent.
- **Service worker** : changer `VERSION` dans `apps/web/public/sw.js` à chaque modification du fichier.
- **Prisma 7** : il ne lit pas `.env` tout seul, c'est `prisma.config.ts` qui le charge. Le client est généré dans `apps/api/src/generated/` (ignoré par Git), et `npm run build` ou `dev` le régénère.
- **Nouvelle table synchronisée** : il faut toucher cinq endroits :
  1. `TABLES_SYNC` (métier) ;
  2. `TABLES` (API, `sync/tables.ts`) ;
  3. le schéma Prisma, avec sa migration et son déclencheur de curseur ;
  4. Dexie (nouvelle version du schéma) ;
  5. `viderBase` dans les tests e2e.
- **Après chaque modification du paquet métier** : `npm run build -w @geotopo/metier`.

## 7. Pièges connus de ce projet

- **Jeton de renouvellement à usage unique** : deux renouvellements simultanés feraient croire à un vol. `api.ts` n'en lance qu'un à la fois, et il faut garder ça.
- **Cases RACI** : la lettre suivante se calcule depuis la base, et les clics passent dans une file (`cyclerLettre`). Sinon un double clic rapide ne fait qu'un cran.
- **Dexie** : `useLiveQuery` renvoie `undefined` pendant le chargement. Pour un objet introuvable, renvoyer `null` (`.then((c) => c ?? null)`), sinon la page reste sur « Chargement… ».
- **Tests e2e** : le limiteur de débit se vide avec `remettreLimites()`. Son stockage interne `hitExpirations` doit aussi être vidé.
- **Dates du serveur** : PostgreSQL les renvoie sous la forme « 2026-10-31 21:50:00.123456+00 ». Pour les comparer, il faut les convertir avant `Date.parse`. Le curseur de synchro garde la chaîne telle quelle, à la microseconde.
- **`npm install` (npm 11)** : les scripts d'installation sont bloqués par défaut. argon2 et `@prisma/engines` sont autorisés dans `package.json` (`allowScripts`).
- **Locale** : `initdb` exige une locale valide, et le script exporte `LC_ALL=en_US.UTF-8`.

## 8. Lancer le projet en local

Voir le README. En bref :

```bash
npm install && npm run build -w @geotopo/metier
(cd apps/api && npx prisma migrate deploy)
npm run dev                              # API :3000, web :3001
npm test && npm run test:e2e -w @geotopo/api
```

Base de développement : `geotopo` sur le PostgreSQL local. Elle contient un compte de test, chef de mission d'une organisation de test, créé pendant la vérification du 31/10.

## 9. Prochaine étape

1. **Rejouer le parcours à deux comptes dans le navigateur** : invitation, saisie hors ligne par l'opérateur, validation par le chef.
2. **Faire valider les modèles de tâches et la matrice méthode / classe** par un topographe.
3. **Avant la mise en ligne** : choisir le fournisseur d'e-mails, louer le VPS, mettre en place la sauvegarde PostgreSQL, puis passer la liste de contrôle sécurité des 20 points.
4. **Créer le dépôt GitHub** sur `alpha-do-code` et pousser.
