import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// En développement, DATABASE_URL vient de .env ; en production, de l'hébergeur.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
