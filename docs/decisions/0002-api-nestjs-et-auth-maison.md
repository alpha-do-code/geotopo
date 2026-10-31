# ADR 0002 : API NestJS et PostgreSQL à la place de Supabase, authentification maison

*Date : 31/10/2026. Statut : accepté. Remplace la partie « Supabase » de l'ADR 0001.*

## Contexte

La v1 marchait en local avec Supabase (comptes, base, règles d'accès en RLS), mais n'avait jamais été branchée sur un vrai projet Supabase. Mamadou a ajouté à la v1 un module de gestion (planning Gantt, matrice RACI, indicateurs de résultats). Il a choisi de passer à NestJS en connaissant le coût : réécrire les comptes, les droits et la synchronisation. Il a aussi choisi une authentification maison plutôt que Supabase Auth.

## Décision

- **Monorepo** npm workspaces + Turborepo, comme AGACHU : `apps/web` (Next.js, export statique, inchangé dans son principe), `apps/api` (NestJS 12), `packages/metier` (calculs et règles partagés)
- **PostgreSQL + Prisma 7** (adaptateur `pg`). Prisma sert aux comptes et aux organisations. La synchronisation passe par du SQL écrit à la main (`insert … on conflict … where`), avec des noms de tables et de colonnes tirés d'une liste fixe
- **Les règles d'accès sont dans le service de synchro**, plus en RLS : appartenance à l'organisation, références dans la même organisation, la plus récente gagne, validation réservée au chef et au contrôleur, auteur posé par le serveur. Les contraintes CHECK et le curseur `clock_timestamp()` restent en base
- **Authentification** : argon2id ; jeton d'accès JWT de 15 min gardé en mémoire côté web ; jeton de renouvellement opaque dans un cookie `httpOnly; SameSite=Strict` limité à `/api/auth`, à usage unique, dont seule l'empreinte SHA-256 est stockée. Un jeton rejoué révoque toute la famille de sessions. Confirmation d'e-mail obligatoire et mot de passe oublié
- **E-mails derrière une interface** `Expediteur`. En développement, les liens s'écrivent dans le journal. **La production refuse de démarrer tant qu'aucun fournisseur n'est branché**
- **Même origine en production** : le reverse proxy sert le site et `/api`. Ça évite le CORS et garde le cookie strict
- **Pas de Redis en v1** : la limite de débit est en mémoire, avec une seule instance

## Options écartées

- **Garder Supabase.** C'était moins de code et c'était gratuit. Mamadou préfère maîtriser l'API, en prévision de traitements côté serveur (fichiers d'appareils, PV mis en forme) et d'un hébergement qu'il contrôle
- **NestJS + Supabase Auth** : on aurait gardé deux services pour un seul produit
- **Jest** : NestJS 12 est publié en modules ES, et son modèle de projet utilise déjà Vitest. On garde donc un seul outil de test pour tout le dépôt
- **Bibliothèque de Gantt** : le diagramme est dessiné en SVG maison. Il marche hors ligne, sans dépendance, et se règle sur le thème

## Conséquences

- **Il faut un serveur permanent**, donc un VPS + Dokploy selon ma méthode de cadrage. C'est un abonnement : l'acheter quand le produit est prêt pour de vrais utilisateurs, en vérifiant le prix de renouvellement
- **Le fournisseur d'e-mails est à choisir avant la mise en ligne**, et la sauvegarde automatique de PostgreSQL est à prévoir
- **Plusieurs instances de l'API** demanderaient de stocker la limite de débit dans Redis
- **Identifiants dérivés** : un couple (tâche, acteur) dans la RACI ou (tâche, précédente) dans les dépendances a un identifiant tiré d'un hachage, pour que deux appareils hors ligne ne créent pas de doublon
