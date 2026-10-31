# GeoTopo, cadrage v1

*Rédigé le 31/10/2026, mis à jour le 31/10/2026 (module de gestion, passage à NestJS). Statut : v1 codée et testée en local, pas encore en ligne.*

## Le besoin

Une interface pour suivre les travaux de topographie, géodésie et géomatique, du terrain jusqu'à l'acceptation, en se référant au cahier des charges du chantier. Utilisée par une équipe (opérateurs terrain, chef de mission, bureau d'études qui contrôle).

## Les données qu'on suit

| Axe | Valeurs |
|---|---|
| Nature des travaux | Bornage / délimitation, topographie rurale, topographie urbaine, auscultation, levés et implantations |
| Méthode | Polygonation, GNSS RTK, GNSS statique, photogrammétrie par drone, balayage laser, rayonnement alti et plani |
| Type de contrôle | Réobservation des points, contrôle sur points connus, échantillonnage |
| Qui contrôle | Même opérateur (autocontrôle), bureau d'études (contrôle externe) |
| Appareil | Récepteur GNSS, station totale, station totale robotisée, niveau optique / numérique, drone, scanner laser |
| Classe de précision | < 1 cm, 1 à 3 cm, 3 à 5 cm, 5 à 10 cm, 10 à 50 cm, > 50 cm |
| Type de coordonnées | E, N, H (projection plane + altitude) ou X, Y, Z (cartésiennes géocentriques), au choix de l'utilisateur. Écart plani en ENH, écart 3D en XYZ |

## Règle d'acceptation (proposée, paramétrable par chantier)

- EMQ planimétrique des écarts levé / contrôle ≤ borne haute de la classe exigée
- Aucun écart au-delà de 2,5 × cette borne. Le rapport 2,5 vient de l'instruction ANCFCC (art. 13 : T = 2,5 dL)
- Alerte si la méthode choisie n'atteint pas couramment la classe exigée (matrice indicative, à valider par un topographe)

## Référentiels : ce qui est vérifié et ce qui manque

| Pays | Texte trouvé et lu | Ce qu'il apporte | Ce qui manque |
|---|---|---|---|
| Côte d'Ivoire | Arrêté n° 085 MINAGRA du 15/06/2000 (plans du domaine foncier rural) | Précision de l'ordre du mètre, rattachement au Réseau Géodésique Ivoirien, ≥ 2 points d'appui, échelles, pièces de contrôle | **Aucun arrêté ivoirien sur les classes de précision trouvé.** Le texte qui porte ce nom est l'arrêté français du 16/09/2003. À obtenir auprès de l'OGECI ou du cadastre |
| Maroc | Instruction ANCFCC sur les travaux cadastraux (« livre bleu », 2017) | T = 2,5 × emq, 1/4 000 et 1/2 000, double rayonnement en urbain, rayonnement ≤ 3/4 du côté, vérification des points anciens, autocontrôle | Les **tables de tolérances annexes** (art. 28), et tout ce qui concerne GNSS, drone et scanner laser. Il faut le CPT ANCFCC à jour |

Sources :
- [Arrêté 085 MINAGRA (FAOLEX)](https://faolex.fao.org/docs/pdf/ivc69134.pdf)
- [Instruction ANCFCC 2017](https://kitigt.onigtevents.ma/assets/files/3-DOC-TECHNIQUE/ancfcc/2017-livrebleu.pdf)
- [Arrêté français du 16/09/2003, pour comparaison](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000794936)

## Module de gestion (ajouté à la v1 le 31/10/2026)

| Brique | Ce qu'elle fait dans GeoTopo |
|---|---|
| **Planning (Gantt)** | Tâches avec début, fin, avancement, jalons et dépendances (« après »). Modèle de tâches par nature de travaux. Le jalon « Contrôle de précision » passe à 100 % quand le contrôle est validé |
| **Matrice RACI** | Tâches × acteurs, une lettre par case. Les acteurs sont les membres de l'équipe, plus des externes sans compte (maître d'ouvrage, cadastre, géomètre expert). L'application signale une tâche sans A, avec plusieurs A ou sans R |
| **GAR (gestion axée sur les résultats)** | Au niveau du chantier : objectifs, puis indicateurs avec référence, cible, réalisé et source de vérification. Cinq indicateurs se calculent seuls : points dans la tolérance, EMQ face à la borne de la classe, avancement pondéré, échéances tenues, retard en jours |
| **Évaluation** | Tableau de bord : avancement réel face au prévu, retard et atteinte moyenne des indicateurs, par chantier |

## Périmètre v1

**Dedans :** chantiers, exigences du cahier des charges, saisie des écarts de contrôle (import CSV), calcul EMQ et verdict, PV de contrôle imprimable, référentiels, saisie terrain hors ligne sur téléphone, comptes opérateur / contrôleur / chef de mission, planning Gantt, RACI, indicateurs de résultats.

**Dehors en v1 :** calculs de compensation, traitement GNSS (post-traitement), nuages de points, orthophotos, cartographie SIG complète, connexion directe aux appareils, facturation. Côté gestion : ressources et charge de travail, coûts et budget, chemin critique calculé, export MS Project, notifications, cadre logique complet (impact, effets, hypothèses), temps réel.

## Pile retenue

Monorepo : Next.js en export statique (PWA hors ligne) + API NestJS + PostgreSQL (Prisma), authentification maison. Voir les ADR 0001 (hors ligne et synchronisation) et 0002 (NestJS à la place de Supabase).

## Questions ouvertes

1. Le texte ivoirien sur les classes de précision : référence exacte ?
2. Les tables de tolérances ANCFCC et le CPT pour GNSS, drone, scanner
3. Qui sont les utilisateurs : ton bureau d'études, un client, un ami topographe ? Qui paie ?
4. Format des fichiers que sortent les appareils (CSV, GSI, JobXML, RINEX) pour l'import
5. Les modèles de tâches par nature (étapes et durées) sont une proposition : à corriger avec un topographe en exercice
6. Avant la mise en ligne : fournisseur d'e-mails, VPS, sauvegarde automatique de la base
