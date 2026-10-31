import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, MaxLength } from "class-validator";

const minuscules = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value);
const sansEspaces = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class InscriptionDto {
  @Transform(minuscules) @IsEmail() @MaxLength(254) email: string;
  @IsString() @Length(10, 200, { message: "Le mot de passe doit faire au moins 10 caractères." }) motDePasse: string;
  @Transform(sansEspaces) @IsString() @Length(1, 120) nomAffiche: string;
}

export class ConnexionDto {
  @Transform(minuscules) @IsEmail() @MaxLength(254) email: string;
  @IsString() @MaxLength(200) motDePasse: string;
}

export class JetonDto {
  @IsString() @Length(20, 200) jeton: string;
}

export class OubliDto {
  @Transform(minuscules) @IsEmail() @MaxLength(254) email: string;
}

export class ReinitialisationDto {
  @IsString() @Length(20, 200) jeton: string;
  @IsString() @Length(10, 200, { message: "Le mot de passe doit faire au moins 10 caractères." }) motDePasse: string;
}
