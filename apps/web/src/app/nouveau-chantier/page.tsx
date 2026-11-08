"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CLASSES, MATRICE, METHODES, NATURES, REFERENTIELS, type Methode, type Nature, type Referentiel } from "@geotopo/metier";
import { Choix } from "@/components/choix";
import { Liste, optionsDe } from "@/components/liste";
import { useSession } from "@/components/session";
import { enregistrerChantier, nouveauChantier } from "@/lib/db";
import { appareilPour, proposition } from "@/lib/nouveau";

// Assistant de création en 3 questions (maquette, piste A) : qui remplace la fiche vide.
// Le chantier s'ouvre ensuite sur sa fiche complète, où tout reste modifiable.

const ICONES_NATURE: Record<Nature, string> = {
  bornage: "M4 20 12 4l8 16zM12 4v16",
  topo_rurale: "M3 17c3-4 6-4 9 0s6 4 9 0M3 11c3-4 6-4 9 0s6 4 9 0",
  topo_urbaine: "M4 21V9h6v12M14 21V4h6v17",
  auscultation: "M6 21V8l6-5 6 5v13M3 21h18",
  leves_implantations: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
};

const TITRES = ["Comment s'appelle ce chantier ?", "Quels travaux ?", "Quelle précision est exigée ?"];

export default function NouveauChantier() {
  const { orgId, pret } = useSession();
  const router = useRouter();
  const [etape, setEtape] = useState(0);
  const [nom, setNom] = useState("");
  const [lieu, setLieu] = useState("");
  const [client, setClient] = useState("");
  const [nature, setNature] = useState<Nature | null>(null);
  const [methode, setMethode] = useState<Methode>("gnss_rtk");
  const [classe, setClasse] = useState(2);
  const [referentiel, setReferentiel] = useState<Referentiel>("CDC");
  const [tolerance, setTolerance] = useState("");
  const [envoi, setEnvoi] = useState(false);

  function choisirNature(n: Nature) {
    const p = proposition(n);
    setNature(n);
    setMethode(p.methode);
    setClasse(p.classe);
  }

  function retour() {
    if (etape === 0) router.push("/");
    else setEtape(etape - 1);
  }

  const peutContinuer = etape === 0 ? nom.trim().length > 0 : etape === 1 ? nature !== null : true;
  const toleranceCm = tolerance.trim() ? Number(tolerance.replace(",", ".")) : null;
  const toleranceInvalide = toleranceCm !== null && !(toleranceCm > 0);

  async function creer() {
    if (!nature || toleranceInvalide) return;
    setEnvoi(true);
    const c = {
      ...nouveauChantier(orgId),
      nom: nom.trim().slice(0, 200),
      lieu: lieu.trim().slice(0, 200),
      client: client.trim().slice(0, 200),
      nature,
      methode,
      appareil: methode === proposition(nature).methode ? proposition(nature).appareil : appareilPour(methode),
      classe,
      referentiel,
      tolerance_cm: toleranceCm,
    };
    await enregistrerChantier(c);
    router.replace(`/chantier/?id=${c.id}`);
  }

  function suivant(e: React.FormEvent) {
    e.preventDefault();
    if (!peutContinuer) return;
    if (etape < 2) setEtape(etape + 1);
    else creer();
  }

  const p = nature ? proposition(nature) : null;
  const atteignable = MATRICE[methode][classe];

  return (
    <form onSubmit={suivant} className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-4 pt-4 pb-6">
      <header className="flex items-center gap-3">
        <button type="button" onClick={retour} aria-label={etape === 0 ? "Annuler" : "Étape précédente"} className="-ml-2 flex size-11 items-center justify-center rounded-full text-2xl hover:bg-surface-2">
          ‹
        </button>
        <span className="text-lg font-semibold">Nouveau chantier</span>
        <span className="ml-auto text-sm text-encre-2 tabular-nums">{etape + 1} / 3</span>
      </header>
      <div className="flex justify-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 w-7 rounded-full ${i <= etape ? "bg-accent" : "bg-bord-fort"}`} />
        ))}
      </div>

      <div>
        <h1 className="text-2xl font-bold">{TITRES[etape]}</h1>
        <p className="mt-1 text-encre-2">
          {etape === 0 && "Le nom que toute l'équipe verra dans la liste."}
          {etape === 1 && "On en déduit la méthode et la précision habituelles. Tu pourras tout changer."}
          {etape === 2 && "La classe de précision du cahier des charges sert à juger le contrôle (EMQ et verdict)."}
        </p>
      </div>

      {etape === 0 && (
        <div className="flex flex-col gap-4">
          <label className="etiquette">Nom du chantier
            <input autoFocus required maxLength={200} className="champ font-normal" placeholder="Ex. Lotissement Keur Massar" value={nom} onChange={(e) => setNom(e.target.value)} />
          </label>
          <label className="etiquette">Lieu
            <input maxLength={200} className="champ font-normal" placeholder="Ex. Keur Massar, Dakar" value={lieu} onChange={(e) => setLieu(e.target.value)} />
          </label>
          <label className="etiquette"><span>Client <span className="font-normal text-encre-2">(facultatif)</span></span>
            <input maxLength={200} className="champ font-normal" placeholder="Ex. SN HLM" value={client} onChange={(e) => setClient(e.target.value)} />
          </label>
        </div>
      )}

      {etape === 1 && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            {(Object.keys(NATURES) as Nature[]).map((n, i, l) => (
              <button
                key={n}
                type="button"
                aria-pressed={nature === n}
                onClick={() => choisirNature(n)}
                className={`flex min-h-24 flex-col items-start gap-2 rounded-xl border p-3.5 text-left text-[15px] font-medium transition-colors ${i === l.length - 1 && l.length % 2 ? "col-span-2" : ""} ${nature === n ? "border-accent bg-accent/10" : "border-bord-fort bg-surface"}`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
                  <path d={ICONES_NATURE[n]} />
                </svg>
                {NATURES[n]}
              </button>
            ))}
          </div>
          {p && (
            <p className="carte p-3.5 text-sm">
              <strong>Proposé :</strong> {METHODES[p.methode]} · précision {CLASSES[p.classe].label}
            </p>
          )}
        </div>
      )}

      {etape === 2 && (
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1.5 text-sm font-medium">Classe de précision</legend>
            <div className="grid grid-cols-2 gap-2.5">
              {CLASSES.map((cl, i) => (
                <button
                  key={cl.label}
                  type="button"
                  aria-pressed={classe === i}
                  onClick={() => setClasse(i)}
                  className={`flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-xl border px-3.5 py-2 text-left ${classe === i ? "border-accent bg-accent/10" : "border-bord-fort bg-surface"}`}
                >
                  <span className="font-mono text-[15px] font-semibold">{cl.label}</span>
                  {p?.classe === i && <span className="text-[12px] text-accent">Habituel pour ces travaux</span>}
                </button>
              ))}
            </div>
            {atteignable === 0 && <p className="rounded-lg bg-erreur-fond p-3 text-sm text-erreur">Cette précision est hors de portée de la méthode « {METHODES[methode]} ». Change de méthode ou de classe.</p>}
            {atteignable === 1 && <p className="rounded-lg bg-alerte-fond p-3 text-sm text-alerte">Atteignable avec « {METHODES[methode]} », mais avec des précautions.</p>}
          </fieldset>

          <Liste label="Méthode" valeur={methode} options={optionsDe(METHODES)} onChange={setMethode} />

          <label className="etiquette"><span>Tolérance du cahier des charges, en cm <span className="font-normal text-encre-2">(si elle est écrite)</span></span>
            <input inputMode="decimal" className="champ font-normal font-mono" placeholder="Ex. 3" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
            <span className="text-[13px] font-normal text-encre-2">Elle remplace la borne de la classe pour juger le contrôle.</span>
          </label>
          {toleranceInvalide && <p className="text-sm text-erreur">Indique un nombre de centimètres, par exemple 3 ou 2,5.</p>}

          <Choix legende="Référentiel" options={optionsDe(REFERENTIELS)} valeur={referentiel} onChange={setReferentiel} />
        </div>
      )}

      <button type="submit" disabled={!peutContinuer || !pret || envoi || (etape === 2 && toleranceInvalide)} className="bouton-principal mt-auto min-h-12 text-base disabled:opacity-50">
        {etape < 2 ? "Continuer" : envoi ? "Création…" : "Créer le chantier"}
      </button>
    </form>
  );
}
