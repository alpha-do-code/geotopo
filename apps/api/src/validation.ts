import { BadRequestException, type ValidationError } from "@nestjs/common";

// Les messages de class-validator sont en anglais et parlent du code (« nomAffiche must be… »).
// L'utilisateur reçoit à la place le nom du champ en français.
const LIBELLES: Record<string, string> = {
  email: "l'adresse e-mail",
  motDePasse: "le mot de passe (8 caractères au moins)",
  nouveau: "le nouveau mot de passe (8 caractères au moins)",
  telephone: "le numéro de téléphone",
  identifiant: "le numéro de téléphone",
  emails: "les adresses e-mail",
  nom: "le nom",
  nomAffiche: "ton nom, tel que l'équipe le verra",
  jeton: "le lien reçu par e-mail",
  code: "le code d'invitation",
  role: "le rôle",
};

export function erreurDeValidation(erreurs: ValidationError[]) {
  const champs = [...new Set(erreurs.map((e) => e.property))];
  const lisibles = champs.filter((c) => LIBELLES[c]).map((c) => LIBELLES[c]);
  const message = lisibles.length ? `Vérifie ${lisibles.join(", ")}.` : "Requête invalide.";
  return new BadRequestException({ statusCode: 400, message, error: "Bad Request", champs });
}
