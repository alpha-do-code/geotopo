// Configuration lue une fois au démarrage. En production, une valeur manquante ou dangereuse
// arrête le serveur plutôt que de le laisser tourner mal protégé.

export type Config = {
  production: boolean;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  origineWeb: string;
};

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  const erreurs: string[] = [];

  const databaseUrl = env.DATABASE_URL ?? "";
  if (!databaseUrl) erreurs.push("DATABASE_URL manquant");

  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32) erreurs.push("JWT_SECRET doit faire au moins 32 caractères");

  const origineWeb = (env.ORIGINE_WEB ?? "").replace(/\/$/, "");
  if (!/^https?:\/\/[^/]+$/.test(origineWeb)) erreurs.push("ORIGINE_WEB doit être une origine (https://domaine)");
  if (production && !origineWeb.startsWith("https://")) erreurs.push("ORIGINE_WEB doit être en HTTPS en production");

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) erreurs.push("PORT invalide");

  if (erreurs.length) throw new Error(`Configuration invalide : ${erreurs.join(" ; ")}`);
  return { production, port, databaseUrl, jwtSecret, origineWeb };
}

export const CONFIG = Symbol("CONFIG");
