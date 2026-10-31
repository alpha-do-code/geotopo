import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module.js";
import { CONFIG, lireConfig } from "./config.js";
import { OrganisationsModule } from "./organisations/organisations.module.js";
import { PrismaService } from "./prisma.service.js";
import { SanteController } from "./sante.controller.js";

@Global()
@Module({
  imports: [
    // Limite générale par adresse IP ; la connexion a sa propre limite, plus stricte
    ThrottlerModule.forRoot([{ name: "general", ttl: 60_000, limit: 300 }]),
    AuthModule,
    OrganisationsModule,
  ],
  controllers: [SanteController],
  providers: [
    { provide: CONFIG, useFactory: () => lireConfig() },
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [CONFIG, PrismaService],
})
export class AppModule {}
