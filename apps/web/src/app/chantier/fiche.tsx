"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Choix, Encart } from "@/components/choix";
import { Pastille } from "@/components/pastille";
import { useSession } from "@/components/session";
import { Indicateurs } from "@/components/gestion/indicateurs";
import { Planning } from "@/components/gestion/planning";
import { MatriceRaci } from "@/components/gestion/raci";
import { db, enregistrer, enregistrerChantier, enregistrerPoint, maintenant, type Chantier, type Point } from "@/lib/db";
import {
  APPAREIL_PAR_DEFAUT, APPAREILS, CLASSES, CONTROLE_PAR, METHODES, NATURES, REFERENTIELS, SYSTEMES, TYPES_CONTROLE,
  compatibilite, formatCm, lireCsv, lireNombre, type Methode, type Systeme,
} from "@geotopo/metier";
import { resultatChantier, statutChantier } from "@/lib/statut";
import { Liste, optionsDe } from "@/components/liste";

const options = <K extends string>(o: Record<K, string>) => (Object.entries(o) as [K, string][]).map(([valeur, label]) => ({ valeur, label }));

export function FicheChantier() {
  const id = useSearchParams().get("id") ?? "";
  // null : introuvable sur cet appareil ; undefined : lecture en cours
  const chantier = useLiveQuery(() => db.chantiers.get(id).then((c) => c ?? null), [id]);
  const points = useLiveQuery(() => db.points.where("chantier_id").equals(id).filter((p) => !p.supprime).toArray(), [id]);

  if (chantier === undefined || points === undefined) return <p className="p-8 text-encre-2">Chargement…</p>;
  if (!chantier || chantier.supprime)
    return (
      <main className="p-8">
        <p>Ce chantier n&apos;existe pas sur cet appareil.</p>
        <Link href="/" className="text-accent underline">Retour aux chantiers</Link>
      </main>
    );
  return <Fiche chantier={chantier} points={points} />;
}

// [clé, libellé, libellé court sur téléphone]
const ONGLETS = [
  ["controle", "Contrôle", "Contrôle"],
  ["planning", "Planning", "Planning"],
  ["raci", "Qui fait quoi (RACI)", "RACI"],
  ["indicateurs", "Indicateurs", "Indicateurs"],
] as const;
type Onglet = (typeof ONGLETS)[number][0];

function Fiche({ chantier: c, points }: { chantier: Chantier; points: Point[] }) {
  const { peutValider, user } = useSession();
  const [onglet, setOnglet] = useState<Onglet>("controle");
  const router = useRouter();
  const maj = (champs: Partial<Chantier>) => enregistrerChantier({ ...c, ...champs });
  const r = resultatChantier(c, points);
  const statut = statutChantier(c, r);
  const compat = compatibilite(c.methode, c.classe);
  const [a, b, z] = SYSTEMES[c.systeme_coord].axes;

  // La validation fait avancer le jalon « Contrôle de précision » du planning
  async function valider(verdict: Chantier["verdict"]) {
    await maj({ verdict, valide_par: verdict ? (user?.id ?? null) : null, valide_le: verdict ? maintenant() : null });
    const jalon = await db.taches.where("chantier_id").equals(c.id).filter((t) => !t.supprime && t.cle_modele === "controle").first();
    if (jalon) await enregistrer("taches", { ...jalon, avancement: verdict ? 100 : 0 });
  }

  async function supprimer() {
    if (!confirm(`Supprimer le chantier « ${c.nom} » et ses points ?`)) return;
    await maj({ supprime: true });
    router.push("/");
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
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <header className="flex flex-col gap-2">
        <Link href="/" className="pas-impression text-sm text-accent">← Chantiers</Link>
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Nom du chantier"
            value={c.nom}
            maxLength={200}
            onChange={(e) => maj({ nom: e.target.value || " " })}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-transparent bg-transparent text-2xl font-bold hover:border-bord focus:border-bord-fort md:text-3xl"
          />
          <Pastille statut={statut} />
        </div>
        <p className="text-encre-2">{[c.lieu, REFERENTIELS[c.referentiel], c.client && `Maître d'ouvrage : ${c.client}`].filter(Boolean).join(" · ")}</p>
      </header>

      <nav aria-label="Volets du chantier" className="pas-impression">
        <div role="tablist" className="grid grid-cols-4 border-b border-bord sm:flex sm:gap-1">
          {ONGLETS.map(([cle, label, court]) => (
            <button
              key={cle}
              type="button"
              role="tab"
              aria-selected={onglet === cle}
              onClick={() => setOnglet(cle)}
              className={`-mb-px min-h-11 border-b-2 px-1 text-[13px] font-medium sm:px-4 sm:text-sm ${onglet === cle ? "border-accent text-encre" : "border-transparent text-encre-2 hover:text-encre"}`}
            >
              <span className="sm:hidden">{court}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {onglet === "controle" && (
        <>
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          <section aria-labelledby="h-cdc" className="carte pas-impression flex flex-col gap-5 p-5 md:p-6">
            <h2 id="h-cdc" className="text-lg font-semibold">1. Exigences du cahier des charges</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="etiquette">Lieu
                <input className="champ font-normal" value={c.lieu} maxLength={200} onChange={(e) => maj({ lieu: e.target.value })} />
              </label>
              <label className="etiquette">Maître d&apos;ouvrage
                <input className="champ font-normal" value={c.client} maxLength={200} onChange={(e) => maj({ client: e.target.value })} />
              </label>
              <Liste label="Référentiel" valeur={c.referentiel} options={optionsDe(REFERENTIELS)} onChange={(referentiel) => maj({ referentiel })} />
              <Liste label="Nature des travaux" valeur={c.nature} options={optionsDe(NATURES)} onChange={(nature) => maj({ nature })} />
            </div>

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

            <Choix
              legende="Méthode de travail"
              options={options(METHODES)}
              valeur={c.methode}
              onChange={(methode: Methode) => maj({ methode, appareil: APPAREIL_PAR_DEFAUT[methode] })}
            />
            {compat.niveau === 2 && <Encart ton="ok" titre="Méthode compatible avec la classe exigée" />}
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Liste label="Appareil utilisé" valeur={c.appareil} options={optionsDe(APPAREILS)} onChange={(appareil) => maj({ appareil })} />
              <label className="etiquette">Modèle et n° de série
                <input className="champ font-normal" value={c.appareil_modele} maxLength={200} onChange={(e) => maj({ appareil_modele: e.target.value })} />
              </label>
              <label className="etiquette">Dernier étalonnage
                <input type="date" className="champ font-normal" value={c.etalonnage_le ?? ""} onChange={(e) => maj({ etalonnage_le: e.target.value || null })} />
              </label>
            </div>
          </section>

          <section aria-labelledby="h-ctl" className="carte flex flex-col gap-5 p-5 md:p-6">
            <h2 id="h-ctl" className="text-lg font-semibold">2. Contrôle et acceptabilité</h2>
            <div className="pas-impression grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Liste label="Type de contrôle" valeur={c.type_controle} options={optionsDe(TYPES_CONTROLE)} onChange={(type_controle) => maj({ type_controle })} />
              <Liste label="Réalisé par" valeur={c.controle_par} options={optionsDe(CONTROLE_PAR)} onChange={(controle_par) => maj({ controle_par })} />
            </div>
            <div className="pas-impression">
              <Choix
                legende="Type de coordonnées"
                options={(Object.keys(SYSTEMES) as Systeme[]).map((s) => ({ valeur: s, label: SYSTEMES[s].label }))}
                valeur={c.systeme_coord}
                onChange={(systeme_coord) => maj({ systeme_coord })}
                aide={`${SYSTEMES[c.systeme_coord].aide} S'applique aux nouvelles saisies.`}
              />
            </div>

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
                    <tr><td colSpan={6} className="px-3 py-4 text-center font-sans text-encre-2">Aucun point contrôlé. Saisis ou importe des points de contrôle portant les mêmes codes que les points levés.</td></tr>
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
            {r.sansControle.length > 0 && <p className="text-[13px] text-encre-2">Points levés sans contrôle : {r.sansControle.join(", ")}</p>}
            {r.systemesDifferents.length > 0 && (
              <Encart ton="alerte" titre="Levé et contrôle dans deux systèmes différents">
                Points {r.systemesDifferents.join(", ")} : la conversion entre E, N, H et X, Y, Z n&apos;est pas encore gérée. Ils sont exclus du calcul.
              </Encart>
            )}

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Mesure titre={c.systeme_coord === "XYZ" ? "EMQ 3D" : "EMQ plani"} valeur={r.emq} />
              <Mesure titre="Écart max" valeur={r.ecartMax} />
              <Mesure titre={`Tolérance ${formatCm(c.coef_tolerance)} × borne`} valeur={r.tolerance} />
            </div>

            {r.verdict === "conforme" && <Encart ton="ok" titre="Travaux acceptables">EMQ et écarts dans la borne de {r.borne != null ? `${formatCm(r.borne)} cm` : "—"}.</Encart>}
            {r.verdict === "non_conforme" && <Encart ton="erreur" titre="Travaux non acceptables">{r.motifs.join(" ")} Reprise ou réobservation à prévoir.</Encart>}
            {r.verdict === "incomplet" && <Encart ton="info" titre="Contrôle incomplet">{r.motifs.join(" ")}</Encart>}
            <p className="text-[13px] text-encre-2">
              Règle : EMQ ≤ borne (classe ou tolérance du cahier des charges), et aucun écart au-delà de {formatCm(c.coef_tolerance)} × la borne. Le rapport 2,5 vient de l&apos;instruction ANCFCC (art. 13).
            </p>
          </section>
        </div>

        <GestionPoints chantier={c} points={points} />

        <section aria-labelledby="h-val" className="carte flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
          <div>
            <h2 id="h-val" className="text-lg font-semibold">4. Validation</h2>
            <p className="mt-1 text-sm text-encre-2">
              {c.verdict
                ? `Déclaré ${c.verdict === "conforme" ? "conforme" : "non conforme"} le ${c.valide_le ? new Date(c.valide_le).toLocaleString("fr-FR") : "—"}.`
                : peutValider
                  ? "Le verdict calculé est une proposition. La validation engage le contrôleur."
                  : "Seuls le chef de mission et le contrôleur peuvent valider."}
            </p>
          </div>
          <div className="pas-impression flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button type="button" className="bouton-secondaire" onClick={exporterCsv} disabled={!r.ecarts.length}>Exporter les écarts (CSV)</button>
            <button type="button" className="bouton-secondaire" onClick={() => window.print()}>Imprimer le PV</button>
            {peutValider && c.verdict && <button type="button" className="bouton-secondaire" onClick={() => valider(null)}>Annuler la validation</button>}
            {peutValider && !c.verdict && (
              <>
                <button type="button" className="bouton-secondaire" onClick={() => valider("non_conforme")} disabled={!r.ecarts.length}>Déclarer non conforme</button>
                <button type="button" className="bouton-principal" onClick={() => valider("conforme")} disabled={r.verdict !== "conforme"}>Valider conforme</button>
              </>
            )}
          </div>
        </section>
        </>
      )}
      {onglet === "planning" && <Planning chantier={c} />}
      {onglet === "raci" && <MatriceRaci chantier={c} />}
      {onglet === "indicateurs" && <Indicateurs chantier={c} points={points} />}

      <div className="pas-impression flex justify-end">
        <button type="button" onClick={supprimer} className="bouton text-erreur">Supprimer le chantier</button>
      </div>
    </main>
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
    <section aria-labelledby="h-pts" className="carte pas-impression flex flex-col gap-4 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="h-pts" className="text-lg font-semibold">3. Points</h2>
        <Link href={`/terrain/?id=${c.id}`} className="bouton-principal">Saisir sur le terrain</Link>
      </div>
      <Choix
        legende="Phase"
        options={[
          { valeur: "leve" as const, label: `Levé (${points.filter((p) => p.phase === "leve").length})` },
          { valeur: "controle" as const, label: `Contrôle (${points.filter((p) => p.phase === "controle").length})` },
        ]}
        valeur={phase}
        onChange={setPhase}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="etiquette">
            Importer des points ({a}, {b}, {z} en mètres)
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
    </section>
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
