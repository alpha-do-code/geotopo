import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsString, IsUUID, Length, Matches, MaxLength } from "class-validator";

const sansEspaces = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class CreerOrgDto {
  @Transform(sansEspaces) @IsString() @Length(2, 120) nom: string;
  @Transform(sansEspaces) @IsString() @Length(1, 120) nomAffiche: string;
}

export class RejoindreDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @Matches(/^[0-9a-f]{12}$/, { message: "Code d'invitation invalide." })
  code: string;
  @Transform(sansEspaces) @IsString() @Length(1, 120) nomAffiche: string;
}

export class RoleDto {
  @IsIn(["chef", "operateur", "controleur"]) role: "chef" | "operateur" | "controleur";
}

export class OrgParams {
  @IsUUID() org: string;
}

export class MembreParams {
  @IsUUID() org: string;
  @IsUUID() user: string;
}

export class InvitationsDto {
  @Transform(({ value }) => (Array.isArray(value) ? [...new Set(value.map((v) => (typeof v === "string" ? v.trim().toLowerCase() : v)))] : value))
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10, { message: "10 adresses au plus par envoi." })
  @IsEmail({}, { each: true }) @MaxLength(254, { each: true })
  emails: string[];
}
