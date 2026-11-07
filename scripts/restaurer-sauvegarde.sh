#!/usr/bin/env bash
# Restaure une sauvegarde chiffrée (artefact de l'action « Sauvegarde de la base ») dans une base cible.
#   scripts/restaurer-sauvegarde.sh <fichier.dump.age> <cle-privee-age.txt> <URL de la base cible>
# La base cible est écrasée (--clean). Restaurer d'abord dans une base vide pour vérifier, jamais
# directement en production sans avoir regardé le contenu.
set -euo pipefail
[ $# -eq 3 ] || { echo "Usage : $0 <fichier.dump.age> <cle-privee.txt> <URL cible>" >&2; exit 2; }
FICHIER="$1"; CLE="$2"; CIBLE="$3"
age -d -i "$CLE" "$FICHIER" | pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error -d "$CIBLE"
echo "Restauration terminée dans la base cible."
