import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import type { RequeteAuth } from "../auth/garde-auth.js";
import { CreerOrgDto, MembreParams, OrgParams, RejoindreDto, RoleDto } from "./dto.js";
import { OrganisationsService } from "./organisations.service.js";

@Controller("organisations")
export class OrganisationsController {
  constructor(private readonly orgs: OrganisationsService) {}

  @Get()
  lister(@Req() req: RequeteAuth) {
    return this.orgs.lister(req.utilisateur.id);
  }

  @Post()
  creer(@Req() req: RequeteAuth, @Body() dto: CreerOrgDto) {
    return this.orgs.creer(req.utilisateur.id, dto.nom, dto.nomAffiche);
  }

  @Post("rejoindre") @HttpCode(200)
  rejoindre(@Req() req: RequeteAuth, @Body() dto: RejoindreDto) {
    return this.orgs.rejoindre(req.utilisateur.id, dto.code, dto.nomAffiche);
  }

  @Get(":org/membres")
  membres(@Req() req: RequeteAuth, @Param() p: OrgParams) {
    return this.orgs.membres(req.utilisateur.id, p.org);
  }

  @Patch(":org/membres/:user") @HttpCode(204)
  async changerRole(@Req() req: RequeteAuth, @Param() p: MembreParams, @Body() dto: RoleDto) {
    await this.orgs.changerRole(req.utilisateur.id, p.org, p.user, dto.role);
  }
}
