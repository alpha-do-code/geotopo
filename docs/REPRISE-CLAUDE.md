# REPRISE-CLAUDE : GeoTopo

*Mis à jour le 31/10/2026.*

## Où on en est

- Phase : **cadrage / maquette**. Aucun code applicatif, pas encore de dépôt Git
- Maquette cliquable (4 écrans) : https://claude.ai/artifact/TaDuDFBbwhpSaEoMtbUpRR
  1. Tableau de bord des chantiers (filtres par statut)
  2. Fiche chantier et contrôle (classe exigée, méthode, alerte de compatibilité, écarts, EMQ, verdict)
  3. Référentiels (Côte d'Ivoire, Maroc, matrice méthode / appareil / classe)
  4. Saisie terrain sur téléphone (levé / contrôle, hors ligne)
- Cadrage et sources : `docs/CADRAGE.md`

## Décisions prises

- Utilisateurs : une équipe / un bureau d'études, donc comptes et données partagées
- Maquette avant code (principe 7)
- Règle d'acceptation proposée : EMQ ≤ classe, aucun écart > 2,5 × classe

## Prochaine étape

Faire valider la maquette, récupérer les textes manquants (classes de précision ivoiriennes, tables ANCFCC), puis trancher la pile dans un ADR.
