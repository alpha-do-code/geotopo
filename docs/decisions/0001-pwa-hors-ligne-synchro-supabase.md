# ADR 0001 : PWA hors ligne d'abord, synchronisée avec Supabase

*Date : 31/10/2026. Statut : accepté.*

## Contexte

L'outil sert sur le terrain, souvent sans réseau, et doit être partagé avec une équipe (opérateurs, contrôleur, chef de mission). Mamadou a choisi la synchronisation dès la v1.

## Décision

- **Next.js en export statique** (`output: "export"`) : aucune fonction serveur, l'application est un ensemble de fichiers. Hébergeable sur Vercel ou Cloudflare Pages, gratuitement
- **IndexedDB (Dexie) comme source de vérité sur l'appareil** : toute saisie s'écrit d'abord en local, marquée « à envoyer »
- **Supabase** pour les comptes et le partage. Le client parle directement à la base, protégée par les règles d'accès (RLS) par organisation
- **Synchronisation** : envoi des lignes marquées par lots, puis réception depuis un curseur `server_updated_at` posé par la base. **La modification la plus récente gagne** (`updated_at` de l'appareil), arbitrée par un déclencheur en base
- **Identifiants générés sur l'appareil** (UUID), suppression logique (`supprime`) pour que les suppressions se synchronisent
- **Service worker écrit à la main** (`public/sw.js`), qui précharge toutes les pages et leurs fichiers à l'installation

## Options écartées

- **Next.js avec serveur (Server Actions, API)** : inutile hors ligne, et oblige à un hébergement avec fonctions
- **Synchronisation fusionnée champ par champ ou CRDT** : trop lourd pour la v1. Le cas réel (deux personnes qui modifient la même fiche hors ligne) est rare ; les points de mesure, eux, ne se modifient presque jamais
- **Bibliothèque de PWA (next-pwa, Serwist)** : le service worker fait 70 lignes, et ma leçon sur Tailleur 2.0 est de garder la main dessus

## Conséquences

- Si deux appareils modifient la même fiche hors ligne, la dernière modification efface l'autre (au niveau de la ligne entière)
- La validation d'un contrôle est réservée au chef de mission et au contrôleur par la base elle-même ; une copie ancienne d'un opérateur ne l'efface pas
- La déconnexion efface les données de l'appareil (appareil partagé). Ce qui n'est pas envoyé est perdu, l'utilisateur est prévenu
- Pas de conversion entre E, N, H et X, Y, Z en v1 : un contrôle dans un autre système que le levé est exclu du calcul et signalé
