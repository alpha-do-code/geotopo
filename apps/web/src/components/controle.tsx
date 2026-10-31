"use client";

import {
  APPAREIL_PAR_DEFAUT, APPAREILS, CLASSES, CONTROLE_PAR, METHODES, NATURES, REFERENTIELS, SYSTEMES, TYPES_CONTROLE,
  compatibilite, formatCm, lireCsv, lireNombre, type Methode, type ResultatControle, type Systeme,
} from "@geotopo/metier";
import Link from "next/link";
import { useState } from "react";
import { Choix, Encart } from "@/components/choix";
import { Liste, optionsDe } from "@/components/liste";
import { useSession } from "@/components/session";
import { db, enregistrer, enregistrerChantier, enregistrerPoint, maintenant, type Chantier, type Point } from "@/lib/db";

// Volet Contrôle de la fiche chantier, dans l'ordre réel du travail :
// le chantier, ce qu'exige le cahier des charges, les moyens, les points, puis le résultat et la validation.

type Etat = "fait" | "a_completer" | "en_cours" | "alerte" | "a_faire";

const ETATS: Record<Etat, { label: string; classe: string }> = {
  fait: { label: "Complet", classe: "bg-ok-fond text-ok" },
  a_completer: { label: "À compléter", classe: "bg-surface-2 text-encre-2" },
  en_cours: { label: "En cours", classe: "bg-info-fond text-info" },
  alerte: { label: "À revoir", classe: "bg-erreur-fond text-erreur" },
  a_faire: { label: "À faire", classe: "bg-alerte-fond text-alerte" },
};

export function Controle({ chantier: c, points, resultat: r }: { chantier: Chantier; points: Point[]; resultat: ResultatControle }) {
  const maj = (champs: Partial<Chantier>) => enregistrerChantier({ ...c, ...champs });
  const compat = compatibilite(c.methode, c.classe);
  const nbLeves = points.filter((p) => p.phase === "leve").length;
  const nbControles = points.filter((p) => p.phase === "controle").length;
  const borneTexte = c.tolerance_cm ? `${formatCm(c.tolerance_cm)} cm (CDC)` : CLASSES[c.classe].label;

  const etats: Etat[] = [
    c.lieu.trim() && c.client.trim() ? "fait" : "a_completer",
    "fait",
    compat.niveau === 0 ? "alerte" : c.appareil_modele.trim() && c.etalonnage_le ? "fait" : "a_completer",
    nbLeves && nbControles ? "fait" : nbLeves || nbControles ? "en_cours" : "a_faire",
    c.verdict ? "fait" : r.verdict === "incomplet" ? "a_faire" : "en_cours",
  ];
  // Ouvertes au départ : les étapes qui demandent encore quelque chose, et toujours le résultat
  const [ouvertes, setOuvertes] = useState<boolean[]>(() => etats.map((e, i) => i === 4 || e !== "fait"));
  const basculer = (i: number) => setOuvertes((o) => o.map((v, k) => (k === i ? !v : v)));

  return (
    <div className="flex flex-col gap-4">
      <Bandeau chantier={c} resultat={r} borne={borneTexte} />

      <Etape n={1} titre="Le chantier" etat={etats[0]} ouverte={ouvertes[0]} onBasculer={() => basculer(0)}
        resume={[NATURES[c.nature], REFERENTIELS[c.referentiel], c.lieu].filter(Boolean).join(" · ")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="etiquette">Lieu
            <input className="champ font-normal" value={c.lieu} maxLength={200} onChange={(e) => maj({ lieu: e.target.value })} placeholder="Commune, quartier, lot" />
          </label>
          <label className="etiquette">Maître d&apos;ouvrage
            <input className="champ font-normal" value={c.client} maxLength={200} onChange={(e) => maj({ client: e.target.value })} />
          </label>
          <Liste label="Nature des travaux" valeur={c.nature} options={optionsDe(NATURES)} onChange={(nature) => maj({ nature })} />
          <Liste label="Référentiel" valeur={c.referentiel} options={optionsDe(REFERENTIELS)} onChange={(referentiel) => maj({ referentiel })} />
        </div>
      </Etape>

      <Etape n={2} titre="Exigences du cahier des charges" etat={etats[1]} ouverte={ouvertes[1]} onBasculer={() => basculer(1)}
        resume={`Classe ${borneTexte} · écart max ${formatCm(c.coef_tolerance)} × borne`}>
        <Choix legende="Classe de précision exigée" options={CLASSES.map((k, i) => ({ valeur: i, label: k.label }))} valeur={c.classe} onChange={(classe) => maj({ classe })} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ChampNombre
            label="Tolérance du cahier des charges (cm)"
            aide="Facultatif. Remplace la borne de la classe."
            valeur={c.tolerance_cm}
            onChange={(v) => maj({ tolerance_cm: v != null && v > 0 ? v : null })}
          />
          <ChampNombre
            label="Coefficient de tolérance"
            aide="Écart maximal admis = coefficient × borne. 2,5 par défaut (ANCFCC)."
            valeur={c.coef_tolerance}
            onChange={(v) => v != null && v > 0 && v <= 10 && maj({ coef_tolerance: v })}
          />
        </div>
      </Etape>

      <Etape n={3} titre="Moyens mis en œuvre" etat={etats[2]} ouverte={ouvertes[2]} onBasculer={() => basculer(2)}
        resume={`${METHODES[c.methode]} · ${APPAREILS[c.appareil]} · ${SYSTEMES[c.systeme_coord].label}`}>
        <Choix
          legende="Méthode de travail"
          options={optionsDe(METHODES)}
          valeur={c.methode}
          onChange={(methode: Methode) => maj({ methode, appareil: APPAREIL_PAR_DEFAUT[methode] })}
        />
        {compat.niveau === 2 && <Encart ton="ok" titre={`Méthode compatible avec la classe ${CLASSES[c.classe].label}`} />}
        {compat.niveau === 1 && (
          <Encart ton="alerte" titre="Possible avec précautions">
            {METHODES[c.methode]} n&apos;atteint {CLASSES[c.classe].label} qu&apos;avec des précautions (sessions longues, calage dense, points d&apos;appui).
          </Encart>
        )}
        {compat.niveau === 0 && (
          <Encart ton="erreur" titre="Méthode insuffisante pour cette classe">
            {METHODES[c.methode]} atteint couramment {CLASSES[compat.meilleure]?.label ?? "—"} au mieux. Choisir une autre méthode ou faire valider une dérogation.
          </Encart>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Liste label="Appareil" valeur={c.appareil} options={optionsDe(APPAREILS)} onChange={(appareil) => maj({ appareil })} />
          <label className="etiquette">Modèle et n° de série
            <input className="champ font-normal" value={c.appareil_modele} maxLength={200} onChange={(e) => maj({ appareil_modele: e.target.value })} />
          </label>
          <label className="etiquette">Dernier étalonnage
            <input type="date" className="champ font-normal" value={c.etalonnage_le ?? ""} onChange={(e) => maj({ etalonnage_le: e.target.value || null })} />
          </label>
        </div>
        <Choix
          legende="Système de coordonnées"
          options={(Object.keys(SYSTEMES) as Systeme[]).map((s) => ({ valeur: s, label: SYSTEMES[s].label }))}
          valeur={c.systeme_coord}
          onChange={(systeme_coord) => maj({ systeme_coord })}
          aide={`${SYSTEMES[c.systeme_coord].aide} S'applique aux nouvelles saisies.`}
        />
      </Etape>

      <Etape n={4} titre="Points levés et points de contrôle" etat={etats[3]} ouverte={ouvertes[3]} onBasculer={() => basculer(3)}
        resume={`${nbLeves} levé(s) · ${nbControles} contrôle(s) · ${TYPES_CONTROLE[c.type_controle]}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Liste label="Type de contrôle" valeur={c.type_controle} options={optionsDe(TYPES_CONTROLE)} onChange={(type_controle) => maj({ type_controle })} />
          <Liste label="Contrôle réalisé par" valeur={c.controle_par} options={optionsDe(CONTROLE_PAR)} onChange={(controle_par) => maj({ controle_par })} />
        </div>
        <GestionPoints chantier={c} points={points} />
      </Etape>

      <Etape n={5} titre="Résultat et validation" etat={etats[4]} ouverte={ouvertes[4]} onBasculer={() => basculer(4)} imprimable
        resume={c.verdict ? `Validé ${c.verdict === "conforme" ? "conforme" : "non conforme"}` : r.verdict === "incomplet" ? "En attente des points de contrôle" : "Verdict proposé, à valider"}>
        <Resultat chantier={c} resultat={r} />
      </Etape>
    </div>
  );
}

// Toujours visible en haut : ce qu'on exige, ce qu'on obtient, et le verdict
function Bandeau({ chantier: c, resultat: r, borne }: { chantier: Chantier; resultat: ResultatControle; borne: string }) {
  const verdict =
    c.verdict === "conforme" ? { t: "Validé conforme", k: "text-ok" }
    : c.verdict === "non_conforme" ? { t: "Validé non conforme", k: "text-erreur" }
    : r.verdict === "conforme" ? { t: "Conforme, à valider", k: "text-alerte" }
    : r.verdict === "non_conforme" ? { t: "Non conforme, à valider", k: "text-erreur" }
    : { t: "Contrôle incomplet", k: "text-encre-2" };
  const cases = [
    { titre: "Classe exigée", valeur: borne },
    { titre: c.systeme_coord === "XYZ" ? "EMQ 3D" : "EMQ plani", valeur: r.emq == null ? "—" : `${formatCm(r.emq)} cm` },
    { titre: "Écart max", valeur: r.ecartMax == null ? "—" : `${formatCm(r.ecartMax)} cm` },
  ];
  return (
    <section aria-label="Synthèse du contrôle" className="carte sticky top-0 z-20 grid grid-cols-2 gap-x-4 gap-y-2 p-3.5 shadow-[0_8px_16px_-12px_rgb(0_0_0/0.5)] sm:grid-cols-4 sm:p-4 md:top-2">
      {cases.map((k) => (
        <div key={k.titre} className="min-w-0">
          <div className="text-[12px] text-encre-2">{k.titre}</div>
          <div className="truncate font-mono text-[15px] font-semibold sm:text-base">{k.valeur}</div>
        </div>
      ))}
      <div className="min-w-0">
        <div className="text-[12px] text-encre-2">Verdict</div>
        <div className={`truncate text-[15px] font-semibold sm:text-base ${verdict.k}`}>{verdict.t}</div>
      </div>
    </section>
  );
}

function Etape({
  n, titre, etat, resume, ouverte, onBasculer, imprimable, children,
}: {
  n: number;
  titre: string;
  etat: Etat;
  resume: string;
  ouverte: boolean;
  onBasculer: () => void;
  imprimable?: boolean;
  children: React.ReactNode;
}) {
  const e = ETATS[etat];
  const id = `etape-${n}`;
  return (
    <section aria-labelledby={`${id}-t`} className={`carte ${imprimable ? "" : "pas-impression"}`}>
      <button
        type="button"
        aria-expanded={ouverte}
        aria-controls={`${id}-c`}
        onClick={onBasculer}
        className="pas-impression flex w-full items-center gap-3 p-4 text-left md:gap-4 md:px-6"
      >
        <span
          aria-hidden="true"
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${etat === "fait" ? "bg-accent text-accent-encre" : "border-2 border-bord-fort text-encre-2"}`}
        >
          {etat === "fait" ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>
          ) : n}
        </span>
        <span className="min-w-0 flex-1">
          <span id={`${id}-t`} className="block font-semibold md:text-lg">{titre}</span>
          {!ouverte && <span className="block truncate text-[13px] text-encre-2">{resume}</span>}
        </span>
        <span className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium sm:inline ${e.classe}`}>{e.label}</span>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 text-encre-2 transition-transform ${ouverte ? "rotate-180" : ""}`}>
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {/* À l'impression du PV, le résultat s'imprime même replié */}
      <div id={`${id}-c`} className={`${ouverte ? "flex" : "hidden print:flex"} flex-col gap-5 border-t border-bord p-4 md:p-6`}>
        {children}
      </div>
    </section>
  );
}

function Resultat({ chantier: c, resultat: r }: { chantier: Chantier; resultat: ResultatControle }) {
  const { peutValider, user } = useSession();
  const [a, b, z] = SYSTEMES[c.systeme_coord].axes;

  // La validation fait avancer le jalon « Contrôle de précision » du planning
  async function valider(verdict: Chantier["verdict"]) {
    await enregistrerChantier({ ...c, verdict, valide_par: verdict ? (user?.id ?? null) : null, valide_le: verdict ? maintenant() : null });
    const jalon = await db.taches.where("chantier_id").equals(c.id).filter((t) => !t.supprime && t.cle_modele === "controle").first();
    if (jalon) await enregistrer("taches", { ...jalon, avancement: verdict ? 100 : 0 });
  }

  function exporterCsv() {
    const lignes = [
      ["point", `d${a}_cm`, `d${b}_cm`, `d${z}_cm`, "ecart_cm", "dans_tolerance"].join(";"),
      ...r.ecarts.map((e) => [e.code, formatCm(e.da, 2), formatCm(e.db, 2), formatCm(e.dc, 2), formatCm(e.ecart, 2), e.dansTolerance ? "oui" : "non"].join(";")),
    ];
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(new Blob(["﻿" + lignes.join("\n")], { type: "text/csv;charset=utf-8" }));
    lien.download = `controle-${c.nom.replace(/[^\p{L}\p{N}]+/gu, "-")}.csv`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Mesure titre={c.systeme_coord === "XYZ" ? "EMQ 3D" : "EMQ plani"} valeur={r.emq} />
        <Mesure titre="Écart max" valeur={r.ecartMax} />
        <Mesure titre={`Tolérance ${formatCm(c.coef_tolerance)} × borne`} valeur={r.tolerance} />
      </div>

      {r.verdict === "conforme" && <Encart ton="ok" titre="Travaux acceptables">EMQ et écarts dans la borne de {r.borne != null ? `${formatCm(r.borne)} cm` : "—"}.</Encart>}
      {r.verdict === "non_conforme" && <Encart ton="erreur" titre="Travaux non acceptables">{r.motifs.join(" ")} Reprise ou réobservation à prévoir.</Encart>}
      {r.verdict === "incomplet" && <Encart ton="info" titre="Contrôle incomplet">{r.motifs.join(" ")}</Encart>}
      {r.systemesDifferents.length > 0 && (
        <Encart ton="alerte" titre="Levé et contrôle dans deux systèmes différents">
          Points {r.systemesDifferents.join(", ")} : la conversion entre E, N, H et X, Y, Z n&apos;est pas encore gérée. Ils sont exclus du calcul.
        </Encart>
      )}

      <div className="overflow-x-auto rounded-md border border-bord">
        <table className="w-full min-w-[460px] text-sm">
          <caption className="px-3 py-2.5 text-left text-[13px] text-encre-2">Écarts levé / contrôle, en cm</caption>
          <thead>
            <tr className="bg-surface-2 text-right text-encre-2">
              <th className="px-3 py-2 text-left font-semibold">Point</th>
              <th className="px-3 py-2 font-semibold">d{a}</th>
              <th className="px-3 py-2 font-semibold">d{b}</th>
              <th className="px-3 py-2 font-semibold">d{z}</th>
              <th className="px-3 py-2 font-semibold">{c.systeme_coord === "XYZ" ? "Écart 3D" : "Écart plani"}</th>
              <th className="px-3 py-2 font-semibold">Tolérance</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {r.ecarts.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center font-sans text-encre-2">Aucun point contrôlé. Saisis ou importe à l&apos;étape 4 des points de contrôle portant les mêmes codes que les points levés.</td></tr>
            )}
            {r.ecarts.map((e) => (
              <tr key={e.code} className="border-t border-bord text-right">
                <td className="px-3 py-2 text-left">{e.code}</td>
                <td className="px-3 py-2">{signe(e.da)}</td>
                <td className="px-3 py-2">{signe(e.db)}</td>
                <td className="px-3 py-2">{signe(e.dc)}</td>
                <td className="px-3 py-2 font-semibold">{formatCm(e.ecart)}</td>
                <td className={`px-3 py-2 font-semibold ${e.dansTolerance ? "text-ok" : "text-erreur"}`}>{e.dansTolerance ? "OK" : "Hors tol."}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.sansControle.length > 0 && <p className="-mt-2 text-[13px] text-encre-2">Points levés sans contrôle : {r.sansControle.join(", ")}</p>}
      <p className="text-[13px] text-encre-2">
        Règle : EMQ ≤ borne (classe ou tolérance du cahier des charges), et aucun écart au-delà de {formatCm(c.coef_tolerance)} × la borne. Le rapport 2,5 vient de l&apos;instruction ANCFCC (art. 13).
      </p>

      <div className="flex flex-col gap-4 rounded-md bg-surface-2 p-4">
        <p className="text-sm">
          {c.verdict
            ? `Déclaré ${c.verdict === "conforme" ? "conforme" : "non conforme"} le ${c.valide_le ? new Date(c.valide_le).toLocaleString("fr-FR") : "—"}.`
            : peutValider
              ? "Le verdict calculé est une proposition. La validation engage le contrôleur."
              : "Seuls le chef de mission et le contrôleur peuvent valider."}
        </p>
        <div className="pas-impression flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {peutValider && !c.verdict && (
            <>
              <button type="button" className="bouton-principal" onClick={() => valider("conforme")} disabled={r.verdict !== "conforme"}>Valider conforme</button>
              <button type="button" className="bouton-secondaire" onClick={() => valider("non_conforme")} disabled={!r.ecarts.length}>Déclarer non conforme</button>
            </>
          )}
          {peutValider && c.verdict && <button type="button" className="bouton-secondaire" onClick={() => valider(null)}>Annuler la validation</button>}
          <button type="button" className="bouton-secondaire" onClick={() => window.print()}>Imprimer le PV</button>
          <button type="button" className="bouton-secondaire" onClick={exporterCsv} disabled={!r.ecarts.length}>Exporter les écarts (CSV)</button>
        </div>
      </div>
    </>
  );
}

function GestionPoints({ chantier: c, points }: { chantier: Chantier; points: Point[] }) {
  const [phase, setPhase] = useState<Point["phase"]>("leve");
  const [texte, setTexte] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const liste = points.filter((p) => p.phase === phase).sort((x, y) => x.code.localeCompare(y.code, "fr", { numeric: true }));
  const [a, b, z] = SYSTEMES[c.systeme_coord].axes;

  async function importer(contenu: string) {
    const { lignes, erreurs } = lireCsv(contenu);
    const t = maintenant();
    for (const l of lignes) {
      // Un code déjà saisi dans la même phase est remplacé, pas dupliqué
      const existant = points.find((p) => p.phase === phase && p.code.toUpperCase() === l.code.toUpperCase());
      await enregistrerPoint({
        id: existant?.id ?? crypto.randomUUID(),
        org_id: c.org_id,
        chantier_id: c.id,
        code: l.code,
        phase,
        systeme: c.systeme_coord,
        a: l.a,
        b: l.b,
        c: l.c,
        observation: l.observation,
        mesure_le: t,
        supprime: false,
        updated_at: t,
        sale: 1,
      });
    }
    setMessage(`${lignes.length} point(s) importé(s) en ${phase === "leve" ? "levé" : "contrôle"}.${erreurs.length ? ` ${erreurs.length} ligne(s) ignorée(s).` : ""}`);
    setTexte("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Choix
          legende="Points affichés"
          options={[
            { valeur: "leve" as const, label: `Levés (${points.filter((p) => p.phase === "leve").length})` },
            { valeur: "controle" as const, label: `Contrôles (${points.filter((p) => p.phase === "controle").length})` },
          ]}
          valeur={phase}
          onChange={setPhase}
        />
        <Link href={`/terrain/?id=${c.id}`} className="bouton-principal w-full sm:w-auto">Saisir sur le terrain</Link>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="etiquette">
            Importer des points {phase === "leve" ? "levés" : "de contrôle"} ({a}, {b}, {z} en mètres)
            <textarea
              rows={5}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder={`code;${a};${b};${z};observation\nB1;1000,125;2000,340;12,05;borne`}
              className="champ py-2 font-mono font-normal"
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button type="button" className="bouton-secondaire" disabled={!texte.trim()} onClick={() => importer(texte)}>Importer le texte</button>
            <label className="bouton-secondaire">
              Choisir un fichier CSV
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 2_000_000) return setMessage("Fichier trop gros (2 Mo maximum).");
                  await importer(await f.text());
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {message && <p role="status" className="text-sm text-encre-2">{message}</p>}
        </div>
        <div className="max-h-80 overflow-auto rounded-md border border-bord">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-right text-encre-2">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Point</th>
                <th className="px-3 py-2 font-semibold">Système</th>
                <th className="px-3 py-2 font-semibold">{a} / X</th>
                <th className="px-3 py-2 font-semibold">{b} / Y</th>
                <th className="px-3 py-2 font-semibold">{z} / Z</th>
                <th className="px-3 py-2"><span className="sr-only">Supprimer</span></th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {liste.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center font-sans text-encre-2">Aucun point.</td></tr>}
              {liste.map((p) => (
                <tr key={p.id} className="border-t border-bord text-right">
                  <td className="px-3 py-1.5 text-left">{p.code}</td>
                  <td className="px-3 py-1.5">{p.systeme}</td>
                  <td className="px-3 py-1.5">{p.a.toFixed(3)}</td>
                  <td className="px-3 py-1.5">{p.b.toFixed(3)}</td>
                  <td className="px-3 py-1.5">{p.c.toFixed(3)}</td>
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      aria-label={`Supprimer le point ${p.code}`}
                      onClick={() => enregistrerPoint({ ...p, supprime: true })}
                      className="inline-flex size-9 items-center justify-center rounded text-encre-2 hover:text-erreur"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9.5h5L11 4" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChampNombre({ label, aide, valeur, onChange }: { label: string; aide: string; valeur: number | null; onChange: (v: number | null) => void }) {
  const [texte, setTexte] = useState(valeur == null ? "" : String(valeur).replace(".", ","));
  return (
    <label className="etiquette">
      {label}
      <input
        inputMode="decimal"
        className="champ font-mono font-normal"
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          onChange(lireNombre(e.target.value));
        }}
      />
      <span className="text-[13px] font-normal text-encre-2">{aide}</span>
    </label>
  );
}

function Mesure({ titre, valeur }: { titre: string; valeur: number | null }) {
  return (
    <div className="flex flex-col justify-between gap-1 rounded-md border border-bord p-2.5 sm:p-3">
      <div className="text-[12px] leading-tight text-encre-2 sm:text-[13px]">{titre}</div>
      <div className="font-mono text-lg font-semibold whitespace-nowrap sm:text-xl">{valeur == null ? "—" : `${formatCm(valeur)} cm`}</div>
    </div>
  );
}

const signe = (v: number) => (v > 0 ? "+" : "") + formatCm(v);
