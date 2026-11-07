import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { EXPEDITEUR, type Courriel, type Expediteur } from "../src/auth/expediteur.js";
import { CONFIG, lireConfig, type Config } from "../src/config.js";
import { configurer } from "../src/configurer.js";
import { PrismaService } from "../src/prisma.service.js";

export const ORIGINE = "http://localhost:3001";

// Boîte aux lettres de test : garde les e-mails au lieu de les envoyer
export class BoiteTest implements Expediteur {
  recus: Courriel[] = [];
  async envoyer(c: Courriel) {
    this.recus.push(c);
  }
  // Dernier jeton envoyé à cette adresse, lu dans le lien
  jeton(a: string, param: "confirmer" | "reinitialiser") {
    const c = [...this.recus].reverse().find((m) => m.a === a && m.texte.includes(`${param}=`));
    if (!c) throw new Error(`Aucun e-mail « ${param} » pour ${a}`);
    return c.texte.match(new RegExp(`${param}=([A-Za-z0-9_-]+)`))![1];
  }
}

// `config` permet de simuler un réglage de production (secret de relais…) sans changer d'environnement
export async function creerApp(config: Partial<Config> = {}) {
  const boite = new BoiteTest();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EXPEDITEUR)
    .useValue(boite)
    .overrideProvider(CONFIG)
    .useValue({ ...lireConfig(), ...config })
    .compile();
  const app = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configurer(app);
  await app.init();
  const prisma = app.get(PrismaService);
  const http = () => request(app.getHttpServer());
  // Remet à zéro les compteurs de débit (chaque test repart propre)
  // (hitExpirations est privé : seul moyen de vider complètement le stockage en mémoire)
  const remettreLimites = () => {
    const stock = app.get(ThrottlerStorage) as ThrottlerStorageService;
    stock.storage.clear();
    (stock as unknown as { hitExpirations: Map<string, unknown> }).hitExpirations.clear();
  };
  return { app, prisma, boite, http, remettreLimites };
}

export type Ctx = Awaited<ReturnType<typeof creerApp>>;

// Vide toutes les tables entre deux fichiers de test
export async function viderBase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    "truncate utilisateurs, organisations, sessions, jetons_email, membres, chantiers, points, taches, dependances, acteurs, raci, objectifs, indicateurs cascade",
  );
}

export const MDP = "mot-de-passe-solide";

// Inscrit, confirme et connecte un utilisateur ; renvoie son jeton d'accès et son cookie
export async function compte(ctx: Ctx, email: string, nom = email.split("@")[0]) {
  await ctx.http().post("/api/auth/inscription").send({ email, motDePasse: MDP, nomAffiche: nom }).expect(202);
  await ctx.http().post("/api/auth/confirmer").send({ jeton: ctx.boite.jeton(email, "confirmer") }).expect(200);
  const res = await ctx.http().post("/api/auth/connexion").set("origin", ORIGINE).send({ email, motDePasse: MDP }).expect(200);
  ctx.remettreLimites();
  return { jeton: res.body.jetonAcces as string, id: res.body.utilisateur.id as string, cookie: res.headers["set-cookie"] as unknown as string[] };
}
