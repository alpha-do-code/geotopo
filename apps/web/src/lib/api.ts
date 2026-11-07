import type { Role, TableSync } from "@geotopo/metier";
import type { Transport } from "./sync";

// Même origine en production (le reverse proxy sert /api) ; en développement, l'API tourne à part
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "/api").replace(/\/$/, "");

export type Utilisateur = { id: string; email: string | null; telephone: string | null; nomAffiche: string; doitChangerMotDePasse: boolean };
export type Organisation = { id: string; nom: string; role: Role; code_invitation: string | null };
export type Membre = { user_id: string; nom_affiche: string; telephone: string | null; email: string | null; role: Role };

export class ErreurApi extends Error {
  constructor(
    readonly status: number, // 0 : pas de réseau
    message: string,
  ) {
    super(message);
  }
}

// Le jeton d'accès (15 min) ne vit qu'en mémoire ; le cookie httpOnly sert à en obtenir un nouveau
let jetonAcces: string | null = null;

// Sur un réseau mobile faible, une requête peut rester pendante sans jamais échouer : passé ce délai,
// on la traite comme « pas de réseau », et l'application continue avec ce qu'elle a sur l'appareil.
const DELAI_MS = 20_000;

async function brut<T>(chemin: string, init: RequestInit = {}, delai = DELAI_MS): Promise<T> {
  let res: Response;
  const abandon = new AbortController();
  const minuteur = setTimeout(() => abandon.abort(), delai);
  try {
    res = await fetch(BASE + chemin, {
      ...init,
      signal: abandon.signal,
      credentials: "include",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(jetonAcces ? { authorization: `Bearer ${jetonAcces}` } : {}),
      },
    });
  } catch {
    throw new ErreurApi(0, "Pas de connexion. Réessaie une fois en ligne.");
  } finally {
    clearTimeout(minuteur);
  }
  if (res.status === 204) return undefined as T;
  const corps = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = corps?.message;
    const texte = Array.isArray(m) ? m[0] : typeof m === "string" ? m : null;
    throw new ErreurApi(res.status, res.status === 429 ? "Trop de tentatives. Réessaie dans une minute." : (texte ?? "L'opération a échoué. Réessaie."));
  }
  return corps as T;
}

// Un seul renouvellement à la fois : le jeton de renouvellement est à usage unique,
// deux appels simultanés feraient croire au serveur à un vol et fermeraient la session.
let renouvellement: Promise<Utilisateur | null> | null = null;

// Renvoie l'utilisateur si la session est valide, null si elle a expiré. Lève ErreurApi(0) hors ligne.
// delai : plus court au démarrage, pour ne pas laisser l'écran de chargement attendre le réseau
export function renouveler(delai = DELAI_MS): Promise<Utilisateur | null> {
  renouvellement ??= (async () => {
    try {
      const r = await brut<{ jetonAcces: string; utilisateur: Utilisateur }>("/auth/renouveler", { method: "POST" }, delai);
      jetonAcces = r.jetonAcces;
      return r.utilisateur;
    } catch (e) {
      if (e instanceof ErreurApi && e.status === 401) {
        jetonAcces = null;
        return null;
      }
      throw e;
    } finally {
      renouvellement = null;
    }
  })();
  return renouvellement;
}

// Appel authentifié : si le jeton d'accès a expiré, on le renouvelle une fois puis on réessaie
async function appel<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  try {
    if (!jetonAcces) await renouveler();
    return await brut<T>(chemin, init);
  } catch (e) {
    if (!(e instanceof ErreurApi) || e.status !== 401) throw e;
    if (!(await renouveler())) throw new ErreurApi(401, "Session expirée. Reconnecte-toi.");
    return brut<T>(chemin, init);
  }
}

const json = (corps: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(corps) });

export const api = {
  async connexion(identifiant: string, motDePasse: string) {
    const r = await brut<{ jetonAcces: string; utilisateur: Utilisateur }>("/auth/connexion", json({ identifiant, motDePasse }));
    jetonAcces = r.jetonAcces;
    return r.utilisateur;
  },
  // Le compte s'ouvre tout de suite : la réponse est une session, comme la connexion
  async inscription(telephone: string, motDePasse: string, nomAffiche: string, email: string) {
    const r = await brut<{ jetonAcces: string; utilisateur: Utilisateur }>("/auth/inscription", json({ telephone, motDePasse, nomAffiche, email }));
    jetonAcces = r.jetonAcces;
    return r.utilisateur;
  },
  changerMotDePasse: (actuel: string, nouveau: string) => appel<void>("/auth/mot-de-passe", json({ actuel, nouveau })),
  async deconnexion() {
    try {
      await brut("/auth/deconnexion", { method: "POST" });
    } finally {
      jetonAcces = null;
    }
  },
  confirmer: (jeton: string) => brut<{ message: string }>("/auth/confirmer", json({ jeton })),
  oubli: (identifiant: string) => brut<{ message: string }>("/auth/oubli", json({ identifiant })),
  reinitialiser: (jeton: string, motDePasse: string) => brut<{ message: string }>("/auth/reinitialiser", json({ jeton, motDePasse })),

  organisations: () => appel<Organisation[]>("/organisations"),
  creerOrganisation: (nom: string, nomAffiche: string) => appel<Organisation>("/organisations", json({ nom, nomAffiche })),
  rejoindre: (code: string, nomAffiche: string) => appel<Organisation>("/organisations/rejoindre", json({ code, nomAffiche })),
  membres: (org: string) => appel<Membre[]>(`/organisations/${org}/membres`),
  motDePasseProvisoire: (org: string, user: string) => appel<{ motDePasse: string }>(`/organisations/${org}/membres/${user}/mot-de-passe-provisoire`, { method: "POST" }),
  inviter: (org: string, emails: string[]) => appel<{ envoyes: number; echecs: string[] }>(`/organisations/${org}/invitations`, json({ emails })),
  changerRole: (org: string, user: string, role: Role) => appel<void>(`/organisations/${org}/membres/${user}`, { method: "PATCH", body: JSON.stringify({ role }) }),
};

export const transport: Transport = {
  envoyer: (org: string, table: TableSync, lignes: Record<string, unknown>[]) => appel("/sync/envoyer", json({ org, table, lignes })),
  recevoir: (org: string, table: TableSync, curseur?: string) =>
    appel(`/sync/recevoir?${new URLSearchParams({ org, table, ...(curseur ? { curseur } : {}) })}`),
};
