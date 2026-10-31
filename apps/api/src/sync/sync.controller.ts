import { Body, Controller, Get, HttpCode, Post, Query, Req } from "@nestjs/common";
import type { RequeteAuth } from "../auth/garde-auth.js";
import { EnvoiDto, ReceptionDto } from "./dto.js";
import { SyncService } from "./sync.service.js";

@Controller("sync")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post("envoyer") @HttpCode(200)
  envoyer(@Req() req: RequeteAuth, @Body() dto: EnvoiDto) {
    return this.sync.envoyer(req.utilisateur.id, dto.org, dto.table, dto.lignes);
  }

  @Get("recevoir")
  recevoir(@Req() req: RequeteAuth, @Query() dto: ReceptionDto) {
    return this.sync.recevoir(req.utilisateur.id, dto.org, dto.table, dto.curseur);
  }
}
