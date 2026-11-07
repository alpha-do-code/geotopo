import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { CONFIG, type Config } from "../config.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { EXPEDITEUR, ExpediteurJournal, ExpediteurSmtp } from "./expediteur.js";
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
      // La configuration impose le SMTP en production (voir config.ts)
      useFactory: (config: Config) => (config.smtp ? new ExpediteurSmtp(config.smtp.url, config.smtp.expediteur) : new ExpediteurJournal()),
    },
    { provide: APP_GUARD, useClass: GardeAuth },
  ],
})
export class AuthModule {}
