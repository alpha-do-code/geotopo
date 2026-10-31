-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- gen_random_bytes pour les codes d'invitation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "utilisateurs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "mot_de_passe" TEXT NOT NULL,
    "nom_affiche" TEXT NOT NULL DEFAULT '',
    "email_confirme_le" TIMESTAMPTZ(6),
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "utilisateur_id" UUID NOT NULL,
    "famille" UUID NOT NULL,
    "jeton_hash" TEXT NOT NULL,
    "expire_le" TIMESTAMPTZ(6) NOT NULL,
    "revoque_le" TIMESTAMPTZ(6),
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jetons_email" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "utilisateur_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "jeton_hash" TEXT NOT NULL,
    "expire_le" TIMESTAMPTZ(6) NOT NULL,
    "utilise_le" TIMESTAMPTZ(6),
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jetons_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nom" TEXT NOT NULL,
    "code_invitation" TEXT NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membres" (
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operateur',
    "nom_affiche" TEXT NOT NULL DEFAULT '',
    "rejoint_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membres_pkey" PRIMARY KEY ("org_id","user_id")
);

-- CreateTable
CREATE TABLE "chantiers" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "lieu" TEXT NOT NULL DEFAULT '',
    "client" TEXT NOT NULL DEFAULT '',
    "referentiel" TEXT NOT NULL DEFAULT 'CDC',
    "nature" TEXT NOT NULL,
    "methode" TEXT NOT NULL,
    "appareil" TEXT NOT NULL,
    "appareil_modele" TEXT NOT NULL DEFAULT '',
    "etalonnage_le" DATE,
    "classe" SMALLINT NOT NULL,
    "tolerance_cm" DECIMAL(65,30),
    "coef_tolerance" DECIMAL(65,30) NOT NULL DEFAULT 2.5,
    "systeme_coord" TEXT NOT NULL DEFAULT 'ENH',
    "type_controle" TEXT NOT NULL DEFAULT 'points_connus',
    "controle_par" TEXT NOT NULL DEFAULT 'bureau',
    "verdict" TEXT,
    "valide_par" UUID,
    "valide_le" TIMESTAMPTZ(6),
    "supprime" BOOLEAN NOT NULL DEFAULT false,
    "cree_par" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "server_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chantiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "chantier_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "systeme" TEXT NOT NULL,
    "a" DOUBLE PRECISION NOT NULL,
    "b" DOUBLE PRECISION NOT NULL,
    "c" DOUBLE PRECISION NOT NULL,
    "observation" TEXT NOT NULL DEFAULT '',
    "mesure_le" TIMESTAMPTZ(6) NOT NULL,
    "supprime" BOOLEAN NOT NULL DEFAULT false,
    "cree_par" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "server_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taches" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "chantier_id" UUID NOT NULL,
    "titre" TEXT NOT NULL,
    "debut" DATE NOT NULL,
    "fin" DATE NOT NULL,
    "avancement" SMALLINT NOT NULL DEFAULT 0,
    "jalon" BOOLEAN NOT NULL DEFAULT false,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "cle_modele" TEXT NOT NULL DEFAULT '',
    "supprime" BOOLEAN NOT NULL DEFAULT false,
    "cree_par" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "server_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependances" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "tache_id" UUID NOT NULL,
    "depend_de" UUID NOT NULL,
    "supprime" BOOLEAN NOT NULL DEFAULT false,
    "cree_par" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "server_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dependances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acteurs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "organisme" TEXT NOT NULL DEFAULT '',
    "fonction" TEXT NOT NULL DEFAULT '',
    "user_id" UUID,
    "supprime" BOOLEAN NOT NULL DEFAULT false,
    "cree_par" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "server_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acteurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raci" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "tache_id" UUID NOT NULL,
    "acteur_id" UUID NOT NULL,
    "lettre" TEXT NOT NULL,
    "supprime" BOOLEAN NOT NULL DEFAULT false,
    "cree_par" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "server_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raci_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objectifs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "chantier_id" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "supprime" BOOLEAN NOT NULL DEFAULT false,
    "cree_par" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "server_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objectifs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicateurs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "objectif_id" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "unite" TEXT NOT NULL DEFAULT '',
    "reference" DOUBLE PRECISION,
    "cible" DOUBLE PRECISION NOT NULL,
    "sens" TEXT NOT NULL DEFAULT 'hausse',
    "mode" TEXT NOT NULL DEFAULT 'manuel',
    "cle_auto" TEXT NOT NULL DEFAULT '',
    "realise" DOUBLE PRECISION,
    "source_verification" TEXT NOT NULL DEFAULT '',
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "supprime" BOOLEAN NOT NULL DEFAULT false,
    "cree_par" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "server_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indicateurs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_email_key" ON "utilisateurs"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_jeton_hash_key" ON "sessions"("jeton_hash");

-- CreateIndex
CREATE INDEX "sessions_utilisateur_id_idx" ON "sessions"("utilisateur_id");

-- CreateIndex
CREATE INDEX "sessions_famille_idx" ON "sessions"("famille");

-- CreateIndex
CREATE UNIQUE INDEX "jetons_email_jeton_hash_key" ON "jetons_email"("jeton_hash");

-- CreateIndex
CREATE INDEX "jetons_email_utilisateur_id_idx" ON "jetons_email"("utilisateur_id");

-- CreateIndex
CREATE UNIQUE INDEX "organisations_code_invitation_key" ON "organisations"("code_invitation");

-- CreateIndex
CREATE INDEX "membres_user_id_idx" ON "membres"("user_id");

-- CreateIndex
CREATE INDEX "chantiers_org_id_server_updated_at_idx" ON "chantiers"("org_id", "server_updated_at");

-- CreateIndex
CREATE INDEX "points_org_id_server_updated_at_idx" ON "points"("org_id", "server_updated_at");

-- CreateIndex
CREATE INDEX "points_chantier_id_idx" ON "points"("chantier_id");

-- CreateIndex
CREATE INDEX "taches_org_id_server_updated_at_idx" ON "taches"("org_id", "server_updated_at");

-- CreateIndex
CREATE INDEX "taches_chantier_id_idx" ON "taches"("chantier_id");

-- CreateIndex
CREATE INDEX "dependances_org_id_server_updated_at_idx" ON "dependances"("org_id", "server_updated_at");

-- CreateIndex
CREATE INDEX "acteurs_org_id_server_updated_at_idx" ON "acteurs"("org_id", "server_updated_at");

-- CreateIndex
CREATE INDEX "raci_org_id_server_updated_at_idx" ON "raci"("org_id", "server_updated_at");

-- CreateIndex
CREATE INDEX "objectifs_org_id_server_updated_at_idx" ON "objectifs"("org_id", "server_updated_at");

-- CreateIndex
CREATE INDEX "indicateurs_org_id_server_updated_at_idx" ON "indicateurs"("org_id", "server_updated_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jetons_email" ADD CONSTRAINT "jetons_email_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membres" ADD CONSTRAINT "membres_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membres" ADD CONSTRAINT "membres_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chantiers" ADD CONSTRAINT "chantiers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points" ADD CONSTRAINT "points_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points" ADD CONSTRAINT "points_chantier_id_fkey" FOREIGN KEY ("chantier_id") REFERENCES "chantiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches" ADD CONSTRAINT "taches_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches" ADD CONSTRAINT "taches_chantier_id_fkey" FOREIGN KEY ("chantier_id") REFERENCES "chantiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependances" ADD CONSTRAINT "dependances_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependances" ADD CONSTRAINT "dependances_tache_id_fkey" FOREIGN KEY ("tache_id") REFERENCES "taches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependances" ADD CONSTRAINT "dependances_depend_de_fkey" FOREIGN KEY ("depend_de") REFERENCES "taches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acteurs" ADD CONSTRAINT "acteurs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raci" ADD CONSTRAINT "raci_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raci" ADD CONSTRAINT "raci_tache_id_fkey" FOREIGN KEY ("tache_id") REFERENCES "taches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raci" ADD CONSTRAINT "raci_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "acteurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectifs" ADD CONSTRAINT "objectifs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectifs" ADD CONSTRAINT "objectifs_chantier_id_fkey" FOREIGN KEY ("chantier_id") REFERENCES "chantiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicateurs" ADD CONSTRAINT "indicateurs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicateurs" ADD CONSTRAINT "indicateurs_objectif_id_fkey" FOREIGN KEY ("objectif_id") REFERENCES "objectifs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Ajouts manuels : ce que Prisma ne décrit pas ────────────────────────────


ALTER TABLE "utilisateurs"
  ADD CONSTRAINT utilisateurs_email_ck CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
  ADD CONSTRAINT utilisateurs_nom_ck CHECK (char_length(nom_affiche) <= 120);
ALTER TABLE "jetons_email" ADD CONSTRAINT jetons_type_ck CHECK (type IN ('confirmation', 'reinitialisation'));
ALTER TABLE "organisations" ADD CONSTRAINT organisations_nom_ck CHECK (char_length(nom) BETWEEN 2 AND 120);
ALTER TABLE "membres"
  ADD CONSTRAINT membres_role_ck CHECK (role IN ('chef', 'operateur', 'controleur')),
  ADD CONSTRAINT membres_nom_ck CHECK (char_length(nom_affiche) <= 120);

ALTER TABLE "chantiers"
  ADD CONSTRAINT chantiers_nom_ck CHECK (char_length(nom) BETWEEN 1 AND 200),
  ADD CONSTRAINT chantiers_lieu_ck CHECK (char_length(lieu) <= 200),
  ADD CONSTRAINT chantiers_client_ck CHECK (char_length(client) <= 200),
  ADD CONSTRAINT chantiers_referentiel_ck CHECK (referentiel IN ('CI', 'MA', 'CDC')),
  ADD CONSTRAINT chantiers_nature_ck CHECK (nature IN ('bornage', 'topo_rurale', 'topo_urbaine', 'auscultation', 'leves_implantations')),
  ADD CONSTRAINT chantiers_methode_ck CHECK (methode IN ('polygonation', 'gnss_rtk', 'gnss_statique', 'photogrammetrie_drone', 'balayage_laser', 'rayonnement')),
  ADD CONSTRAINT chantiers_appareil_ck CHECK (appareil IN ('gnss', 'station_totale', 'station_totale_robotisee', 'niveau', 'drone', 'scanner_laser')),
  ADD CONSTRAINT chantiers_modele_ck CHECK (char_length(appareil_modele) <= 200),
  ADD CONSTRAINT chantiers_classe_ck CHECK (classe BETWEEN 0 AND 5),
  ADD CONSTRAINT chantiers_tolerance_ck CHECK (tolerance_cm IS NULL OR tolerance_cm > 0),
  ADD CONSTRAINT chantiers_coef_ck CHECK (coef_tolerance > 0 AND coef_tolerance <= 10),
  ADD CONSTRAINT chantiers_systeme_ck CHECK (systeme_coord IN ('ENH', 'XYZ')),
  ADD CONSTRAINT chantiers_type_controle_ck CHECK (type_controle IN ('reobservation', 'points_connus', 'echantillonnage')),
  ADD CONSTRAINT chantiers_controle_par_ck CHECK (controle_par IN ('operateur', 'bureau')),
  ADD CONSTRAINT chantiers_verdict_ck CHECK (verdict IS NULL OR verdict IN ('conforme', 'non_conforme'));

ALTER TABLE "points"
  ADD CONSTRAINT points_code_ck CHECK (char_length(code) BETWEEN 1 AND 60),
  ADD CONSTRAINT points_phase_ck CHECK (phase IN ('leve', 'controle')),
  ADD CONSTRAINT points_systeme_ck CHECK (systeme IN ('ENH', 'XYZ')),
  ADD CONSTRAINT points_obs_ck CHECK (char_length(observation) <= 1000);

ALTER TABLE "taches"
  ADD CONSTRAINT taches_titre_ck CHECK (char_length(titre) BETWEEN 1 AND 200),
  ADD CONSTRAINT taches_dates_ck CHECK (fin >= debut),
  ADD CONSTRAINT taches_avancement_ck CHECK (avancement BETWEEN 0 AND 100),
  ADD CONSTRAINT taches_cle_ck CHECK (char_length(cle_modele) <= 60);
ALTER TABLE "dependances" ADD CONSTRAINT dependances_boucle_ck CHECK (tache_id <> depend_de);
ALTER TABLE "acteurs"
  ADD CONSTRAINT acteurs_nom_ck CHECK (char_length(nom) BETWEEN 1 AND 120),
  ADD CONSTRAINT acteurs_organisme_ck CHECK (char_length(organisme) <= 120),
  ADD CONSTRAINT acteurs_fonction_ck CHECK (char_length(fonction) <= 120);
ALTER TABLE "raci" ADD CONSTRAINT raci_lettre_ck CHECK (lettre IN ('R', 'A', 'C', 'I'));
ALTER TABLE "objectifs" ADD CONSTRAINT objectifs_libelle_ck CHECK (char_length(libelle) BETWEEN 1 AND 300);
ALTER TABLE "indicateurs"
  ADD CONSTRAINT indicateurs_libelle_ck CHECK (char_length(libelle) BETWEEN 1 AND 300),
  ADD CONSTRAINT indicateurs_unite_ck CHECK (char_length(unite) <= 30),
  ADD CONSTRAINT indicateurs_sens_ck CHECK (sens IN ('hausse', 'baisse')),
  ADD CONSTRAINT indicateurs_mode_ck CHECK (mode IN ('manuel', 'auto')),
  ADD CONSTRAINT indicateurs_cle_ck CHECK (char_length(cle_auto) <= 60),
  ADD CONSTRAINT indicateurs_source_ck CHECK (char_length(source_verification) <= 500);

-- Curseur de synchro : clock_timestamp() et non now(), sinon toutes les lignes d'une même
-- transaction partagent la même date et le curseur « strictement après » en perdrait.
CREATE OR REPLACE FUNCTION poser_server_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.server_updated_at := clock_timestamp();
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chantiers', 'points', 'taches', 'dependances', 'acteurs', 'raci', 'objectifs', 'indicateurs'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION poser_server_updated_at()', t || '_curseur', t);
  END LOOP;
END $$;
