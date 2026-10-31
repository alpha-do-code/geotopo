import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { CONFIG, type Config } from "../config.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { EXPEDITEUR, ExpediteurJournal } from "./expediteur.js";
import { GardeAuth } from "./garde-auth.js";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [CONFIG],
      useFactory: (config: Config) => ({ secret: config.jwtSecret, signOptions: { expiresIn: "15m", algorithm: "HS256" } }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: EXPEDITEUR,
      inject: [CONFIG],
      useFactory: (config: Config) => {
        // Tant qu'aucun fournisseur n'est branché, la production refuse de démarrer
        if (config.production) throw new Error("Aucun fournisseur d'e-mails configuré : impossible de confirmer les comptes en production.");
        return new ExpediteurJournal();
      },
    },
    { provide: APP_GUARD, useClass: GardeAuth },
  ],
})
export class AuthModule {}
