import { ValidationPipe, type INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { CONFIG, type Config } from "./config.js";
import { FiltreErreurs } from "./filtre-erreurs.js";

// Réglages communs au serveur et aux tests e2e
export function configurer(app: NestExpressApplication) {
  const config = app.get<Config>(CONFIG);
  app.setGlobalPrefix("api");
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser("json", { limit: "2mb" });
  app.enableCors({ origin: config.origineWeb, credentials: true });
  // Derrière le reverse proxy (Dokploy / Traefik) : l'IP réelle sert à la limite de débit
  if (config.production) app.set("trust proxy", 1);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new FiltreErreurs());
  app.enableShutdownHooks();
  return app as INestApplication;
}
