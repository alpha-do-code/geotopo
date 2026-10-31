import { TABLES_SYNC, LOT_ENVOI, type TableSync } from "@geotopo/metier";
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsUUID, Matches } from "class-validator";

export class EnvoiDto {
  @IsUUID() org: string;
  @IsIn(TABLES_SYNC) table: TableSync;
  @IsArray() @ArrayMaxSize(LOT_ENVOI) @IsObject({ each: true }) lignes: Record<string, unknown>[];
}

// curseur : « horodatage|id » de la dernière ligne reçue (pagination par clé)
export class ReceptionDto {
  @IsUUID() org: string;
  @IsIn(TABLES_SYNC) table: TableSync;
  @IsOptional() @Matches(/^[0-9T:.+\- Z]{10,40}\|[0-9a-f-]{36}$/) curseur?: string;
}
