import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../src/app.module.js";
import { configurer } from "../src/configurer.js";
import { PrismaService } from "../src/prisma.service.js";

export async function creerApp() {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configurer(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

// Vide toutes les tables entre deux fichiers de test
export async function viderBase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    "truncate utilisateurs, organisations, sessions, jetons_email, membres, chantiers, points, taches, dependances, acteurs, raci, objectifs, indicateurs cascade",
  );
}
