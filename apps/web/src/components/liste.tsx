"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export type OptionListe<T> = { valeur: T; label: string; detail?: string };

// Liste déroulante de l'application, à la place du <select> natif dont l'affichage dépend du système.
// Clavier : flèches, Début / Fin, Entrée ou Espace pour choisir, Échap pour fermer, lettre pour sauter.
export function Liste<T extends string | number>({
  label,
  ariaLabel,
  valeur,
  options,
  onChange,
  placeholder = "Choisir…",
  className = "",
  classeLabel = "",
  disabled,
}: {
  label?: string;
  ariaLabel?: string;
  valeur: T;
  options: OptionListe<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  className?: string;
  classeLabel?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const [versLeHaut, setVersLeHaut] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLUListElement>(null);
  const saisie = useRef({ texte: "", minuteur: 0 });

  const choisie = options.find((o) => o.valeur === valeur);
  const indexChoisi = Math.max(0, options.findIndex((o) => o.valeur === valeur));

  function ouvrir() {
    if (disabled || !options.length) return;
    setActif(indexChoisi);
    setOuvert(true);
  }
  function fermer(rendreFocus = true) {
    setOuvert(false);
    if (rendreFocus) bouton.current?.focus();
  }
  function choisir(i: number) {
    const o = options[i];
    if (o) onChange(o.valeur);
    fermer();
  }

  // Ouvre vers le haut s'il n'y a pas la place en dessous (bas d'écran, barre de navigation mobile)
  useLayoutEffect(() => {
    if (!ouvert || !bouton.current || !liste.current) return;
    const b = bouton.current.getBoundingClientRect();
    const h = liste.current.offsetHeight;
    const marge = 80;
    setVersLeHaut(b.bottom + h + marge > window.innerHeight && b.top > h + 16);
    liste.current.focus({ preventScroll: true });
  }, [ouvert]);

  // L'option active reste visible quand on la déplace au clavier
  useEffect(() => {
    if (ouvert) liste.current?.querySelector(`[data-i="${actif}"]`)?.scrollIntoView({ block: "nearest" });
  }, [actif, ouvert]);

  // Un clic ailleurs ferme la liste
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [ouvert]);

  function toucheBouton(e: React.KeyboardEvent) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      ouvrir();
    }
  }

  function toucheListe(e: React.KeyboardEvent) {
    const dernier = options.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActif((i) => Math.min(dernier, i + 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActif((i) => Math.max(0, i - 1));
        return;
      case "Home":
        e.preventDefault();
        setActif(0);
        return;
      case "End":
        e.preventDefault();
        setActif(dernier);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        choisir(actif);
        return;
      case "Escape":
        e.preventDefault();
        fermer();
        return;
      case "Tab":
        fermer(false);
        return;
    }
    // Saut à la première option qui commence par les lettres tapées
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const s = saisie.current;
      window.clearTimeout(s.minuteur);
      s.texte += e.key.toLowerCase();
      s.minuteur = window.setTimeout(() => (s.texte = ""), 600);
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(s.texte));
      if (i >= 0) setActif(i);
    }
  }

  return (
    <div ref={racine} className={`etiquette relative ${className}`}>
      {label && (
        <span id={`${id}-l`} className={classeLabel} onClick={() => bouton.current?.focus()}>
          {label}
        </span>
      )}
      <button
        ref={bouton}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-controls={`${id}-o`}
        aria-labelledby={label ? `${id}-l ${id}-b` : undefined}
        aria-label={label ? undefined : ariaLabel}
        id={`${id}-b`}
        onClick={() => (ouvert ? fermer() : ouvrir())}
        onKeyDown={toucheBouton}
        className={`champ flex items-center justify-between gap-2 text-left font-normal transition-colors hover:border-encre-2 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${ouvert ? "border-accent" : ""}`}
      >
        <span className={`min-w-0 truncate ${choisie ? "" : "text-encre-2"}`}>{choisie?.label ?? placeholder}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`shrink-0 text-encre-2 transition-transform ${ouvert ? "rotate-180" : ""}`}
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>

      {ouvert && (
        <ul
          ref={liste}
          id={`${id}-o`}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={label ? `${id}-l` : undefined}
          aria-label={label ? undefined : ariaLabel}
          aria-activedescendant={`${id}-${actif}`}
          onKeyDown={toucheListe}
          className={`absolute left-0 z-40 max-h-72 w-full min-w-48 overflow-y-auto overscroll-contain rounded-lg border border-bord bg-surface p-1 font-normal shadow-[0_12px_32px_-8px_rgb(0_0_0/0.35)] outline-none ${versLeHaut ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
        >
          {options.map((o, i) => {
            const selectionne = o.valeur === valeur;
            return (
              <li
                key={String(o.valeur)}
                id={`${id}-${i}`}
                data-i={i}
                role="option"
                aria-selected={selectionne}
                onPointerEnter={() => setActif(i)}
                onClick={() => choisir(i)}
                className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[15px] ${i === actif ? "bg-surface-2" : ""} ${selectionne ? "font-medium text-accent" : "text-encre"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block">{o.label}</span>
                  {o.detail && <span className="block text-[13px] font-normal text-encre-2">{o.detail}</span>}
                </span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${selectionne ? "" : "invisible"}`}>
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Options à partir d'un dictionnaire { clé: libellé } des référentiels
export const optionsDe = <K extends string>(o: Record<K, string>): OptionListe<K>[] =>
  (Object.entries(o) as [K, string][]).map(([valeur, label]) => ({ valeur, label }));
