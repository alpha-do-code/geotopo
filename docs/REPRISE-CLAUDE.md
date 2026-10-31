# Reprise : GeoTopo

> Dernière mise à jour : 2026-10-31 · Dernier commit : voir `git log -1` · Tout est poussé : **non, aucun dépôt distant**

## 1. Ce que fait l'application

Une PWA pour suivre les travaux de topographie, géodésie et géomatique d'une équipe ou d'un bureau d'études. Pour chaque chantier, on saisit les exigences du cahier des charges (nature, méthode, appareil, classe de précision), les points levés puis les points de contrôle. L'application calcule les écarts, l'EMQ et propose un verdict d'acceptabilité que le contrôleur valide. Elle marche hors ligne sur le terrain et se synchronise avec Supabase.

## 2. Fonctionnalités livrées

- ✅ Tableau de bord des chantiers, filtres par nature, référentiel et statut (testé dans le navigateur)
- ✅ Fiche chantier : exigences, alerte de compatibilité méthode / classe, tolérance du cahier des charges et coefficient réglables
- ✅ Points levés / contrôle : import CSV (collé ou fichier), coordonnées E, N, H ou X, Y, Z
- ✅ Calcul : écart plani (ENH) ou 3D (XYZ), EMQ, écart max, verdict (testé : 12 tests unitaires et dans le navigateur)
- ✅ Validation réservée au chef de mission et au contrôleur, imposée par la base (testé en SQL)
- ✅ Saisie terrain sur téléphone avec écart immédiat en contrôle (testé dans le navigateur)
- ✅ Hors ligne : service worker, pages ouvertes serveur coupé (testé)
- ✅ Synchronisation : testée avec un faux Supabase (4 tests) et règles d'accès testées sur PostgreSQL jetable (13 assertions)
- ⚠️ **Non vérifié contre un vrai projet Supabase** : connexion, inscription, création d'organisation, synchronisation réelle
- ⚠️ PV : impression du navigateur (`window.print`), pas de PDF mis en forme
- ⚠️ Référentiels : arrêté ivoirien sur les classes de précision et tables ANCFCC **manquants**, matrice méthode / classe indicative

## 3. Structure des fichiers

- `src/app/` : les pages (`/`, `/chantier/?id=`, `/terrain/?id=`, `/referentiels/`, `/compte/`)
- `src/lib/referentiels.ts` : listes métier, classes, matrice, sources des textes
- `src/lib/calculs.ts` : écarts, EMQ, verdict, lecture CSV
- `src/lib/db.ts` : base locale IndexedDB (Dexie) ; `src/lib/sync.ts` : synchronisation
- `src/components/session.tsx` : compte, organisation active, déclenchement de la synchro
- `supabase/migrations/` : schéma et règles d'accès ; `scripts/tester-sql.sh` : leurs tests
- `public/sw.js` : service worker ; `public/manifest.webmanifest`

## 4. Technologies

Next.js 16.4 (export statique, Turbopack), React 19, Tailwind 4, Dexie 4, Supabase JS 2.118, Vitest 5, PostgreSQL 16 pour les tests SQL.

## 5. Décisions de design et d'architecture

Voir `docs/decisions/0001-pwa-hors-ligne-synchro-supabase.md`. En bref : hors ligne d'abord, la modification la plus récente gagne, règle d'acceptation EMQ ≤ borne et aucun écart > 2,5 × borne (paramétrable par chantier).

## 6. Instructions pour la prochaine session

- Lire `AGENTS.md` : cette version de Next.js diffère de ce que les modèles connaissent, la doc est dans `node_modules/next/dist/docs/`
- Changer `VERSION` dans `public/sw.js` à chaque modification du service worker
- Ne pas enregistrer le service worker en développement

## 7. Pièges connus de ce projet

- `npm install -D vitest` échoue avec `@types/node@20` : garder `@types/node@^24`
- Tailwind 4 : une classe maison utilisée dans `@apply` doit être déclarée en `@utility`, pas en `@layer components`
- `initdb` / `postgres` exigent une locale valide : le script exporte `LC_ALL=en_US.UTF-8`, et le socket va dans `/tmp` (chemin court)
- Dates : la base renvoie `+00:00`, l'appareil écrit `Z`. Comparer avec `Date.parse`, jamais en chaîne

## 8. Lancer le projet en local

```bash
npm install
npm run dev          # mode local sans .env.local
npm test && npm run test:sql
npm run build        # produit out/
```

## 9. Prochaine étape

Créer le projet Supabase, y exécuter la migration, remplir `.env.local`, puis tester le parcours réel à deux comptes (création d'organisation, invitation, saisie hors ligne, synchronisation, validation).
