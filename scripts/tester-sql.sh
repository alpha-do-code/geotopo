#!/usr/bin/env bash
# Teste les migrations sur une base PostgreSQL jetable qui imite Supabase
# (rôles anon / authenticated, schéma auth, auth.uid() lu dans request.jwt.claim.sub).
# Chaque migration est appliquée deux fois pour vérifier qu'elle est rejouable.
set -euo pipefail
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d /tmp/gt.XXXXXX)"
PORT=54329
trap 'pg_ctl -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

initdb -D "$TMP/data" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP" -l "$TMP/log" start >/dev/null || { cat "$TMP/log"; exit 1; }
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -o /dev/null <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase donne par défaut des droits larges : on les imite pour vérifier que la migration les retire
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111'), -- chef A
  ('22222222-2222-2222-2222-222222222222'), -- opérateur A
  ('33333333-3333-3333-3333-333333333333'); -- étranger (autre organisation)
SQL

for f in "$RACINE"/supabase/migrations/*.sql; do
  PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$f"
  PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$f"
done

"${PSQL[@]}" -o /dev/null <<'SQL'
create function pg_temp.en_tant_que(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.attendre(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'ÉCHEC : %', msg; end if;
  raise notice 'ok : %', msg;
end $$;

-- Le chef crée son organisation, l'opérateur la rejoint
select pg_temp.en_tant_que('11111111-1111-1111-1111-111111111111');
create temp table ctx as select public.creer_organisation('Cabinet A', 'Chef A') as org;
grant select on ctx to authenticated;
reset role;
alter table ctx add column code text;
update ctx set code = (select code_invitation from organisations where id = ctx.org);
select pg_temp.en_tant_que('22222222-2222-2222-2222-222222222222');
select public.rejoindre_organisation((select code from ctx), 'Opérateur A');
select pg_temp.attendre((select role from membres where user_id = auth.uid()) = 'operateur', 'un membre qui rejoint est opérateur');

-- L'opérateur saisit un chantier et un point
insert into chantiers (id, org_id, nom, nature, methode, appareil, classe, updated_at, verdict)
  values ('aaaaaaaa-0000-0000-0000-000000000001', (select org from ctx), 'Lotissement', 'bornage', 'gnss_rtk', 'gnss', 1, '2026-10-31T10:00:00Z', 'conforme');
select pg_temp.attendre((select verdict from chantiers) is null, 'un opérateur ne peut pas poser de verdict');
insert into points (id, org_id, chantier_id, code, phase, systeme, a, b, c, mesure_le, updated_at)
  values ('bbbbbbbb-0000-0000-0000-000000000001', (select org from ctx), 'aaaaaaaa-0000-0000-0000-000000000001', 'B1', 'leve', 'ENH', 1, 2, 3, now(), '2026-10-31T10:00:00Z');

-- La plus récente gagne : une modification plus ancienne est ignorée
update chantiers set nom = 'Ancien nom', updated_at = '2026-10-31T09:00:00Z';
select pg_temp.attendre((select nom from chantiers) = 'Lotissement', 'une modification plus ancienne est ignorée');
update chantiers set nom = 'Nouveau nom', updated_at = '2026-10-31T11:00:00Z';
select pg_temp.attendre((select nom from chantiers) = 'Nouveau nom', 'une modification plus récente est appliquée');

-- Le chef valide
reset role;
select pg_temp.en_tant_que('11111111-1111-1111-1111-111111111111');
update chantiers set verdict = 'conforme', updated_at = '2026-10-31T12:00:00Z';
select pg_temp.attendre((select valide_par from chantiers) = '11111111-1111-1111-1111-111111111111', 'le chef valide le contrôle');

-- Une copie locale ancienne de l'opérateur n'efface pas la validation
reset role;
select pg_temp.en_tant_que('22222222-2222-2222-2222-222222222222');
update chantiers set verdict = null, nom = 'Renommé', updated_at = '2026-10-31T13:00:00Z';
select pg_temp.attendre((select verdict from chantiers) = 'conforme' and (select nom from chantiers) = 'Renommé', 'l''opérateur synchronise sans effacer la validation');

-- Un étranger ne voit rien et ne peut rien écrire
reset role;
select pg_temp.en_tant_que('33333333-3333-3333-3333-333333333333');
select pg_temp.attendre((select count(*) from chantiers) = 0 and (select count(*) from points) = 0, 'un étranger ne voit aucune donnée');
select pg_temp.attendre((select count(*) from organisations) = 0, 'un étranger ne voit pas l''organisation ni son code');
do $$ begin
  insert into chantiers (id, org_id, nom, nature, methode, appareil, classe, updated_at)
    values (gen_random_uuid(), (select org from ctx), 'Intrus', 'bornage', 'gnss_rtk', 'gnss', 1, now());
  raise exception 'ÉCHEC : un étranger a pu créer un chantier';
exception when insufficient_privilege then raise notice 'ok : un étranger ne peut pas créer de chantier';
end $$;
update chantiers set nom = 'Piraté', updated_at = '2099-01-01';
reset role;
select pg_temp.attendre((select nom from chantiers) = 'Renommé', 'un étranger ne peut pas modifier un chantier');

-- Anonyme : aucun accès
set role anon;
do $$ begin
  perform count(*) from chantiers;
  raise exception 'ÉCHEC : anon lit les chantiers';
exception when insufficient_privilege then raise notice 'ok : anon ne lit pas les chantiers';
end $$;
do $$ begin
  perform public.creer_organisation('x', 'y');
  raise exception 'ÉCHEC : anon exécute creer_organisation';
exception when insufficient_privilege then raise notice 'ok : anon ne peut pas créer d''organisation';
end $$;
reset role;

-- Un point ne peut pas viser le chantier d'une autre organisation
select pg_temp.en_tant_que('33333333-3333-3333-3333-333333333333');
create temp table ctx2 as select public.creer_organisation('Cabinet B', 'Étranger') as org;
do $$ begin
  insert into points (id, org_id, chantier_id, code, phase, systeme, a, b, c, mesure_le, updated_at)
    values (gen_random_uuid(), (select org from ctx2), 'aaaaaaaa-0000-0000-0000-000000000001', 'X', 'leve', 'ENH', 0, 0, 0, now(), now());
  raise exception 'ÉCHEC : point rattaché au chantier d''une autre organisation';
exception when raise_exception then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  raise notice 'ok : un point reste dans l''organisation de son chantier';
end $$;
reset role;
SQL

echo "Tous les tests SQL sont passés."
