"use client";

import { ajouterJours, jourIso } from "@geotopo/metier";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// Sélecteur de date de l'application, à la place du calendrier natif dont l'aspect dépend du système.
// Valeur au format AAAA-MM-JJ. Clavier : flèches (jour, semaine), Page préc. / suiv. (mois),
// Début / Fin (semaine), Entrée pour choisir, Échap pour fermer.

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const JOURS = ["L", "M", "M", "J", "V", "S", "D"];
const JOURS_LONGS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

const parts = (d: string) => d.split("-").map(Number) as [number, number, number];
const versIso = (a: number, m: number, j: number) => `${a}-${String(m + 1).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
// 0 = lundi
const jourSemaine = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
const finDuMois = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();

function decalerMois(d: string, n: number) {
  const [a, m, j] = parts(d);
  const total = a * 12 + (m - 1) + n;
  const na = Math.floor(total / 12);
  const nm = total % 12;
  return versIso(na, nm, Math.min(j, finDuMois(na, nm)));
}

// « ven. 31 oct. 2026 », ou « 31 oct. 2026 » en version courte (champs étroits)
export function texteDate(d: string, court = false) {
  const [a, m, j] = parts(d);
  return `${court ? "" : `${JOURS_LONGS[jourSemaine(d)].slice(0, 3)}. `}${j} ${MOIS_COURTS[m - 1]} ${a}`;
}

export function ChampDate({
  label,
  valeur,
  onChange,
  min,
  optionnel = false,
  disabled,
  placeholder = "Choisir une date",
  className = "",
  court = false,
}: {
  label: string;
  valeur: string | null;
  onChange: (v: string | null) => void;
  min?: string;
  optionnel?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  court?: boolean;
}) {
  const id = useId();
  const aujourdhui = jourIso();
  const [ouvert, setOuvert] = useState(false);
  const [vue, setVue] = useState<"jours" | "mois">("jours");
  const [actif, setActif] = useState(valeur ?? aujourdhui); // jour qui a le focus clavier
  const [anneeMois, setAnneeMois] = useState(parts(valeur ?? aujourdhui)[0]);
  const [position, setPosition] = useState({ haut: false, droite: false });
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);

  const [annee, mois] = parts(actif);
  const premier = versIso(annee, mois - 1, 1);
  const debutGrille = ajouterJours(premier, -jourSemaine(premier));
  const cases = Array.from({ length: 42 }, (_, i) => ajouterJours(debutGrille, i));
  const interdit = (d: string) => !!min && d < min;

  function ouvrir() {
    if (disabled) return;
    const depart = valeur ?? (min && aujourdhui < min ? min : aujourdhui);
    setActif(depart);
    setAnneeMois(parts(depart)[0]);
    setVue("jours");
    setOuvert(true);
  }
  function fermer(rendreFocus = true) {
    setOuvert(false);
    if (rendreFocus) bouton.current?.focus();
  }
  function choisir(d: string) {
    if (interdit(d)) return;
    onChange(d);
    fermer();
  }

  // Ouvre vers le haut et / ou aligné à droite s'il n'y a pas la place
  useLayoutEffect(() => {
    if (!ouvert || !bouton.current || !panneau.current) return;
    const b = bouton.current.getBoundingClientRect();
    const p = panneau.current;
    setPosition({
      haut: b.bottom + p.offsetHeight + 80 > window.innerHeight && b.top > p.offsetHeight + 16,
      droite: b.left + p.offsetWidth > window.innerWidth - 8,
    });
  }, [ouvert]);

  // Le jour actif reçoit le focus, pour que le clavier et les lecteurs d'écran suivent
  useEffect(() => {
    if (ouvert && vue === "jours") panneau.current?.querySelector<HTMLButtonElement>(`[data-jour="${actif}"]`)?.focus({ preventScroll: true });
  }, [actif, ouvert, vue]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [ouvert]);

  function toucheGrille(e: React.KeyboardEvent) {
    const deplacements: Record<string, () => string> = {
      ArrowLeft: () => ajouterJours(actif, -1),
      ArrowRight: () => ajouterJours(actif, 1),
      ArrowUp: () => ajouterJours(actif, -7),
      ArrowDown: () => ajouterJours(actif, 7),
      PageUp: () => decalerMois(actif, e.shiftKey ? -12 : -1),
      PageDown: () => decalerMois(actif, e.shiftKey ? 12 : 1),
      Home: () => ajouterJours(actif, -jourSemaine(actif)),
      End: () => ajouterJours(actif, 6 - jourSemaine(actif)),
    };
    if (deplacements[e.key]) {
      e.preventDefault();
      setActif(deplacements[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choisir(actif);
    }
  }

  return (
    <div
      ref={racine}
      className={`etiquette relative ${className}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && ouvert) {
          e.preventDefault();
          fermer();
        }
      }}
    >
      <span id={`${id}-l`} onClick={() => bouton.current?.focus()}>{label}</span>
      <button
        ref={bouton}
        type="button"
        id={`${id}-b`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-labelledby={`${id}-l ${id}-b`}
        onClick={() => (ouvert ? fermer() : ouvrir())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            ouvrir();
          }
        }}
        className={`champ flex items-center justify-between gap-2 text-left font-normal transition-colors hover:border-encre-2 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${ouvert ? "border-accent" : ""}`}
      >
        <span className={`min-w-0 truncate ${valeur ? "" : "text-encre-2"}`}>{valeur ? texteDate(valeur, court) : placeholder}</span>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-encre-2">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </button>

      {ouvert && (
        <div
          ref={panneau}
          role="dialog"
          aria-modal="false"
          aria-label={`Choisir : ${label}`}
          className={`absolute z-40 w-[19rem] max-w-[calc(100vw-2rem)] rounded-xl border border-bord bg-surface p-3 font-normal shadow-[0_16px_40px_-12px_rgb(0_0_0/0.45)] ${position.haut ? "bottom-full mb-1.5" : "top-full mt-1.5"} ${position.droite ? "right-0" : "left-0"}`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setVue(vue === "jours" ? "mois" : "jours")}
              aria-label={vue === "jours" ? "Choisir le mois et l'année" : "Revenir aux jours"}
              className="flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[15px] font-semibold capitalize hover:bg-surface-2"
            >
              {vue === "jours" ? `${MOIS[mois - 1]} ${annee}` : anneeMois}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`text-encre-2 transition-transform ${vue === "mois" ? "rotate-180" : ""}`}>
                <path d="m4 6 4 4 4-4" />
              </svg>
            </button>
            <div className="flex gap-1">
              <BoutonRond label={vue === "jours" ? "Mois précédent" : "Année précédente"} onClick={() => (vue === "jours" ? setActif(decalerMois(actif, -1)) : setAnneeMois(anneeMois - 1))}>
                <path d="m10 4-4 4 4 4" />
              </BoutonRond>
              <BoutonRond label={vue === "jours" ? "Mois suivant" : "Année suivante"} onClick={() => (vue === "jours" ? setActif(decalerMois(actif, 1)) : setAnneeMois(anneeMois + 1))}>
                <path d="m6 4 4 4-4 4" />
              </BoutonRond>
            </div>
          </div>

          {vue === "jours" ? (
            <div role="grid" aria-label={`${MOIS[mois - 1]} ${annee}`} onKeyDown={toucheGrille}>
              <div role="row" className="grid grid-cols-7 pb-1">
                {JOURS.map((j, i) => (
                  <span key={i} role="columnheader" aria-label={JOURS_LONGS[i]} className="flex h-8 items-center justify-center text-[12px] font-medium text-encre-2">{j}</span>
                ))}
              </div>
              {Array.from({ length: 6 }, (_, s) => (
                <div key={s} role="row" className="grid grid-cols-7">
                  {cases.slice(s * 7, s * 7 + 7).map((d) => {
                    const [, m, j] = parts(d);
                    const horsMois = m !== mois;
                    const choisi = d === valeur;
                    const auj = d === aujourdhui;
                    const bloque = interdit(d);
                    return (
                      <span key={d} role="gridcell" aria-selected={choisi} className="flex items-center justify-center p-0.5">
                        <button
                          type="button"
                          data-jour={d}
                          tabIndex={d === actif ? 0 : -1}
                          disabled={bloque}
                          aria-label={`${texteDate(d)}${auj ? ", aujourd'hui" : ""}`}
                          aria-current={auj ? "date" : undefined}
                          onClick={() => choisir(d)}
                          className={`flex size-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            choisi
                              ? "bg-accent font-semibold text-accent-encre"
                              : auj
                                ? "font-semibold text-accent ring-1 ring-accent ring-inset hover:bg-surface-2"
                                : horsMois
                                  ? "text-encre-2/50 hover:bg-surface-2"
                                  : "text-encre hover:bg-surface-2"
                          } ${bloque ? "cursor-not-allowed opacity-30 hover:bg-transparent" : ""}`}
                        >
                          {j}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {MOIS_COURTS.map((m, i) => {
                const courant = anneeMois === annee && i === mois - 1;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setActif(versIso(anneeMois, i, Math.min(parts(actif)[2], finDuMois(anneeMois, i))));
                      setVue("jours");
                    }}
                    className={`min-h-11 rounded-lg text-sm capitalize ${courant ? "bg-accent font-semibold text-accent-encre" : "hover:bg-surface-2"}`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-bord pt-2">
            {optionnel && valeur ? (
              <button type="button" onClick={() => { onChange(null); fermer(); }} className="min-h-9 rounded-md px-2 text-sm text-encre-2 hover:bg-surface-2 hover:text-encre">
                Effacer
              </button>
            ) : <span />}
            <button
              type="button"
              disabled={interdit(aujourdhui)}
              onClick={() => choisir(aujourdhui)}
              className="min-h-9 rounded-md px-2 text-sm font-medium text-accent hover:bg-surface-2 disabled:opacity-40"
            >
              Aujourd&apos;hui
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BoutonRond({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="flex size-9 items-center justify-center rounded-full text-encre-2 hover:bg-surface-2 hover:text-encre">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
