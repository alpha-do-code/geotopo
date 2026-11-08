"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Choix } from "@/components/choix";
import { useSession } from "@/components/session";
import { db, enregistrerPoint, maintenant, type Chantier, type Point } from "@/lib/db";
import { borneClasse, CLASSES, ecartPoint, formatCm, lireNombre, METHODES, REFERENTIELS, SYSTEMES, type Systeme } from "@geotopo/metier";

export function SaisieTerrain() {
  const id = useSearchParams().get("id");
  const { orgId } = useSession();
  const chantiers = useLiveQuery(() => db.chantiers.where("org_id").equals(orgId).filter((c) => !c.supprime).toArray(), [orgId]);
  // null : introuvable sur cet appareil ; undefined : lecture en cours
  const chantier = useLiveQuery(() => (id ? db.chantiers.get(id).then((c) => c ?? null) : null), [id]);

  if (!id) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-bold">Mode terrain</h1>
        <p className="text-encre-2">Choisis le chantier sur lequel tu travailles.</p>
        <ul className="flex flex-col gap-3">
          {chantiers?.map((c) => (
            <li key={c.id}>
              <Link href={`/terrain/?id=${c.id}`} className="carte flex min-h-14 flex-col justify-center p-4">
                <span className="font-semibold">{c.nom}</span>
                <span className="text-sm text-encre-2">{METHODES[c.methode]} · {CLASSES[c.classe].label}</span>
              </Link>
            </li>
          ))}
          {chantiers?.length === 0 && (
            <li className="carte p-4 text-encre-2">Aucun chantier. <Link href="/" className="text-accent underline">Crée-en un</Link> d&apos;abord.</li>
          )}
        </ul>
      </main>
    );
  }
  if (chantier === undefined) return <p className="p-8 text-encre-2">Chargement…</p>;
  if (!chantier) return <p className="p-8">Chantier introuvable sur cet appareil.</p>;
  return <Formulaire key={chantier.id} chantier={chantier} />;
}

// Propose le code suivant : B17 → B18
function codeSuivant(code: string) {
  const m = code.match(/^(.*?)(\d+)$/);
  return m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0") : code;
}

// Nom proposé pour le prochain levé : la suite du dernier levé saisi, ou P1 pour commencer
function prochainLeve(points: Point[]) {
  const leves = points.filter((p) => p.phase === "leve").sort((x, y) => y.mesure_le.localeCompare(x.mesure_le));
  return leves.length ? codeSuivant(leves[0].code) : "P1";
}

// Contrôle guidé : les levés pas encore contrôlés, dans l'ordre où ils ont été levés
function aControler(points: Point[]) {
  const controles = new Set(points.filter((p) => p.phase === "controle").map((p) => p.code.toUpperCase()));
  return points
    .filter((p) => p.phase === "leve" && !controles.has(p.code.toUpperCase()))
    .sort((x, y) => x.mesure_le.localeCompare(y.mesure_le));
}

function Formulaire({ chantier: c }: { chantier: Chantier }) {
  const [phase, setPhase] = useState<Point["phase"]>("leve");
  const [systeme, setSysteme] = useState<Systeme>(c.systeme_coord);
  const [code, setCode] = useState("");
  const [va, setVa] = useState("");
  const [vb, setVb] = useState("");
  const [vc, setVc] = useState("");
  const [observation, setObservation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const points = useLiveQuery(() => db.points.where("chantier_id").equals(c.id).filter((p) => !p.supprime).toArray(), [c.id]);
  const charges = points !== undefined;
  const liste = points ?? [];
  // Champs enchaînés par la touche « Suivant » du clavier : Point → 1er axe → 2e → 3e → enregistrer
  const champs = useRef<(HTMLInputElement | null)[]>([]);
  const focaliser = (i: number) => champs.current[i]?.focus();

  // Nom proposé dès l'ouverture (et au changement de phase), tant que l'opérateur ne l'a pas tapé
  const propose = useRef(true);
  useEffect(() => {
    if (!charges || !propose.current) return;
    const suivant = phase === "leve" ? prochainLeve(liste) : (aControler(liste)[0]?.code ?? "");
    // Proposition calculée depuis la base locale, une fois chargée
    setCode(suivant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charges, phase]);

  const [a, b, z] = SYSTEMES[systeme].axes;
  const na = lireNombre(va), nb = lireNombre(vb), nc = lireNombre(vc);
  const valide = code.trim() !== "" && na != null && nb != null && nc != null;

  // En contrôle : écart immédiat avec le point levé de même code
  const leve = liste.find((p) => p.phase === "leve" && p.code.toUpperCase() === code.trim().toUpperCase());
  const borne = borneClasse(c.classe, c.tolerance_cm);
  const tolerance = borne == null ? null : c.coef_tolerance * borne;
  const ecart =
    phase === "controle" && leve && valide && leve.systeme === systeme
      ? ecartPoint(leve, { code, systeme, a: na!, b: nb!, c: nc! }).ecart
      : null;

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!valide) return;
    const t = maintenant();
    const existant = liste.find((p) => p.phase === phase && p.code.toUpperCase() === code.trim().toUpperCase());
    await enregistrerPoint({
      id: existant?.id ?? crypto.randomUUID(),
      org_id: c.org_id,
      chantier_id: c.id,
      code: code.trim(),
      phase,
      systeme,
      a: na!,
      b: nb!,
      c: nc!,
      observation: observation.trim(),
      mesure_le: t,
      supprime: false,
      updated_at: t,
      sale: 1,
    });
    setMessage(`${code.trim()} ${existant ? "mis à jour" : "enregistré"}.`);
    // Point suivant : la suite de la série en levé, le prochain levé non contrôlé en contrôle
    const restants = aControler(liste).filter((p) => p.code.toUpperCase() !== code.trim().toUpperCase());
    setCode(phase === "leve" ? codeSuivant(code.trim()) : (restants[0]?.code ?? ""));
    propose.current = true;
    setVa(""); setVb(""); setVc(""); setObservation("");
    // On reste au clavier : retour sur le premier axe pour le point suivant
    focaliser(phase === "controle" && !restants.length ? 0 : 1);
  }

  // « Suivant » sur le clavier : champ suivant, et sur le dernier axe, enregistrement
  function auClavier(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (i < 3) focaliser(i + 1);
    else e.currentTarget.form?.requestSubmit();
  }

  const restantsControle = aControler(liste);
  const nbLeves = liste.filter((p) => p.phase === "leve").length;

  const recents = [...liste].sort((x, y) => y.mesure_le.localeCompare(x.mesure_le)).slice(0, 8);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-5">
      <header>
        <Link href={`/chantier/?id=${c.id}`} className="text-sm text-accent">← Fiche du chantier</Link>
        <h1 className="mt-1 text-xl font-bold">{c.nom}</h1>
        <p className="text-sm text-encre-2">{METHODES[c.methode]} · {CLASSES[c.classe].label} · {REFERENTIELS[c.referentiel]}</p>
      </header>

      <form onSubmit={enregistrer} className="flex flex-col gap-4">
        <Choix legende="Phase" options={[{ valeur: "leve" as const, label: "Levé" }, { valeur: "controle" as const, label: "Contrôle" }]} valeur={phase} onChange={(ph) => {
          propose.current = true;
          setPhase(ph);
        }} />
        <Choix
          legende="Type de coordonnées"
          options={(Object.keys(SYSTEMES) as Systeme[]).map((s) => ({ valeur: s, label: SYSTEMES[s].label }))}
          valeur={systeme}
          onChange={setSysteme}
          aide={SYSTEMES[systeme].aide}
        />
        {phase === "controle" && nbLeves > 0 && (
          <div className="carte flex items-center gap-3 p-3.5" role="status">
            <span className="font-mono text-xl font-semibold tabular-nums">{nbLeves - restantsControle.length} / {nbLeves}</span>
            <span className="text-sm text-encre-2">
              {restantsControle.length ? `levés contrôlés · prochain : ${restantsControle[0].code}` : "levés contrôlés : tous les points sont contrôlés."}
            </span>
          </div>
        )}
        <label className="etiquette">Point
          <input
            ref={(el) => {
              champs.current[0] = el;
            }}
            className="champ min-h-12 font-mono text-[17px] font-normal"
            value={code}
            maxLength={60}
            onChange={(e) => {
              propose.current = false;
              setCode(e.target.value);
            }}
            onKeyDown={(e) => auClavier(e, 0)}
            enterKeyHint="next"
            autoCapitalize="characters"
            required
          />
          <span className="text-[13px] font-normal text-encre-2">
            {phase === "leve" ? "Proposé et numéroté tout seul. Tape un autre nom (ex. B1) pour démarrer une nouvelle série." : "Proposé dans l'ordre des levés. Tu peux en choisir un autre."}
          </span>
        </label>
        {/* En X, Y, Z les nombres sont longs (millions de mètres) et ont un bouton ± : un champ par ligne */}
        <div className={`grid gap-3 sm:grid-cols-3 ${systeme === "XYZ" ? "grid-cols-1" : "grid-cols-2"}`}>
          {([[a, va, setVa], [b, vb, setVb], [z, vc, setVc]] as const).map(([axe, v, set], i) => (
            <label key={axe} className={`etiquette min-w-0 ${i === 2 && systeme !== "XYZ" ? "col-span-2 sm:col-span-1" : ""}`}>{axe} (m)
              <span className="flex gap-1.5">
                <input
                  ref={(el) => {
                    champs.current[i + 1] = el;
                  }}
                  className={`champ min-h-12 min-w-0 flex-1 font-mono text-[17px] font-normal ${v && lireNombre(v) == null ? "border-erreur" : ""}`}
                  inputMode="decimal"
                  enterKeyHint={i < 2 ? "next" : "done"}
                  onKeyDown={(e) => auClavier(e, i + 1)}
                  value={v}
                  onChange={(e) => set(e.target.value)}
                  aria-invalid={!!v && lireNombre(v) == null}
                  required
                />
                {/* Coordonnées géocentriques : Y est négatif à l'ouest de Greenwich, et le pavé
                    numérique d'Android n'a pas toujours la touche « moins » */}
                {systeme === "XYZ" && (
                  <button
                    type="button"
                    onClick={() => set(v.startsWith("-") ? v.slice(1) : `-${v}`)}
                    className="min-h-12 w-11 shrink-0 rounded-md border border-bord-fort font-mono text-lg"
                    aria-label={`Changer le signe de ${axe}`}
                  >
                    ±
                  </button>
                )}
              </span>
            </label>
          ))}
        </div>

        {phase === "controle" && code.trim() && (
          <div className="carte flex flex-col gap-1 p-4" role="status">
            {!leve && <span className="text-sm text-encre-2">Pas de point levé {code.trim()} sur ce chantier.</span>}
            {leve && leve.systeme !== systeme && <span className="text-sm text-alerte">Le levé de {leve.code} est en {SYSTEMES[leve.systeme].label} : écart non calculable.</span>}
            {ecart != null && (
              <>
                <span className="text-[13px] text-encre-2">Écart avec le levé de {leve!.code}</span>
                <span className={`font-mono text-2xl font-semibold ${tolerance != null && ecart > tolerance ? "text-erreur" : "text-ok"}`}>{formatCm(ecart)} cm</span>
                {tolerance != null && (
                  <span className="text-[13px]">{ecart > tolerance ? "Hors tolérance" : "Dans la tolérance"} ({formatCm(tolerance)} cm)</span>
                )}
              </>
            )}
          </div>
        )}

        <label className="etiquette">Observation
          <textarea rows={2} maxLength={1000} className="champ py-2 font-normal" value={observation} onChange={(e) => setObservation(e.target.value)} />
        </label>
        <button type="submit" disabled={!valide} className="bouton-principal min-h-13 text-[17px]">Enregistrer le point</button>
        {message && <p role="status" className="text-sm text-ok">{message}</p>}
      </form>

      {recents.length > 0 && (
        <section aria-labelledby="h-rec" className="flex flex-col gap-2">
          <h2 id="h-rec" className="text-sm font-semibold text-encre-2">Derniers points</h2>
          <ul className="carte divide-y divide-bord">
            {recents.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono font-semibold">{p.code}</span>
                <span className="text-encre-2">{p.phase === "leve" ? "Levé" : "Contrôle"} · {p.systeme}</span>
                <span className={`text-xs ${p.sale ? "text-alerte" : "text-ok"}`}>{p.sale ? "À envoyer" : "Envoyé"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
