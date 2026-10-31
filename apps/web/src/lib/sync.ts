import type { SupabaseClient } from "@supabase/supabase-js";
import { db as baseParDefaut, ecrireMeta, lireMeta, type BaseLocale, type Chantier, type Point } from "./db";

const LOT = 200;
const TABLES = ["chantiers", "points"] as const; // les chantiers d'abord : les points y font référence
type NomTable = (typeof TABLES)[number];
type Ligne = Chantier | Point;

// Colonnes posées par la base : on ne les envoie pas
const SANS_COLONNES_LOCALES = ({ sale, server_updated_at, ...reste }: Ligne) => {
  void sale;
  void server_updated_at;
  return reste;
};

export type BilanSync = { envoyes: number; recus: number };

// Envoie les modifications locales. Une ligne n'est marquée propre que si elle n'a pas
// été retouchée pendant l'envoi (même updated_at qu'au moment de la lecture).
async function envoyer(sb: SupabaseClient, base: BaseLocale, orgId: string): Promise<number> {
  let total = 0;
  for (const nom of TABLES) {
    const table = base.table<Ligne, string>(nom);
    const sales = (await table.where("sale").equals(1).toArray()).filter((l) => l.org_id === orgId);
    for (let i = 0; i < sales.length; i += LOT) {
      const lot = sales.slice(i, i + LOT);
      const { error } = await sb.from(nom).upsert(lot.map(SANS_COLONNES_LOCALES), { onConflict: "id" });
      if (error) throw new Error(`Envoi ${nom} : ${error.message}`);
      await base.transaction("rw", table, async () => {
        for (const l of lot) {
          const actuelle = await table.get(l.id);
          if (actuelle && actuelle.updated_at === l.updated_at) await table.update(l.id, { sale: 0 });
        }
      });
      total += lot.length;
    }
  }
  return total;
}

// Reçoit les lignes modifiées sur le serveur depuis le dernier curseur.
// Une ligne locale non envoyée et plus récente que celle du serveur est gardée.
async function recevoir(sb: SupabaseClient, base: BaseLocale, orgId: string): Promise<number> {
  let total = 0;
  for (const nom of TABLES) {
    const table = base.table<Ligne, string>(nom);
    const cleCurseur = `curseur:${orgId}:${nom}`;
    let curseur = (await lireMeta(cleCurseur, base)) ?? "1970-01-01T00:00:00Z";
    for (;;) {
      const { data, error } = await sb
        .from(nom)
        .select("*")
        .eq("org_id", orgId)
        .gt("server_updated_at", curseur)
        .order("server_updated_at", { ascending: true })
        .limit(1000);
      if (error) throw new Error(`Réception ${nom} : ${error.message}`);
      const lignes = (data ?? []) as Ligne[];
      if (!lignes.length) break;
      await base.transaction("rw", table, async () => {
        for (const distante of lignes) {
          const locale = await table.get(distante.id);
          // Comparer des dates, pas des chaînes : la base renvoie « +00:00 », l'appareil écrit « Z »
          if (locale?.sale === 1 && Date.parse(locale.updated_at) > Date.parse(distante.updated_at)) continue;
          await table.put({ ...distante, sale: 0 } as Ligne);
        }
      });
      curseur = lignes[lignes.length - 1].server_updated_at!;
      await ecrireMeta(cleCurseur, curseur, base);
      total += lignes.length;
      if (lignes.length < 1000) break;
    }
  }
  return total;
}

export async function synchroniser(sb: SupabaseClient, orgId: string, base: BaseLocale = baseParDefaut): Promise<BilanSync> {
  const envoyes = await envoyer(sb, base, orgId);
  const recus = await recevoir(sb, base, orgId);
  await ecrireMeta(`derniere_sync:${orgId}`, new Date().toISOString(), base);
  return { envoyes, recus };
}

export async function nombreEnAttente(base: BaseLocale = baseParDefaut): Promise<number> {
  const [c, p] = await Promise.all([base.chantiers.where("sale").equals(1).count(), base.points.where("sale").equals(1).count()]);
  return c + p;
}

export type { NomTable };
