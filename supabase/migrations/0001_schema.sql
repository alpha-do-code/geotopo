-- GeoTopo : schéma initial.
-- Rejouable : chaque objet est créé « if not exists » ou remplacé.
-- Modèle d'accès : un utilisateur voit et modifie les données des organisations dont il est membre.

create extension if not exists pgcrypto;

-- Organisations (bureau d'études, cabinet, équipe)
create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(nom) between 2 and 120),
  code_invitation text not null unique default encode(gen_random_bytes(6), 'hex'),
  cree_le timestamptz not null default now()
);

create table if not exists public.membres (
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'operateur' check (role in ('chef', 'operateur', 'controleur')),
  nom_affiche text not null default '' check (char_length(nom_affiche) <= 120),
  rejoint_le timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Les identifiants sont générés sur l'appareil (saisie hors ligne).
-- updated_at : horodatage de l'appareil, sert à départager les modifications (la plus récente gagne).
-- server_updated_at : posé par la base, sert de curseur pour la synchronisation descendante.
create table if not exists public.chantiers (
  id uuid primary key,
  org_id uuid not null references public.organisations(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 200),
  lieu text not null default '' check (char_length(lieu) <= 200),
  client text not null default '' check (char_length(client) <= 200),
  referentiel text not null default 'CDC' check (referentiel in ('CI', 'MA', 'CDC')),
  nature text not null check (nature in ('bornage', 'topo_rurale', 'topo_urbaine', 'auscultation', 'leves_implantations')),
  methode text not null check (methode in ('polygonation', 'gnss_rtk', 'gnss_statique', 'photogrammetrie_drone', 'balayage_laser', 'rayonnement')),
  appareil text not null check (appareil in ('gnss', 'station_totale', 'station_totale_robotisee', 'niveau', 'drone', 'scanner_laser')),
  appareil_modele text not null default '' check (char_length(appareil_modele) <= 200),
  etalonnage_le date,
  classe smallint not null check (classe between 0 and 5),
  tolerance_cm numeric check (tolerance_cm is null or tolerance_cm > 0),
  coef_tolerance numeric not null default 2.5 check (coef_tolerance > 0 and coef_tolerance <= 10),
  systeme_coord text not null default 'ENH' check (systeme_coord in ('ENH', 'XYZ')),
  type_controle text not null default 'points_connus' check (type_controle in ('reobservation', 'points_connus', 'echantillonnage')),
  controle_par text not null default 'bureau' check (controle_par in ('operateur', 'bureau')),
  verdict text check (verdict is null or verdict in ('conforme', 'non_conforme')),
  valide_par uuid references auth.users(id),
  valide_le timestamptz,
  supprime boolean not null default false,
  cree_par uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.points (
  id uuid primary key,
  org_id uuid not null references public.organisations(id) on delete cascade,
  chantier_id uuid not null references public.chantiers(id) on delete cascade,
  code text not null check (char_length(code) between 1 and 60),
  phase text not null check (phase in ('leve', 'controle')),
  systeme text not null check (systeme in ('ENH', 'XYZ')),
  a double precision not null,
  b double precision not null,
  c double precision not null,
  observation text not null default '' check (char_length(observation) <= 1000),
  mesure_le timestamptz not null,
  supprime boolean not null default false,
  cree_par uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now()
);

create index if not exists chantiers_sync_idx on public.chantiers (org_id, server_updated_at);
create index if not exists points_sync_idx on public.points (org_id, server_updated_at);
create index if not exists points_chantier_idx on public.points (chantier_id);

-- Fonctions d'aide aux règles d'accès (security definer : lisent membres sans boucle de RLS)
create or replace function public.est_membre(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from membres where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.role_dans(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from membres where org_id = p_org and user_id = auth.uid();
$$;

-- Horodatage serveur, et refus d'écraser une version plus récente (la plus récente gagne)
create or replace function public.avant_ecriture_sync()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- modification plus ancienne que la version en base : ignorée
  end if;
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then
    raise exception 'Changement d''organisation interdit';
  end if;
  new.server_updated_at := clock_timestamp(); -- distinct par ligne, pour un curseur sans ex aequo
  return new;
end;
$$;

-- Seuls le chef de mission et le contrôleur valident un contrôle.
-- Pour les autres, le verdict en base est conservé sans erreur : une copie locale ancienne
-- d'un opérateur ne doit ni bloquer sa synchronisation ni effacer une validation.
create or replace function public.verifier_validation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_peut_valider boolean := coalesce(role_dans(new.org_id), '') in ('chef', 'controleur');
begin
  if tg_op = 'INSERT' then
    if new.verdict is not null and v_peut_valider then
      new.valide_par := auth.uid();
      new.valide_le := now();
    else
      new.verdict := null;
      new.valide_par := null;
      new.valide_le := null;
    end if;
  elsif new.verdict is distinct from old.verdict and v_peut_valider then
    new.valide_par := case when new.verdict is null then null else auth.uid() end;
    new.valide_le := case when new.verdict is null then null else now() end;
  else
    new.verdict := old.verdict;
    new.valide_par := old.valide_par;
    new.valide_le := old.valide_le;
  end if;
  return new;
end;
$$;

drop trigger if exists chantiers_sync on public.chantiers;
create trigger chantiers_sync before insert or update on public.chantiers
  for each row execute function public.avant_ecriture_sync();
drop trigger if exists chantiers_validation on public.chantiers;
create trigger chantiers_validation before insert or update on public.chantiers
  for each row execute function public.verifier_validation();
drop trigger if exists points_sync on public.points;
create trigger points_sync before insert or update on public.points
  for each row execute function public.avant_ecriture_sync();

-- Un point appartient à l'organisation de son chantier
create or replace function public.verifier_point_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from chantiers where id = new.chantier_id and org_id = new.org_id) then
    raise exception 'Le point et son chantier doivent appartenir à la même organisation';
  end if;
  return new;
end;
$$;
drop trigger if exists points_org on public.points;
create trigger points_org before insert or update on public.points
  for each row execute function public.verifier_point_org();

-- Créer une organisation : l'auteur en devient chef
create or replace function public.creer_organisation(p_nom text, p_nom_affiche text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  insert into organisations (nom) values (trim(p_nom)) returning id into v_id;
  insert into membres (org_id, user_id, role, nom_affiche) values (v_id, auth.uid(), 'chef', left(trim(coalesce(p_nom_affiche, '')), 120));
  return v_id;
end;
$$;

-- Rejoindre une organisation avec son code : on entre comme opérateur
create or replace function public.rejoindre_organisation(p_code text, p_nom_affiche text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select id into v_id from organisations where code_invitation = lower(trim(p_code));
  if v_id is null then raise exception 'Code d''invitation inconnu'; end if;
  insert into membres (org_id, user_id, role, nom_affiche) values (v_id, auth.uid(), 'operateur', left(trim(coalesce(p_nom_affiche, '')), 120))
    on conflict (org_id, user_id) do nothing;
  return v_id;
end;
$$;

-- Le chef change le rôle d'un membre (pas le sien, pour qu'il reste toujours un chef)
create or replace function public.changer_role(p_org uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if role_dans(p_org) is distinct from 'chef' then raise exception 'Réservé au chef de mission'; end if;
  if p_user = auth.uid() then raise exception 'Impossible de changer son propre rôle'; end if;
  if p_role not in ('chef', 'operateur', 'controleur') then raise exception 'Rôle inconnu'; end if;
  update membres set role = p_role where org_id = p_org and user_id = p_user;
end;
$$;

-- Règles d'accès
alter table public.organisations enable row level security;
alter table public.membres enable row level security;
alter table public.chantiers enable row level security;
alter table public.points enable row level security;

revoke all on public.organisations, public.membres, public.chantiers, public.points from anon;
revoke all on function public.creer_organisation(text, text), public.rejoindre_organisation(text, text), public.changer_role(uuid, uuid, text) from anon, public;
grant execute on function public.creer_organisation(text, text), public.rejoindre_organisation(text, text), public.changer_role(uuid, uuid, text) to authenticated;
grant select on public.organisations, public.membres to authenticated;
grant select, insert, update on public.chantiers, public.points to authenticated;

drop policy if exists org_lecture on public.organisations;
create policy org_lecture on public.organisations for select to authenticated using (public.est_membre(id));

drop policy if exists membres_lecture on public.membres;
create policy membres_lecture on public.membres for select to authenticated using (public.est_membre(org_id));

drop policy if exists chantiers_lecture on public.chantiers;
create policy chantiers_lecture on public.chantiers for select to authenticated using (public.est_membre(org_id));
drop policy if exists chantiers_ajout on public.chantiers;
create policy chantiers_ajout on public.chantiers for insert to authenticated with check (public.est_membre(org_id));
drop policy if exists chantiers_modif on public.chantiers;
create policy chantiers_modif on public.chantiers for update to authenticated using (public.est_membre(org_id)) with check (public.est_membre(org_id));

drop policy if exists points_lecture on public.points;
create policy points_lecture on public.points for select to authenticated using (public.est_membre(org_id));
drop policy if exists points_ajout on public.points;
create policy points_ajout on public.points for insert to authenticated with check (public.est_membre(org_id));
drop policy if exists points_modif on public.points;
create policy points_modif on public.points for update to authenticated using (public.est_membre(org_id)) with check (public.est_membre(org_id));
