import { normaliserTelephone } from "@geotopo/metier";
import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

const sansEspaces = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
// Un e-mail facultatif laissé vide arrive en chaîne vide : on le traite comme absent
const emailFacultatif = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() || undefined : value);
// Numéro ramené à la forme +221…, ou chaîne vide s'il est invalide (refusé par @Matches)
const telephone = ({ value }: { value: unknown }) => (typeof value === "string" ? (normaliserTelephone(value) ?? "") : value);

const E164 = /^\+[1-9]\d{7,14}$/;
const MDP = { message: "Le mot de passe doit faire au moins 8 caractères." };

export class InscriptionDto {
  @Transform(telephone) @IsString() @Matches(E164, { message: "Numéro de téléphone invalide." }) telephone: string;
  @IsString() @Length(8, 200, MDP) motDePasse: string;
  @Transform(sansEspaces) @IsString() @Length(1, 120) nomAffiche: string;
  @IsOptional() @Transform(emailFacultatif) @IsEmail() @MaxLength(254) email?: string;
}

// Identifiant : un numéro de téléphone, ou l'e-mail des comptes créés avant le passage au numéro
export class ConnexionDto {
  @Transform(sansEspaces) @IsString() @Length(1, 254) identifiant: string;
  @IsString() @MaxLength(200) motDePasse: string;
}

export class JetonDto {
  @IsString() @Length(20, 200) jeton: string;
}

export class OubliDto {
  @Transform(sansEspaces) @IsString() @Length(1, 254) identifiant: string;
}

export class ReinitialisationDto {
  @IsString() @Length(20, 200) jeton: string;
  @IsString() @Length(8, 200, MDP) motDePasse: string;
}

export class ChangementMdpDto {
  @IsString() @MaxLength(200) actuel: string;
  @IsString() @Length(8, 200, MDP) nouveau: string;
}

