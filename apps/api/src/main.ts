import { existsSync } from "node:fs";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { CONFIG, type Config } from "./config.js";
import { configurer } from "./configurer.js";

// En développement, les variables viennent de .env ; en production, de l'hébergeur
if (existsSync(".env")) process.loadEnvFile(".env");

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
configurer(app);
const { port } = app.get<Config>(CONFIG);
await app.listen(port);
new Logger("GeoTopo").log(`API sur le port ${port}`);
