"use client";

import {
  ajouterJours, avancementPondere, avancementPrevu, conflitsDependances, dureeJours, ecartJours, jourIso, MODELES_TACHES, NATURES, retardJours,
} from "@geotopo/metier";
import { useState } from "react";
import { Encart } from "@/components/choix";
import { enregistrer, type Chantier } from "@/lib/db";
import { appliquerModele, definirDependance, nouvelleLigne, useGestion, type Dependance, type Tache } from "./donnees";
import { Liste } from "@/components/liste";

const J = 28; // largeur d'un jour (px)
const H = 40; // hauteur d'une ligne
const ENTETE = 44;
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)} %`);
const dateCourte = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

export function Planning({ chantier: c }: { chantier: Chantier }) {
  const { taches, dependances } = useGestion(c);
  if (!taches || !dependances) return <p className="text-encre-2">Chargement…</p>;
  if (!taches.length) return <PlanningVide chantier={c} />;
  return <PlanningRempli chantier={c} taches={taches} dependances={dependances} />;
}

function PlanningVide({ chantier: c }: { chantier: Chantier }) {
  const [debut, setDebut] = useState(jourIso());
  const etapes = MODELES_TACHES[c.nature];
  return (
    <section className="carte flex flex-col gap-4 p-5 md:p-6">
      <h2 className="text-lg font-semibold">Planning du chantier</h2>
      <p className="text-sm text-encre-2">
        Pars du modèle « {NATURES[c.nature]} » ({etapes.length} étapes, du « {etapes[0].titre.toLowerCase()} » au « {etapes.at(-1)!.titre.toLowerCase()} »), puis ajuste les dates en glissant les barres. Le jalon « Contrôle de précision » passe à 100 % quand le contrôle est validé.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="etiquette">Début des travaux
          <input type="date" className="champ font-normal" value={debut} onChange={(e) => setDebut(e.target.value)} />
        </label>
        <button type="button" className="bouton-principal" disabled={!debut} onClick={() => appliquerModele(c, c.nature, debut, 0)}>
          Appliquer le modèle
        </button>
        <button type="button" className="bouton-secondaire" onClick={() => ajouterTache(c, [], debut)}>
          Partir d&apos;une page blanche
        </button>
      </div>
    </section>
  );
}

async function ajouterTache(c: Chantier, taches: Tache[], debut?: string) {
  const dernier = taches.reduce<string | null>((m, t) => (!m || t.fin > m ? t.fin : m), null);
  const d = debut ?? (dernier ? ajouterJours(dernier, 1) : jourIso());
  await enregistrer("taches", {
    ...nouvelleLigne(c.org_id), chantier_id: c.id, titre: "Nouvelle tâche", debut: d, fin: d, avancement: 0, jalon: false,
    ordre: taches.reduce((m, t) => Math.max(m, t.ordre + 1), 0), cle_modele: "",
  });
}

function PlanningRempli({ chantier: c, taches, dependances }: { chantier: Chantier; taches: Tache[]; dependances: Dependance[] }) {
  const aujourdhui = jourIso();
  const reel = avancementPondere(taches);
  const prevu = avancementPrevu(taches, aujourdhui);
  const retard = retardJours(taches, aujourdhui);
  const finPrevue = taches.reduce((m, t) => (t.fin > m ? t.fin : m), taches[0].fin);
  const conflits = conflitsDependances(taches, dependances);
  const titre = (id: string) => taches.find((t) => t.id === id)?.titre ?? "?";

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Avancement" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Chiffre titre="Avancement réel" valeur={pct(reel)} />
        <Chiffre titre="Prévu à ce jour" valeur={pct(prevu)} classe={reel != null && prevu != null && reel + 0.5 < prevu ? "text-alerte" : ""} />
        <Chiffre titre="Retard" valeur={retard ? `${retard} j` : "Aucun"} classe={retard ? "text-erreur" : "text-ok"} />
        <Chiffre titre="Fin prévue" valeur={dateCourte(finPrevue)} />
      </section>

      {conflits.length > 0 && (
        <Encart ton="alerte" titre="Enchaînement à revoir">
          <ul className="list-disc pl-5">
            {conflits.map((k) => (
              <li key={k.tache_id + k.depend_de}>« {titre(k.tache_id)} » commence {k.jours} jour(s) avant la fin de « {titre(k.depend_de)} ».</li>
            ))}
          </ul>
        </Encart>
      )}

      <Gantt taches={taches} dependances={dependances} aujourdhui={aujourdhui} conflits={new Set(conflits.map((k) => k.tache_id))} />

      <ListeTaches chantier={c} taches={taches} dependances={dependances} />
    </div>
  );
}

function Chiffre({ titre, valeur, classe = "" }: { titre: string; valeur: string; classe?: string }) {
  return (
    <div className="carte p-4">
      <div className="text-[13px] text-encre-2">{titre}</div>
      <div className={`mt-1 text-2xl font-bold ${classe}`}>{valeur}</div>
    </div>
  );
}

type Glisse = { id: string; mode: "deplacer" | "fin"; x0: number; jours: number };

function Gantt({ taches, dependances, aujourdhui, conflits }: { taches: Tache[]; dependances: Dependance[]; aujourdhui: string; conflits: Set<string> }) {
  const [glisse, setGlisse] = useState<Glisse | null>(null);

  let debutVue = ajouterJours(taches.reduce((m, t) => (t.debut < m ? t.debut : m), taches[0].debut), -1);
  let finVue = ajouterJours(taches.reduce((m, t) => (t.fin > m ? t.fin : m), taches[0].fin), 2);
  // La ligne « aujourd'hui » reste visible si le chantier est proche
  if (aujourdhui < debutVue && ecartJours(aujourdhui, debutVue) <= 14) debutVue = ajouterJours(aujourdhui, -1);
  if (aujourdhui > finVue && ecartJours(finVue, aujourdhui) <= 14) finVue = ajouterJours(aujourdhui, 2);
  const nbJours = ecartJours(debutVue, finVue) + 1;
  const largeur = nbJours * J;
  const hauteur = ENTETE + taches.length * H;
  const jours = Array.from({ length: nbJours }, (_, i) => ajouterJours(debutVue, i));

  // Dates affichées pendant un glissement
  const dates = (t: Tache) => {
    if (glisse?.id !== t.id || !glisse.jours) return t;
    if (glisse.mode === "deplacer") return { debut: ajouterJours(t.debut, glisse.jours), fin: ajouterJours(t.fin, glisse.jours) };
    const fin = ajouterJours(t.fin, glisse.jours);
    return { debut: t.debut, fin: fin < t.debut ? t.debut : fin };
  };
  const x = (d: string) => ecartJours(debutVue, d) * J;
  const ligne = new Map(taches.map((t, i) => [t.id, i]));

  function commencer(e: React.PointerEvent, t: Tache, mode: Glisse["mode"]) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setGlisse({ id: t.id, mode, x0: e.clientX, jours: 0 });
  }
  function bouger(e: React.PointerEvent) {
    if (!glisse) return;
    const jours = Math.round((e.clientX - glisse.x0) / J);
    if (jours !== glisse.jours) setGlisse({ ...glisse, jours });
  }
  async function finir() {
    if (!glisse) return;
    const t = taches.find((k) => k.id === glisse.id);
    setGlisse(null);
    if (t && glisse.jours) {
      const n = glisse.jours;
      if (glisse.mode === "deplacer") await enregistrer("taches", { ...t, debut: ajouterJours(t.debut, n), fin: ajouterJours(t.fin, n) });
      else {
        const fin = ajouterJours(t.fin, n);
        await enregistrer("taches", { ...t, fin: fin < t.debut ? t.debut : fin });
      }
    }
  }

  return (
    <section aria-label="Diagramme de Gantt" className="carte flex overflow-hidden">
      <div className="w-28 shrink-0 border-r border-bord sm:w-44 lg:w-64">
        <div style={{ height: ENTETE }} className="flex items-end border-b border-bord px-3 pb-1.5 text-[13px] font-semibold text-encre-2">Tâche</div>
        {taches.map((t) => (
          <div key={t.id} style={{ height: H }} className="flex items-center gap-2 border-b border-bord px-3 text-sm last:border-b-0">
            <span className="truncate" title={t.titre}>{t.titre}</span>
            <span className="ml-auto hidden shrink-0 font-mono text-[12px] text-encre-2 sm:inline">{t.avancement} %</span>
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <svg
          width={largeur}
          height={hauteur}
          role="img"
          aria-label={`Planning du ${dateCourte(debutVue)} au ${dateCourte(finVue)}`}
          onPointerMove={bouger}
          onPointerUp={finir}
          onPointerCancel={() => setGlisse(null)}
          className="block select-none"
        >
          <defs>
            <marker id="fleche" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 8 4 0 8z" fill="var(--encre-2)" />
            </marker>
            <marker id="fleche-conflit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 8 4 0 8z" fill="var(--erreur)" />
            </marker>
          </defs>

          {/* Fin de semaine, jours et mois */}
          {jours.map((d, i) => {
            const jd = new Date(`${d}T00:00:00Z`);
            const we = jd.getUTCDay() === 0 || jd.getUTCDay() === 6;
            const premier = jd.getUTCDate() === 1 || i === 0;
            return (
              <g key={d}>
                {we && <rect x={i * J} y={ENTETE} width={J} height={hauteur - ENTETE} fill="var(--surface-2)" />}
                <line x1={i * J} x2={i * J} y1={ENTETE - 20} y2={hauteur} stroke="var(--bord)" strokeWidth={premier ? 1 : 0.5} />
                <text x={i * J + J / 2} y={ENTETE - 6} textAnchor="middle" fontSize="11" fill="var(--encre-2)">{jd.getUTCDate()}</text>
                {premier && (
                  <text x={i * J + 4} y={16} fontSize="12" fontWeight="600" fill="var(--encre)">{`${MOIS[jd.getUTCMonth()]} ${jd.getUTCFullYear()}`}</text>
                )}
              </g>
            );
          })}
          <line x1={0} x2={largeur} y1={ENTETE} y2={ENTETE} stroke="var(--bord)" />
          {taches.map((t, i) => <line key={t.id} x1={0} x2={largeur} y1={ENTETE + (i + 1) * H} y2={ENTETE + (i + 1) * H} stroke="var(--bord)" strokeWidth={0.5} />)}

          {/* Aujourd'hui */}
          {aujourdhui >= debutVue && aujourdhui <= finVue && (
            <g>
              <line x1={x(aujourdhui) + J / 2} x2={x(aujourdhui) + J / 2} y1={ENTETE} y2={hauteur} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" />
              <rect x={x(aujourdhui) + J / 2 - 3} y={ENTETE - 3} width={6} height={6} fill="var(--accent)" />
            </g>
          )}

          {/* Dépendances : de la fin de la précédente au début de la suivante */}
          {dependances.map((d) => {
            const a = taches.find((t) => t.id === d.depend_de);
            const b = taches.find((t) => t.id === d.tache_id);
            if (!a || !b) return null;
            const da = dates(a);
            const db_ = dates(b);
            const x1 = x(da.fin) + J - 2;
            const y1 = ENTETE + ligne.get(a.id)! * H + H / 2;
            const x2 = x(db_.debut) + 2;
            const y2 = ENTETE + ligne.get(b.id)! * H + H / 2;
            const conflit = conflits.has(b.id);
            return (
              <path
                key={d.id}
                d={`M${x1} ${y1} h6 V${y2} H${Math.max(x2, x1 + 12)}`}
                fill="none"
                stroke={conflit ? "var(--erreur)" : "var(--encre-2)"}
                strokeWidth={1.2}
                markerEnd={`url(#${conflit ? "fleche-conflit" : "fleche"})`}
              />
            );
          })}

          {/* Barres et jalons */}
          {taches.map((t, i) => {
            const d = dates(t);
            const y = ENTETE + i * H;
            const enRetard = t.avancement < 100 && d.fin < aujourdhui;
            const couleur = enRetard ? "var(--erreur)" : "var(--accent)";
            if (t.jalon) {
              const cx = x(d.debut) + J / 2;
              const cy = y + H / 2;
              return (
                <g key={t.id} className="cursor-grab" onPointerDown={(e) => commencer(e, t, "deplacer")}>
                  <title>{`${t.titre} · ${dateCourte(d.debut)} · ${t.avancement} %`}</title>
                  <rect x={cx - 9} y={cy - 9} width={18} height={18} transform={`rotate(45 ${cx} ${cy})`} fill={t.avancement >= 100 ? couleur : "var(--surface)"} stroke={couleur} strokeWidth={2} />
                </g>
              );
            }
            const bx = x(d.debut) + 2;
            const bw = dureeJours(d) * J - 4;
            return (
              <g key={t.id}>
                <title>{`${t.titre} · ${dateCourte(d.debut)} → ${dateCourte(d.fin)} · ${t.avancement} %`}</title>
                <rect x={bx} y={y + 10} width={bw} height={H - 20} rx={4} fill={couleur} opacity={0.22} className="cursor-grab" onPointerDown={(e) => commencer(e, t, "deplacer")} />
                <rect x={bx} y={y + 10} width={(bw * t.avancement) / 100} height={H - 20} rx={4} fill={couleur} pointerEvents="none" />
                <rect x={bx + bw - 8} y={y + 10} width={10} height={H - 20} fill="transparent" className="cursor-ew-resize" onPointerDown={(e) => commencer(e, t, "fin")} />
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function ListeTaches({ chantier: c, taches, dependances }: { chantier: Chantier; taches: Tache[]; dependances: Dependance[] }) {
  const maj = (t: Tache, champs: Partial<Tache>) => {
    const n = { ...t, ...champs };
    if (n.jalon) n.fin = n.debut;
    if (n.fin < n.debut) n.fin = n.debut;
    return enregistrer("taches", n);
  };
  const apres = (t: Tache) => dependances.find((d) => d.tache_id === t.id)?.depend_de ?? "";

  async function supprimer(t: Tache) {
    if (!confirm(`Supprimer la tâche « ${t.titre} » ?`)) return;
    await maj(t, { supprime: true });
    for (const d of dependances.filter((d) => d.tache_id === t.id || d.depend_de === t.id)) await enregistrer("dependances", { ...d, supprime: true });
  }

  return (
    <section aria-labelledby="h-taches" className="carte flex flex-col gap-4 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="h-taches" className="text-lg font-semibold">Tâches</h2>
        <button type="button" className="bouton-secondaire" onClick={() => ajouterTache(c, taches)}>Ajouter une tâche</button>
      </div>
      <p className="text-[13px] text-encre-2">Glisse une barre pour la décaler, son bord droit pour changer sa fin. « Après » lie une tâche à la précédente.</p>
      <ul className="flex flex-col divide-y divide-bord">
        {taches.map((t) => (
          <li key={t.id} className="grid grid-cols-2 gap-3 py-4 xl:grid-cols-[minmax(0,2fr)_9.5rem_9.5rem_7rem_minmax(0,1.3fr)_auto] xl:items-end xl:py-3">
            <label className="etiquette col-span-2 xl:col-span-1">Tâche
              <input className="champ font-normal" value={t.titre} maxLength={200} onChange={(e) => maj(t, { titre: e.target.value || " " })} />
            </label>
            <label className="etiquette">Début
              <input type="date" required className="champ font-normal" value={t.debut} onChange={(e) => e.target.value && maj(t, { debut: e.target.value })} />
            </label>
            <label className="etiquette">Fin
              <input type="date" required className="champ font-normal" value={t.fin} min={t.debut} disabled={t.jalon} onChange={(e) => e.target.value && maj(t, { fin: e.target.value })} />
            </label>
            <Liste
              label="Avancement"
              valeur={t.avancement}
              options={Array.from({ length: 11 }, (_, i) => ({ valeur: i * 10, label: `${i * 10} %` }))}
              onChange={(avancement) => maj(t, { avancement })}
            />
            <Liste
              label="Après"
              valeur={apres(t)}
              options={[{ valeur: "", label: "Aucune" }, ...taches.filter((k) => k.id !== t.id).map((k) => ({ valeur: k.id, label: k.titre }))]}
              onChange={(v) => definirDependance(c.org_id, t.id, v || null, dependances)}
            />
            <div className="col-span-2 flex items-center justify-between gap-3 xl:col-span-1 xl:justify-start">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={t.jalon} onChange={(e) => maj(t, { jalon: e.target.checked })} className="size-4" />
                Jalon
              </label>
              <button type="button" aria-label={`Supprimer ${t.titre}`} className="bouton text-erreur" onClick={() => supprimer(t)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 4h10M6 4V2.5h4V4M4.5 4l.7 9.5h5.6l.7-9.5" /></svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
