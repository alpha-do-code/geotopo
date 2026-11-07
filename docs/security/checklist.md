# Liste de contrôle sécurité

À repasser avant chaque mise en production et après chaque gros lot. Dernier audit : **7 novembre 2026**, avant la première mise en ligne (Worker Cloudflare + API Render), complété le même jour pour la connexion par numéro de téléphone.
Légende : ✅ respecté, ⚠️ respecté avec une réserve, ❌ à faire, — sans objet.

| #   | Règle                                    | État | Où c'est garanti |
| --- | ---------------------------------------- | ---- | ---------------- |
| 1   | Clés API dans `.env`                     | ✅   | Aucun secret dans le code. Tout passe par l'environnement, validé au démarrage (`apps/api/src/config.ts`). Secrets de production : variables Render et `wrangler secret` |
| 2   | `.env` dans `.gitignore`                 | ✅   | `.env*` ignorés, seuls les `.env.example` sans valeur sont versionnés ; aucun `.env` dans l'historique Git (`git log --all --name-only`) |
| 3   | Limite de débit sur la connexion         | ✅   | 5 essais par minute (connexion, inscription, confirmation, oubli, réinitialisation), 300/min en général. **Par visiteur** : l'IP réelle arrive du Worker (`x-geotopo-ip`), sinon tout le monde partagerait l'IP de Cloudflare (`relais.ts`, test e2e « par visiteur » vérifié par contre-épreuve) |
| 4   | Row Level Security activée               | ⚠️   | Pas de RLS : PostgreSQL n'est lu que par l'API, qui vérifie l'appartenance à l'organisation à chaque appel (`AccesService.exiger`). La base n'est joignable qu'avec son URL secrète (Neon, TLS) |
| 5   | Mots de passe hachés                     | ✅   | argon2id (`auth.service.ts`), hachage factice pour un e-mail inconnu |
| 6   | Droits vérifiés côté serveur             | ✅   | Garde globale `GardeAuth` (tout est privé sauf `@Public()`), rôles par organisation, identité tirée du seul jeton ; tests e2e sync et organisations |
| 7   | Seulement des clés publiques côté client | ✅   | Une seule variable `NEXT_PUBLIC_API_URL`, vide en production (même origine) |
| 8   | HTTPS partout                            | ✅   | Production refusée si `ORIGINE_WEB` n'est pas en https ; cookie `Secure` ; HSTS sur le site (`public/_headers`) et l'API (helmet) ; Worker → Render en https |
| 9   | Sessions qui expirent                    | ✅   | Jeton d'accès 15 min, session 30 jours glissants avec rotation et révocation de la famille en cas de réutilisation |
| 10  | Entrées validées                         | ✅   | `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`) sur corps, `@Query` et `@Param` ; colonnes synchronisables listées dans `sync/tables.ts` |
| 11  | Taille max des envois                    | ✅   | Corps JSON limité à 2 Mo (test e2e « corps trop gros ») |
| 12  | Type de fichier vérifié                  | —    | Aucun envoi de fichier au serveur : l'import CSV est lu dans le navigateur |
| 13  | CORS limité à mon site                   | ✅   | Une seule origine (`ORIGINE_WEB`) ; les routes à cookie refusent toute autre `Origin`. En plus, l'API refuse tout appel direct sans le secret du Worker (`RELAIS_SECRET`, sauf `/api/ping`) |
| 14  | Erreurs détaillées coupées               | ✅   | 500 générique, trace dans les journaux (`filtre-erreurs.ts`). Depuis le 7/11, les erreurs de validation sont en français et ne citent plus le code (`validation.ts`, test e2e) |
| 15  | Pas de `console.log` oubliés             | ✅   | Aucun dans `apps/` ni `packages/` (grep) |
| 16  | Message d'erreur unique à la connexion   | ⚠️   | Connexion : « Numéro ou mot de passe incorrect. » dans tous les cas (numéro inconnu, mal écrit, mauvais mot de passe), temps constant (test e2e). « Mot de passe oublié » répond pareil dans tous les cas. Réserve : depuis le 7/11, l'inscription signale un numéro déjà pris (choix assumé : sans SMS ni e-mail obligatoire, il n'y a pas d'autre moyen de prévenir la personne), sous limite de 5 essais par minute |
| 17  | Webhooks signés                          | —    | Aucun webhook |
| 18  | Dépendances à jour                       | ⚠️   | Mises à jour compatibles le 7/11 (NestJS 12.4.0, Next.js 16.4.5, React 19.3.1, argon2 0.45.2, `allowScripts` suivi). `npm audit --omit=dev` : 0. Restent 9 alertes modérées `minimatch` dans des outils de développement (`@nestjs/cli`, `typescript-eslint`) : seul `--force` les corrige, refusé |
| 19  | E-mail confirmé                          | ⚠️   | Depuis le 7/11 : connexion par numéro de téléphone, **sans vérification par SMS** (choix assumé : sans le code d'invitation d'un chef, un compte ne voit aucun chantier). L'e-mail est facultatif ; il ne sert à récupérer le compte que s'il est **confirmé**. Sinon, le chef donne un mot de passe provisoire : le jeton n'ouvre alors que le changement de mot de passe (garde serveur), et le chef doit être chef de **toutes** les équipes du membre (contre-épreuves faites) |
| 20  | Sauvegarde automatique                   | ⚠️   | Action GitHub quotidienne (`.github/workflows/sauvegarde.yml`) : `pg_dump` chiffré par une clé publique age, gardé 90 jours hors de Neon. Chaîne dump → chiffrement → restauration prouvée en local (`scripts/tester-sauvegarde.sh`, contre-épreuve faite). Réserve : à confirmer par un premier passage réussi sur la vraie base, puis une restauration de cet artefact |

## Ce qui est propre à cette mise en ligne

- **Une seule origine** : le Worker `geotopo` reçoit toutes les requêtes (`run_worker_first`), redirige http vers https, sert le site et relaie `/api/*` vers Render. Il écrase les en-têtes `x-geotopo-relais` et `x-geotopo-ip` envoyés par le visiteur (test `worker/index.test.ts`).
- **Plan gratuit de Render** : l'API s'endort après 15 minutes. Le Worker la réveille toutes les 10 minutes par `/api/ping`, qui ne touche pas la base.

## Comment refaire l'audit

1. Secrets : grep des motifs de clés, historique Git des fichiers `.env`, `.gitignore`.
2. `npm audit --omit=dev`, `npm audit`, `npm outdated` : corriger dans les versions compatibles, jamais `npm audit fix --force`. Après une mise à jour d'argon2 ou de Prisma, mettre à jour `allowScripts`.
3. Relire `config.ts`, `configurer.ts`, `relais.ts`, les routes `@Public()`, le filtre d'erreurs.
4. `npm run build && npm test && npm run lint && npm run test:e2e -w @geotopo/api`.
5. En ligne : `curl` direct sur l'adresse onrender.com doit répondre 403 (sauf `/api/ping`).
