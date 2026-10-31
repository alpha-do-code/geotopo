import { LOT_ENVOI, TABLES_SYNC, type ResultatEnvoi, type ResultatReception, type TableSync } from "@geotopo/metier";
import { db as baseParDefaut, ecrireMeta, lireMeta, type BaseLocale } from "./db";

type Ligne = { id: string; org_id: string; updated_at: string; sale: 0 | 1; server_updated_at?: string };

// Ce dont la synchro a besoin du serveur ; l'API en ligne ou un faux serveur dans les tests
export interface Transport {
  envoyer(org: string, table: TableSync, lignes: Record<string, unknown>[]): Promise<ResultatEnvoi>;
  recevoir(org: string, table: TableSync, curseur?: string): Promise<ResultatReception>;
}

// Une transaction lente côté serveur peut valider après une plus rapide : chaque tour relit
// les dernières secondes avant le curseur. Réappliquer une ligne déjà reçue est sans effet.
const RECOUVREMENT_MS = 5_000;
const ZERO = "00000000-0000-0000-0000-000000000000";

// Colonnes propres à l'appareil : on ne les envoie pas
const pourServeur = ({ sale, server_updated_at, ...reste }: Ligne) => {
  void sale;
  void server_updated_at;
  return reste;
};

export type BilanSync = { envoyes: number; recus: number; rejetees: { table: TableSync; id: string; motif: string }[] };

// Envoie les modifications locales. Une ligne n'est marquée propre que si elle n'a pas
// été retouchée pendant l'envoi (même updated_at qu'au moment de la lecture).
// Une ligne refusée reste « à envoyer » et son motif remonte dans le bilan.
async function envoyer(t: Transport, base: BaseLocale, orgId: string, bilan: BilanSync) {
  for (const nom of TABLES_SYNC) {
    const table = base.table<Ligne, string>(nom);
    const sales = (await table.where("sale").equals(1).toArray()).filter((l) => l.org_id === orgId);
    for (let i = 0; i < sales.length; i += LOT_ENVOI) {
      const lot = sales.slice(i, i + LOT_ENVOI);
      const { acceptees, rejetees } = await t.envoyer(orgId, nom, lot.map(pourServeur));
      const ok = new Set(acceptees);
      await base.transaction("rw", table, async () => {
        for (const l of lot) {
          if (!ok.has(l.id)) continue;
          const actuelle = await table.get(l.id);
          if (actuelle && actuelle.updated_at === l.updated_at) await table.update(l.id, { sale: 0 });
        }
      });
      bilan.envoyes += acceptees.length;
      bilan.rejetees.push(...rejetees.map((r) => ({ table: nom, ...r })));
    }
  }
}

// Reçoit les lignes modifiées sur le serveur depuis le dernier curseur.
// Une ligne locale non envoyée et plus récente que celle du serveur est gardée.
async function recevoir(t: Transport, base: BaseLocale, orgId: string, bilan: BilanSync) {
  for (const nom of TABLES_SYNC) {
    const table = base.table<Ligne, string>(nom);
    const cle = `curseur:${orgId}:${nom}`;
    const garde = await lireMeta(cle, base);
    let curseur: string | undefined;
    if (garde) {
      const ts = garde.split("|")[0];
      curseur = `${new Date(Date.parse(ts.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")) - RECOUVREMENT_MS).toISOString()}|${ZERO}`;
    }
    for (;;) {
      const r = await t.recevoir(orgId, nom, curseur);
      if (!r.lignes.length || !r.curseur) break;
      const lignes = r.lignes as unknown as Ligne[];
      await base.transaction("rw", table, async () => {
        for (const distante of lignes) {
          const locale = await table.get(distante.id);
          // Comparer des dates, pas des chaînes : le serveur renvoie « +00:00 », l'appareil écrit « Z »
          if (locale?.sale === 1 && Date.parse(locale.updated_at) > Date.parse(distante.updated_at)) continue;
          await table.put({ ...distante, sale: 0 });
        }
      });
      curseur = r.curseur;
      await ecrireMeta(cle, curseur, base);
      bilan.recus += lignes.length;
    }
  }
}

export async function synchroniser(t: Transport, orgId: string, base: BaseLocale = baseParDefaut): Promise<BilanSync> {
  const bilan: BilanSync = { envoyes: 0, recus: 0, rejetees: [] };
  await envoyer(t, base, orgId, bilan);
  await recevoir(t, base, orgId, bilan);
  await ecrireMeta(`derniere_sync:${orgId}`, new Date().toISOString(), base);
  return bilan;
}

export async function nombreEnAttente(base: BaseLocale = baseParDefaut): Promise<number> {
  const n = await Promise.all(TABLES_SYNC.map((nom) => base.table(nom).where("sale").equals(1).count()));
  return n.reduce((a, b) => a + b, 0);
}
