"use client";

import { atteinte, calculerAuto, formatCm, INDICATEURS_AUTO, jourIso, lireNombre, niveauAtteinte, type CleAuto, type NiveauAtteinte } from "@geotopo/metier";
import { useLayoutEffect, useRef, useState } from "react";

import { enregistrer, type Chantier, type Point } from "@/lib/db";
import { resultatChantier } from "@/lib/statut";
import { nouvelleLigne, useGestion, type Indicateur, type Objectif } from "./donnees";
import { Liste } from "@/components/liste";

const NIVEAUX: Record<NiveauAtteinte, { label: string; classe: string; barre: string }> = {
  atteint: { label: "Atteint", classe: "bg-ok-fond text-ok", barre: "bg-ok" },
  en_cours: { label: "En bonne voie", classe: "bg-info-fond text-info", barre: "bg-info" },
  a_risque: { label: "À risque", classe: "bg-erreur-fond text-erreur", barre: "bg-erreur" },
};

const nombre = (v: number | null, unite = "") => (v == null ? "—" : `${formatCm(v, Math.abs(v) >= 10 || Number.isInteger(v) ? 0 : 1)}${unite ? ` ${unite}` : ""}`);

// Cadre de départ : un objectif qualité et un objectif délais, mesurés automatiquement
const CADRE_TYPE: { libelle: string; indicateurs: CleAuto[] }[] = [
  { libelle: "Livrer un travail conforme au cahier des charges", indicateurs: ["taux_conformite", "emq_classe"] },
  { libelle: "Tenir les délais convenus", indicateurs: ["avancement", "echeances_tenues", "retard_jours"] },
];

export function Indicateurs({ chantier: c, points }: { chantier: Chantier; points: Point[] }) {
  const { taches, objectifs, indicateurs } = useGestion(c);
  if (!taches || !objectifs || !indicateurs) return <p className="text-encre-2">Chargement…</p>;

  const r = resultatChantier(c, points);
  const donnees = { ecarts: r.ecarts, emq: r.emq, borne: r.borne, taches, aujourdhui: jourIso() };
  const realise = (i: Indicateur) => (i.mode === "auto" ? calculerAuto(i.cle_auto, donnees) : i.realise);

  async function cadreType() {
    for (const [n, o] of CADRE_TYPE.entries()) {
      const obj: Objectif = { ...nouvelleLigne(c.org_id), chantier_id: c.id, libelle: o.libelle, ordre: objectifs!.length + n };
      await enregistrer("objectifs", obj);
      for (const [k, cle] of o.indicateurs.entries()) await ajouterAuto(obj, cle, k);
    }
  }
  async function ajouterAuto(o: Objectif, cle: CleAuto, ordre: number) {
    const d = INDICATEURS_AUTO[cle];
    await enregistrer("indicateurs", {
      ...nouvelleLigne(c.org_id), objectif_id: o.id, libelle: d.libelle, unite: d.unite, reference: null, cible: d.cible, sens: d.sens,
      mode: "auto", cle_auto: cle, realise: null, source_verification: d.source, ordre,
    });
  }

  const tous = indicateurs.map((i) => atteinte(i, realise(i))).filter((v): v is number => v != null);
  const global = tous.length ? tous.reduce((a, b) => a + b, 0) / tous.length : null;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-encre-2">
        Gestion axée sur les résultats : chaque objectif se mesure par des indicateurs avec une valeur de référence, une cible et une valeur réalisée.
        Les indicateurs marqués « auto » se calculent à partir du contrôle et du planning.
      </p>

      {objectifs.length === 0 ? (
        <section className="carte flex flex-col gap-4 p-5 md:p-6">
          <h2 className="text-lg font-semibold">Aucun objectif pour ce chantier</h2>
          <p className="text-sm text-encre-2">
            Le cadre type propose deux objectifs : la conformité au cahier des charges (points dans la tolérance, EMQ face à la classe) et le respect des délais (avancement, échéances, retard).
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="bouton-principal" onClick={cadreType}>Proposer le cadre type</button>
            <NouvelObjectif chantier={c} ordre={0} />
          </div>
        </section>
      ) : (
        <>
          {global != null && (
            <div className="carte flex flex-wrap items-center gap-4 p-4">
              <div>
                <div className="text-[13px] text-encre-2">Atteinte moyenne des indicateurs</div>
                <div className="text-2xl font-bold">{Math.round(global)} %</div>
              </div>
              <Jauge pct={global} />
            </div>
          )}
          {objectifs.map((o) => (
            <BlocObjectif
              key={o.id}
              objectif={o}
              indicateurs={indicateurs.filter((i) => i.objectif_id === o.id)}
              realise={realise}
              ajouterAuto={(cle) => ajouterAuto(o, cle, indicateurs.filter((i) => i.objectif_id === o.id).length)}
            />
          ))}
          <div><NouvelObjectif chantier={c} ordre={objectifs.length} /></div>
        </>
      )}
    </div>
  );
}

function NouvelObjectif({ chantier: c, ordre }: { chantier: Chantier; ordre: number }) {
  const [libelle, setLibelle] = useState("");
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) return <button type="button" className="bouton-secondaire" onClick={() => setOuvert(true)}>Ajouter un objectif</button>;
  return (
    <form
      className="flex w-full flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await enregistrer("objectifs", { ...nouvelleLigne(c.org_id), chantier_id: c.id, libelle: libelle.trim(), ordre });
        setLibelle("");
        setOuvert(false);
      }}
    >
      <label className="etiquette min-w-64 flex-1">Objectif
        <input className="champ font-normal" required maxLength={300} autoFocus value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Ex. Remettre le plan au maître d'ouvrage avant la fin du mois" />
      </label>
      <button type="submit" className="bouton-principal">Ajouter</button>
      <button type="button" className="bouton-secondaire" onClick={() => setOuvert(false)}>Annuler</button>
    </form>
  );
}

function BlocObjectif({
  objectif: o, indicateurs, realise, ajouterAuto,
}: {
  objectif: Objectif;
  indicateurs: Indicateur[];
  realise: (i: Indicateur) => number | null;
  ajouterAuto: (cle: CleAuto) => Promise<void>;
}) {
  const disponibles = (Object.keys(INDICATEURS_AUTO) as CleAuto[]).filter((k) => !indicateurs.some((i) => i.cle_auto === k));
  const [choixAuto, setChoixAuto] = useState<string>("");

  async function ajouterManuel() {
    await enregistrer("indicateurs", {
      ...nouvelleLigne(o.org_id), objectif_id: o.id, libelle: "Nouvel indicateur", unite: "", reference: null, cible: 100, sens: "hausse",
      mode: "manuel", cle_auto: "", realise: null, source_verification: "", ordre: indicateurs.length,
    });
  }

  return (
    <section className="carte flex flex-col gap-4 p-5 md:p-6">
      <div className="flex items-start gap-2">
        <TexteAjuste
          ariaLabel="Objectif"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1.5 text-lg leading-snug font-semibold hover:border-bord focus:border-bord-fort"
          valeur={o.libelle}
          max={300}
          onChange={(v) => enregistrer("objectifs", { ...o, libelle: v || " " })}
        />
        <button type="button" className="bouton text-sm text-erreur" onClick={() => confirm(`Supprimer l'objectif « ${o.libelle} » ?`) && enregistrer("objectifs", { ...o, supprime: true })}>
          Supprimer
        </button>
      </div>

      {indicateurs.length === 0 && <p className="text-sm text-encre-2">Aucun indicateur pour cet objectif.</p>}
      <ul className="flex flex-col divide-y divide-bord">
        {indicateurs.map((i) => <LigneIndicateur key={i.id} indicateur={i} realise={realise(i)} />)}
      </ul>

      <div className="flex flex-wrap items-end gap-3 border-t border-bord pt-4">
        <button type="button" className="bouton-secondaire" onClick={ajouterManuel}>Indicateur saisi à la main</button>
        {disponibles.length > 0 && (
          <>
            <Liste
              label="Indicateur automatique"
              className="w-full sm:w-80"
              valeur={choixAuto}
              options={disponibles.map((k) => ({ valeur: k as string, label: INDICATEURS_AUTO[k].libelle, detail: INDICATEURS_AUTO[k].source }))}
              onChange={setChoixAuto}
            />
            <button type="button" className="bouton-secondaire" disabled={!choixAuto} onClick={async () => { await ajouterAuto(choixAuto as CleAuto); setChoixAuto(""); }}>
              Ajouter
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function LigneIndicateur({ indicateur: i, realise }: { indicateur: Indicateur; realise: number | null }) {
  const maj = (champs: Partial<Indicateur>) => enregistrer("indicateurs", { ...i, ...champs });
  const pct = atteinte(i, realise);
  const niveau = pct == null ? null : NIVEAUX[niveauAtteinte(pct)];
  const auto = i.mode === "auto";

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {auto ? (
          <span className="font-medium">{i.libelle}</span>
        ) : (
          <input aria-label="Indicateur" className="champ min-w-0 flex-1 font-medium" value={i.libelle} maxLength={300} onChange={(e) => maj({ libelle: e.target.value || " " })} />
        )}
        {auto && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-encre-2">auto</span>}
        {niveau ? <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${niveau.classe}`}>{niveau.label}</span> : <span className="text-[12px] text-encre-2">Pas encore mesuré</span>}
        <button type="button" aria-label={`Supprimer ${i.libelle}`} className="ml-auto text-sm text-erreur underline" onClick={() => maj({ supprime: true })}>Retirer</button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2fr)]">
        <Valeur label="Référence" valeur={i.reference} unite={i.unite} onChange={(v) => maj({ reference: v })} />
        <Valeur label="Cible" valeur={i.cible} unite={i.unite} onChange={(v) => v != null && maj({ cible: v })} obligatoire />
        {auto ? (
          <div className="etiquette">Réalisé<span className="flex min-h-11 items-center font-mono text-base font-semibold">{nombre(realise, i.unite)}</span></div>
        ) : (
          <Valeur label="Réalisé" valeur={i.realise} unite={i.unite} onChange={(v) => maj({ realise: v })} />
        )}
        {auto ? (
          <div className="etiquette">Sens<span className="flex min-h-11 items-center font-normal">{i.sens === "hausse" ? "Plus haut = mieux" : "Plus bas = mieux"}</span></div>
        ) : (
          <Liste
            label="Sens"
            valeur={i.sens}
            options={[{ valeur: "hausse" as const, label: "Plus haut = mieux" }, { valeur: "baisse" as const, label: "Plus bas = mieux" }]}
            onChange={(sens) => maj({ sens })}
          />
        )}
        <label className="etiquette col-span-2 sm:col-span-4 lg:col-span-1">Source de vérification
          <input className="champ font-normal" maxLength={500} value={i.source_verification} onChange={(e) => maj({ source_verification: e.target.value })} placeholder="PV, rapport, registre…" />
        </label>
      </div>
      {!auto && (
        <label className="etiquette w-28">Unité
          <input className="champ font-normal" maxLength={30} value={i.unite} onChange={(e) => maj({ unite: e.target.value })} placeholder="%, j, cm…" />
        </label>
      )}
      {pct != null && <Jauge pct={pct} classe={niveau!.barre} />}
    </li>
  );
}

// Zone de texte qui grandit avec son contenu : un titre long passe à la ligne au lieu d'être coupé
function TexteAjuste({ valeur, onChange, className, ariaLabel, max }: { valeur: string; onChange: (v: string) => void; className: string; ariaLabel: string; max: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight}px`;
  });
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={ariaLabel}
      className={`resize-none overflow-hidden ${className}`}
      value={valeur}
      maxLength={max}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
    />
  );
}

function Valeur({ label, valeur, unite, onChange, obligatoire }: { label: string; valeur: number | null; unite: string; onChange: (v: number | null) => void; obligatoire?: boolean }) {
  const [texte, setTexte] = useState(valeur == null ? "" : String(valeur).replace(".", ","));
  return (
    <label className="etiquette">{label}{unite ? ` (${unite})` : ""}
      <input
        inputMode="decimal"
        className="champ font-mono font-normal"
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          const v = lireNombre(e.target.value);
          if (v != null || (!obligatoire && e.target.value.trim() === "")) onChange(v);
        }}
      />
    </label>
  );
}

function Jauge({ pct, classe = "bg-accent" }: { pct: number; classe?: string }) {
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Atteinte de la cible" className="h-2.5 min-w-40 flex-1 overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${classe}`} style={{ width: `${Math.max(2, pct)}%` }} />
    </div>
  );
}

