#!/usr/bin/env bash
# Preuve de bout en bout de la chaîne de sauvegarde, en local : dump de la base de développement,
# chiffrement age, déchiffrement et restauration par scripts/restaurer-sauvegarde.sh dans une base
# jetable, puis comparaison du nombre de lignes de chaque table. Rien n'est modifié dans la source.
set -euo pipefail
SOURCE="${1:-geotopo}"
CIBLE="geotopo_restau_$$"
TMP="$(mktemp -d)"
trap 'dropdb --if-exists "$CIBLE" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

age-keygen -o "$TMP/cle.txt" 2>/dev/null
PUBLIQUE="$(age-keygen -y "$TMP/cle.txt")"
pg_dump --format=custom --no-owner --no-privileges -d "$SOURCE" | age -r "$PUBLIQUE" > "$TMP/s.dump.age"
createdb "$CIBLE"
"$(dirname "$0")/restaurer-sauvegarde.sh" "$TMP/s.dump.age" "$TMP/cle.txt" "$CIBLE" >/dev/null

compter() {
  psql -d "$1" -Atc "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1" |
    while read -r t; do echo "$t $(psql -d "$1" -Atc "select count(*) from \"$t\"")"; done
}
compter "$SOURCE" > "$TMP/avant"
compter "$CIBLE" > "$TMP/apres"
if diff -u "$TMP/avant" "$TMP/apres"; then
  echo "OK : $(wc -l < "$TMP/avant" | tr -d ' ') tables, $(awk '{s+=$2} END {print s}' "$TMP/avant") lignes restaurées à l'identique."
else
  echo "ÉCHEC : la restauration diffère de la source." >&2; exit 1
fi
