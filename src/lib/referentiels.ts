// Les listes métier et leurs libellés. Les clés sont celles de la base (contraintes check).

export const NATURES = {
  bornage: "Bornage / délimitation",
  topo_rurale: "Topographie rurale",
  topo_urbaine: "Topographie urbaine",
  auscultation: "Auscultation",
  leves_implantations: "Levés et implantations",
} as const;

export const METHODES = {
  polygonation: "Polygonation",
  gnss_rtk: "GNSS RTK",
  gnss_statique: "GNSS statique",
  photogrammetrie_drone: "Photogrammétrie par drone",
  balayage_laser: "Balayage laser",
  rayonnement: "Rayonnement alti et plani",
} as const;

export const APPAREILS = {
  gnss: "Récepteur GNSS",
  station_totale: "Station totale",
  station_totale_robotisee: "Station totale robotisée",
  niveau: "Niveau optique / numérique",
  drone: "Drone",
  scanner_laser: "Scanner laser",
} as const;

export const TYPES_CONTROLE = {
  reobservation: "Réobservation des points",
  points_connus: "Contrôle sur points connus",
  echantillonnage: "Échantillonnage",
} as const;

export const CONTROLE_PAR = {
  operateur: "Même opérateur (autocontrôle)",
  bureau: "Bureau d'études (contrôle externe)",
} as const;

export const REFERENTIELS = {
  CI: "Côte d'Ivoire",
  MA: "Maroc",
  CDC: "Cahier des charges seul",
} as const;

export const ROLES = {
  chef: "Chef de mission",
  operateur: "Opérateur",
  controleur: "Contrôleur",
} as const;

export type Nature = keyof typeof NATURES;
export type Methode = keyof typeof METHODES;
export type Appareil = keyof typeof APPAREILS;
export type TypeControle = keyof typeof TYPES_CONTROLE;
export type ControlePar = keyof typeof CONTROLE_PAR;
export type Referentiel = keyof typeof REFERENTIELS;
export type Role = keyof typeof ROLES;
export type Systeme = "ENH" | "XYZ";

// Classes de précision. max = borne haute en cm ; la dernière n'en a pas,
// la tolérance doit alors venir du cahier des charges.
export const CLASSES = [
  { label: "< 1 cm", max: 1 },
  { label: "1 à 3 cm", max: 3 },
  { label: "3 à 5 cm", max: 5 },
  { label: "5 à 10 cm", max: 10 },
  { label: "10 à 50 cm", max: 50 },
  { label: "> 50 cm", max: null },
] as const;

export const SYSTEMES: Record<Systeme, { label: string; axes: [string, string, string]; aide: string }> = {
  ENH: { label: "E, N, H", axes: ["E", "N", "H"], aide: "Projection plane (Est, Nord) et altitude. Écart calculé sur E et N." },
  XYZ: { label: "X, Y, Z", axes: ["X", "Y", "Z"], aide: "Cartésiennes géocentriques. Écart calculé en 3D." },
};

// Méthode → appareil le plus courant, pour préremplir la fiche
export const APPAREIL_PAR_DEFAUT: Record<Methode, Appareil> = {
  polygonation: "station_totale",
  gnss_rtk: "gnss",
  gnss_statique: "gnss",
  photogrammetrie_drone: "drone",
  balayage_laser: "scanner_laser",
  rayonnement: "station_totale",
};

// Atteignabilité par classe (index de CLASSES) : 2 courant, 1 possible avec précautions, 0 hors portée.
// Valeurs d'usage indicatives, à valider par un topographe. Pas réglementaires.
export const MATRICE: Record<Methode, [number, number, number, number, number, number]> = {
  polygonation: [1, 2, 2, 2, 2, 2],
  gnss_rtk: [0, 2, 2, 2, 2, 2],
  gnss_statique: [2, 2, 2, 2, 2, 2],
  photogrammetrie_drone: [0, 1, 2, 2, 2, 2],
  balayage_laser: [1, 2, 2, 2, 2, 0],
  rayonnement: [1, 2, 2, 2, 2, 2],
};

export type Source = { titre: string; statut: "lu" | "a_completer"; lignes: [string, string][]; manque?: string };

// Ce que disent les textes lus. Chaque ligne indique son article.
export const SOURCES: Record<"CI" | "MA", Source[]> = {
  CI: [
    {
      titre: "Arrêté n° 085 MINAGRA du 15 juin 2000 (plans du domaine foncier rural)",
      statut: "lu",
      lignes: [
        ["Précision", "De l'ordre du mètre (art. 3 et 6)"],
        ["Rattachement", "Réseau Géodésique Ivoirien, au moins deux points d'appui référencés (art. 3)"],
        ["Échelle", "1/10 000, ou 1/5 000 à 1/2 000 sous un hectare (art. 3)"],
        ["Méthodes admises", "Directe (planchette sur support référencé) ou indirecte (angles et distances, positionnement direct) (art. 6 et 7)"],
        ["Pièces de contrôle", "Fiche technique de levé, minute, observations, calculs et écarts obtenus, points de rattachement (art. 10)"],
      ],
    },
    {
      titre: "Arrêté sur les classes de précision",
      statut: "a_completer",
      lignes: [],
      manque:
        "Aucun texte ivoirien fixant des classes de précision n'a été trouvé. Le texte connu sous ce nom est l'arrêté français du 16 septembre 2003. Fournir la référence exacte pour le saisir ici.",
    },
  ],
  MA: [
    {
      titre: "ANCFCC, notes et instructions relatives aux travaux cadastraux (2017)",
      statut: "lu",
      lignes: [
        ["Tolérance / erreur moyenne", "T = 2,5 × emq (polygonation de précision, art. 13)"],
        ["Erreur relative max.", "1/4 000 (côtés par parallaxe), 1/2 000 entre deux mesures au ruban (art. 13)"],
        ["Bornes rayonnées", "Contrôle obligatoire. Double rayonnement de rigueur en urbain, suburbain, ou à 1/500 et plus (art. 29)"],
        ["Longueur des rayonnements", "Au plus 3/4 de la longueur des côtés du cheminement (art. 30)"],
        ["Points de rattachement", "Tout point ancien est recherché et vérifié avant usage (art. 20)"],
        ["Autocontrôle", "Toute mesure contrôlée par une mesure indépendante de l'opérateur"],
      ],
    },
    {
      titre: "Tables de tolérances par catégorie",
      statut: "a_completer",
      lignes: [],
      manque:
        "L'instruction renvoie à des tableaux annexes (art. 28) non extraits, et ne traite ni du GNSS, ni du drone, ni du scanner laser. Il faut le cahier des prescriptions techniques ANCFCC à jour.",
    },
  ],
};
