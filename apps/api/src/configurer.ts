import { ValidationPipe, type INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { CONFIG, type Config } from "./config.js";
import { FiltreErreurs } from "./filtre-erreurs.js";
import { exigerRelais } from "./relais.js";
import { erreurDeValidation } from "./validation.js";

// Réglages communs au serveur et aux tests e2e
export function configurer(app: NestExpressApplication) {
  const config = app.get<Config>(CONFIG);
  app.setGlobalPrefix("api");
  if (config.relaisSecret) app.use(exigerRelais(config.relaisSecret));
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser("json", { limit: "2mb" });
  app.enableCors({ origin: config.origineWeb, credentials: true });
  // Derrière le proxy de Render ; l'IP du visiteur, elle, arrive par le Worker (voir relais.ts)
  if (config.production) app.set("trust proxy", 1);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: erreurDeValidation }));
  app.useGlobalFilters(new FiltreErreurs());
  app.enableShutdownHooks();
  return app as INestApplication;
}
