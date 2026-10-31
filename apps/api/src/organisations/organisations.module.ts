import { Module } from "@nestjs/common";
import { AccesService } from "./acces.service.js";
import { OrganisationsController } from "./organisations.controller.js";
import { OrganisationsService } from "./organisations.service.js";

@Module({
  controllers: [OrganisationsController],
  providers: [OrganisationsService, AccesService],
  exports: [AccesService],
})
export class OrganisationsModule {}
