-- Connexion par numéro de téléphone ; e-mail facultatif ; mot de passe provisoire donné par un chef.
ALTER TABLE "utilisateurs" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "utilisateurs"
  ADD COLUMN "telephone" TEXT,
  ADD COLUMN "doit_changer_mdp" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mdp_provisoire_par" UUID,
  ADD COLUMN "mdp_provisoire_le" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "utilisateurs_telephone_key" ON "utilisateurs"("telephone");

ALTER TABLE "utilisateurs"
  -- Format E.164 : « + » puis 8 à 15 chiffres
  ADD CONSTRAINT utilisateurs_telephone_ck CHECK (telephone IS NULL OR telephone ~ '^\+[1-9][0-9]{7,14}$'),
  -- Un compte a toujours au moins un moyen de se connecter
  ADD CONSTRAINT utilisateurs_identifiant_ck CHECK (telephone IS NOT NULL OR email IS NOT NULL);
