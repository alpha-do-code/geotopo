# Mise en ligne de GeoTopo

```
Navigateur ──https──> Worker Cloudflare « geotopo » (xxx.workers.dev)
                        ├─ /*      site statique apps/web/out (PWA installable)
                        └─ /api/*  relais ──https──> Render « geotopo-api » ──TLS──> PostgreSQL Neon
```

Une seule origine pour le navigateur (cookie `SameSite=Strict`, CORS fermé). L'API refuse tout appel
qui ne vient pas du Worker (secret `RELAIS_SECRET`), sauf la sonde `/api/ping`.

## Ce qui coûte, ce qui dort

| Service | Plan | À savoir |
| --- | --- | --- |
| Cloudflare Workers | gratuit | 100 000 requêtes par jour |
| Render | gratuit | S'endort après 15 min ; le Worker le réveille toutes les 10 min (750 h offertes, un service en use 744 au plus). Un redéploiement coupe l'API une à deux minutes |
| Neon | gratuit | 0,5 Go. La base s'endort sans requête et se réveille en une seconde environ |

## Première mise en ligne

1. **Base Neon** : créer le projet `geotopo` (région Francfort), copier l'URL de connexion **directe** (sans `-pooler`, avec `?sslmode=require`) : `prisma migrate deploy` ne passe pas par le pooler de Neon, et une petite équipe n'a pas besoin de plus.
2. **Secret de relais** : `openssl rand -base64 48`, à garder pour les étapes 3 et 5.
3. **Render** : New → Blueprint → dépôt `alpha-do-code/geotopo`. Render lit `render.yaml` et demande :
   - `ORIGINE_WEB` : `https://geotopo.<sous-domaine>.workers.dev`
   - `DATABASE_URL` : l'URL Neon
   - `RELAIS_SECRET` : le secret de l'étape 2
   - `SMTP_URL` et `EMAIL_EXPEDITEUR` : voir plus bas
   Le build applique les migrations (`prisma migrate deploy`). Vérifier : `curl https://geotopo-api.onrender.com/api/ping` → `{"ok":true}` et `/api/sante` → 403.
4. **Adresse de l'API** : si Render a donné un autre nom que `geotopo-api.onrender.com`, la corriger dans `apps/web/wrangler.jsonc` (`API_URL`).
5. **Worker** :
   ```bash
   cd apps/web
   npx wrangler secret put RELAIS_SECRET
   npm run deploy
   ```
6. **Vérifier en ligne** : `https://…workers.dev/api/sante` → `{"ok":true}`, inscription, e-mail reçu, connexion, organisation, un chantier vu depuis un second appareil, installation sur Android et iPhone.

## E-mails (SMTP)

Le plus simple sans nom de domaine : un compte Gmail dédié avec la validation en deux étapes et un **mot de passe d'application**.

```
SMTP_URL=smtps://geotopo.app%40gmail.com:motdepasseapplication@smtp.gmail.com:465
EMAIL_EXPEDITEUR=GeoTopo <geotopo.app@gmail.com>
```

Brevo ou Resend marchent avec la même variable (`smtps://…`) ; ils demandent un domaine vérifié pour bien arriver en boîte de réception.

## Redéployer

- API : chaque push sur `main` redéploie Render.
- Site : `cd apps/web && npm run deploy`. Changer `VERSION` dans `public/sw.js` si le service worker change.
