import { APPAREIL_PAR_DEFAUT, type Appareil, type Methode, type Nature } from "@geotopo/metier";
import { db, enregistrerChantier, enregistrerPoint, nouveauChantier, type Chantier, type Point } from "./db";

// Ce que l'assistant de création propose selon les travaux : la méthode la plus courante et la classe
// de précision habituelle (index de CLASSES). Valeurs d'usage indicatives, comme la matrice méthode /
// classe : tout reste modifiable, et le cahier des charges prime.
export const PROPOSITIONS: Record<Nature, { methode: Methode; appareil: Appareil; classe: number }> = {
  bornage: { methode: "gnss_rtk", appareil: "gnss", classe: 2 },
  topo_rurale: { methode: "gnss_rtk", appareil: "gnss", classe: 3 },
  topo_urbaine: { methode: "rayonnement", appareil: "station_totale", classe: 2 },
  auscultation: { methode: "rayonnement", appareil: "station_totale_robotisee", classe: 0 },
  leves_implantations: { methode: "gnss_rtk", appareil: "gnss", classe: 2 },
};

export function proposition(nature: Nature) {
  return PROPOSITIONS[nature];
}

export const appareilPour = (m: Methode): Appareil => APPAREIL_PAR_DEFAUT[m];

// Chantier d'exemple, pour découvrir l'application sans rien saisir : un bornage avec 6 points levés
// et leurs contrôles, de petits écarts (EMQ d'environ 1,5 cm, conforme à la classe 3 à 5 cm).
// C'est un vrai chantier de l'équipe, nommé « Exemple », que l'on peut supprimer depuis sa fiche.
export async function creerChantierExemple(orgId: string): Promise<string> {
  const c: Chantier = {
    ...nouveauChantier(orgId),
    nom: "Exemple · Lotissement Keur Massar",
    lieu: "Keur Massar, Dakar",
    client: "Chantier fictif, à supprimer",
    nature: "bornage",
    methode: "gnss_rtk",
    appareil: "gnss",
    appareil_modele: "Récepteur GNSS bifréquence",
    classe: 2,
  };
  await enregistrerChantier(c);
  // E, N en mètres (UTM 28 N), H en mètres ; contrôles décalés de quelques millimètres à 2 cm
  const leves: [string, number, number, number][] = [
    ["B1", 245310.412, 1636520.118, 18.204],
    ["B2", 245348.905, 1636522.741, 18.512],
    ["B3", 245351.226, 1636561.033, 19.087],
    ["B4", 245312.687, 1636558.402, 18.861],
    ["B5", 245331.044, 1636540.575, 18.640],
    ["B6", 245290.118, 1636539.902, 17.995],
  ];
  const ecarts: [number, number][] = [[0.008, -0.012], [-0.015, 0.006], [0.011, 0.014], [-0.004, -0.019], [0.017, 0.002], [-0.009, 0.010]];
  const jour = new Date().toISOString();
  const point = (code: string, phase: Point["phase"], a: number, b: number, h: number): Point => ({
    id: crypto.randomUUID(),
    org_id: orgId,
    chantier_id: c.id,
    code,
    phase,
    systeme: "ENH",
    a,
    b,
    c: h,
    observation: phase === "controle" ? "Contrôle de l'exemple" : "",
    mesure_le: jour,
    supprime: false,
    updated_at: jour,
    sale: 1,
  });
  await db.transaction("rw", db.points, async () => {
    for (const [i, [code, e, n, h]] of leves.entries()) {
      await enregistrerPoint(point(code, "leve", e, n, h));
      await enregistrerPoint(point(code, "controle", +(e + ecarts[i][0]).toFixed(3), +(n + ecarts[i][1]).toFixed(3), h));
    }
  });
  return c.id;
}
