import { LOT_RECEPTION, type ResultatEnvoi, type ResultatReception, type TableSync } from "@geotopo/metier";
import { Injectable } from "@nestjs/common";
import { AccesService } from "../organisations/acces.service.js";
import { PrismaService } from "../prisma.service.js";
import { COLONNES_VALIDATION, TABLES } from "./tables.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO = "00000000-0000-0000-0000-000000000000";

// Les noms de tables et de colonnes viennent uniquement de TABLES (liste fixe) : jamais de l'appareil
const q = (nom: string) => `"${nom}"`;

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acces: AccesService,
  ) {}

  async envoyer(userId: string, org: string, table: TableSync, lignes: Record<string, unknown>[]): Promise<ResultatEnvoi> {
    const role = await this.acces.exiger(userId, org);
    const peutValider = role === "chef" || role === "controleur";
    const def = TABLES[table];
    const rejetees: ResultatEnvoi["rejetees"] = [];

    // 1. Forme de chaque ligne
    let valides = lignes.filter((l) => {
      const motif =
        typeof l.id !== "string" || !UUID.test(l.id) ? "identifiant invalide"
        : l.org_id !== org ? "organisation différente du lot"
        : typeof l.updated_at !== "string" || Number.isNaN(Date.parse(l.updated_at)) ? "date de modification invalide"
        : null;
      if (motif) rejetees.push({ id: String(l.id), motif });
      return !motif;
    });

    // 2. Chaque référence vise une ligne de la même organisation
    for (const p of def.parents) {
      const ids = [...new Set(valides.map((l) => l[p.colonne]).filter((v): v is string => typeof v === "string" && UUID.test(v)))];
      const trouves = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
        `select id::text from ${q(p.table)} where id = any($1::uuid[]) and org_id = $2::uuid`, ids, org,
      );
      const ok = new Set(trouves.map((r) => r.id));
      valides = valides.filter((l) => {
        const v = l[p.colonne];
        if (typeof v === "string" && ok.has(v.toLowerCase())) return true;
        rejetees.push({ id: String(l.id), motif: `${p.colonne} hors de l'organisation` });
        return false;
      });
    }
    // Un acteur lié à un compte doit être membre de l'organisation
    if (table === "acteurs") {
      const membres = new Set((await this.prisma.membres.findMany({ where: { org_id: org }, select: { user_id: true } })).map((m) => m.user_id));
      valides = valides.filter((l) => {
        if (l.user_id == null || membres.has(String(l.user_id))) return true;
        rejetees.push({ id: String(l.id), motif: "user_id n'est pas membre de l'organisation" });
        return false;
      });
    }

    // 3. Écriture : en lot, puis ligne par ligne si une contrainte refuse le lot (une ligne fautive ne bloque pas les autres)
    const acceptees: string[] = [];
    if (valides.length) {
      try {
        await this.ecrire(table, valides, userId, peutValider);
        acceptees.push(...valides.map((l) => String(l.id)));
      } catch {
        for (const l of valides) {
          try {
            await this.ecrire(table, [l], userId, peutValider);
            acceptees.push(String(l.id));
          } catch (e) {
            rejetees.push({ id: String(l.id), motif: contrainte(e) });
          }
        }
      }
    }
    return { acceptees, rejetees };
  }

  // Insertion ou mise à jour. La mise à jour n'a lieu que si la ligne est de la même organisation
  // et plus récente (updated_at de l'appareil) : la modification la plus récente gagne.
  private async ecrire(table: TableSync, lignes: Record<string, unknown>[], userId: string, peutValider: boolean) {
    const cols = TABLES[table].colonnes;
    const validation = table === "chantiers" ? COLONNES_VALIDATION : [];
    // Sans droit de validation : null à la création, valeur du serveur conservée à la mise à jour
    const aInserer = cols.map((c) => (validation.includes(c) && !peutValider ? `null` : `r.${q(c)}`));
    const aMettreAJour = cols
      .filter((c) => c !== "id" && c !== "org_id")
      .map((c) => `${q(c)} = ${validation.includes(c) && !peutValider ? `t.${q(c)}` : `excluded.${q(c)}`}`);
    await this.prisma.$executeRawUnsafe(
      `insert into ${q(table)} as t (${cols.map(q).join(", ")}, cree_par)
       select ${aInserer.join(", ")}, $2::uuid from jsonb_populate_recordset(null::${q(table)}, $1::jsonb) r
       on conflict (id) do update set ${aMettreAJour.join(", ")}
       where t.org_id = excluded.org_id and excluded.updated_at > t.updated_at`,
      JSON.stringify(lignes),
      userId,
    );
  }

  async recevoir(userId: string, org: string, table: TableSync, curseur?: string): Promise<ResultatReception> {
    await this.acces.exiger(userId, org);
    const [ts, id] = curseur ? curseur.split("|") : ["1970-01-01T00:00:00Z", ZERO];
    const lignes = await this.prisma.$queryRawUnsafe<{ ligne: Record<string, unknown>; curseur: string }[]>(
      `select to_jsonb(t) - 'cree_par' as ligne, t.server_updated_at::text || '|' || t.id::text as curseur
       from ${q(table)} t
       where t.org_id = $1::uuid and (t.server_updated_at, t.id) > ($2::timestamptz, $3::uuid)
       order by t.server_updated_at, t.id
       limit ${LOT_RECEPTION}`,
      org, ts, id,
    );
    return { lignes: lignes.map((l) => l.ligne), curseur: lignes.at(-1)?.curseur ?? null };
  }
}

// Message lisible pour une ligne refusée par la base (contrainte CHECK, type…)
function contrainte(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.match(/constraint "([^"]+)"/)?.[1] ?? m.match(/invalid input syntax[^\n]*/)?.[0] ?? "ligne refusée par la base";
}
