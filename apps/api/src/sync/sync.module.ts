import { Module } from "@nestjs/common";
import { OrganisationsModule } from "../organisations/organisations.module.js";
import { SyncController } from "./sync.controller.js";
import { SyncService } from "./sync.service.js";

@Module({ imports: [OrganisationsModule], controllers: [SyncController], providers: [SyncService] })
export class SyncModule {}
