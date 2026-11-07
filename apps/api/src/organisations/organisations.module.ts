import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AccesService } from "./acces.service.js";
import { OrganisationsController } from "./organisations.controller.js";
import { OrganisationsService } from "./organisations.service.js";

@Module({
  imports: [AuthModule],
  controllers: [OrganisationsController],
  providers: [OrganisationsService, AccesService],
  exports: [AccesService],
})
export class OrganisationsModule {}
