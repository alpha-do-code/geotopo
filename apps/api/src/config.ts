// Configuration lue une fois au démarrage. En production, une valeur manquante ou dangereuse
// arrête le serveur plutôt que de le laisser tourner mal protégé.

export type Config = {
  production: boolean;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  origineWeb: string;
  // Secret partagé avec le Worker Cloudflare qui relaie /api : sans lui, la production refuse la requête
  relaisSecret: string | null;
  // Envoi des e-mails par SMTP (Gmail, Brevo, Resend…) : smtps://utilisateur:motdepasse@hote:465
  smtp: { url: string; expediteur: string } | null;
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

  const relaisSecret = env.RELAIS_SECRET || null;
  if (production && (relaisSecret ?? "").length < 32) erreurs.push("RELAIS_SECRET doit faire au moins 32 caractères en production");

  const smtpUrl = env.SMTP_URL ?? "";
  const expediteur = env.EMAIL_EXPEDITEUR ?? "";
  let smtp: Config["smtp"] = null;
  if (smtpUrl || expediteur) {
    if (!/^smtps?:\/\/.+@.+/.test(smtpUrl)) erreurs.push("SMTP_URL doit être de la forme smtps://utilisateur:motdepasse@hote:465");
    if (!expediteur.includes("@")) erreurs.push("EMAIL_EXPEDITEUR doit contenir une adresse e-mail");
    smtp = { url: smtpUrl, expediteur };
  } else if (production) {
    erreurs.push("SMTP_URL et EMAIL_EXPEDITEUR sont obligatoires en production (confirmation des comptes)");
  }

  if (erreurs.length) throw new Error(`Configuration invalide : ${erreurs.join(" ; ")}`);
  return { production, port, databaseUrl, jwtSecret, origineWeb, relaisSecret, smtp };
}

export const CONFIG = Symbol("CONFIG");
