"use client";

import Link from "next/link";
import { useState } from "react";
import { CLASSES, formatCm, METHODES, NATURES } from "@geotopo/metier";
import type { Chantier } from "@/lib/db";
import type { ResultatControle } from "@geotopo/metier";
import { STATUTS, type Statut } from "@/lib/statut";
import type { Suivi } from "@/lib/suivi";

export type LigneAccueil = { c: Chantier; r: ResultatControle; statut: Statut; suivi: Suivi };

// ── Accueil d'un chef qui a déjà des chantiers (téléphone, maquette piste A) ──────────────────

// Ce qui demande une action passe d'abord : à valider, puis en retard, en cours, non conforme, conforme
function urgence(l: LigneAccueil) {
  if (l.statut === "a_valider") return 0;
  if (l.suivi.retard > 0) return 1;
  return { en_cours: 2, non_conforme: 3, conforme: 4, a_valider: 0 }[l.statut];
}

export function AccueilMobile({ prenom, equipe, lignes, onVoir }: { prenom: string; equipe: string; lignes: LigneAccueil[]; onVoir: (s: Statut | "tous") => void }) {
  const aValider = lignes.filter((l) => l.statut === "a_valider").length;
  const enRetard = lignes.filter((l) => l.suivi.retard > 0).length;
  const urgents = [...lignes].sort((a, b) => urgence(a) - urgence(b) || b.c.updated_at.localeCompare(a.c.updated_at)).slice(0, 5);

  return (
    <div className="flex flex-col gap-4 md:hidden">
      <div>
        <div className="text-sm text-encre-2">Bonjour,</div>
        <div className="text-2xl font-bold">{prenom || "et bienvenue"}</div>
        {equipe && <div className="text-sm text-encre-2">{equipe}</div>}
      </div>

      {(aValider > 0 || enRetard > 0) && (
        <button type="button" onClick={() => onVoir(aValider ? "a_valider" : "tous")} className="flex items-center gap-3 rounded-2xl bg-alerte-fond p-4 text-left text-alerte">
          <span className="text-3xl font-bold tabular-nums">{aValider || enRetard}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{aValider ? `contrôle${aValider > 1 ? "s" : ""} à valider` : `chantier${enRetard > 1 ? "s" : ""} en retard`}</span>
            {aValider > 0 && enRetard > 0 && <span className="block text-sm">et {enRetard} chantier{enRetard > 1 ? "s" : ""} en retard</span>}
          </span>
          <span aria-hidden="true" className="text-xl">›</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/nouveau-chantier/" className="flex min-h-24 flex-col justify-between gap-3 rounded-2xl bg-accent p-4 font-semibold text-accent-encre">
          <Icone d="M12 5v14M5 12h14" fond="bg-black/10" />
          Nouveau chantier
        </Link>
        <Link href="/terrain/" className="carte flex min-h-24 flex-col justify-between gap-3 rounded-2xl p-4 font-semibold">
          <Icone d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fond="bg-surface-2 text-accent" />
          Saisie terrain
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mes chantiers</h2>
        <button type="button" onClick={() => onVoir("tous")} className="text-sm font-semibold text-accent">
          Tout voir ({lignes.length})
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {urgents.map((l) => (
          <li key={l.c.id}>
            <CarteChantier ligne={l} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Icone({ d, fond }: { d: string; fond: string }) {
  return (
    <span className={`flex size-9 items-center justify-center rounded-xl ${fond}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    </span>
  );
}

// Anneau d'avancement : orange quand le chantier est en retard, coche quand il est conforme
function Anneau({ ligne }: { ligne: LigneAccueil }) {
  const { suivi, statut } = ligne;
  const fini = statut === "conforme" && (suivi.avancement == null || suivi.avancement >= 99.5);
  const v = fini ? 100 : (suivi.avancement ?? 0);
  const couleur = suivi.retard > 0 ? "var(--alerte)" : "var(--accent)";
  return (
    <span
      className="grid size-12 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${couleur} ${v}%, var(--surface-2) 0)` }}
      role="meter"
      aria-label="Avancement"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
    >
      <span className="grid size-[38px] place-items-center rounded-full bg-surface text-[11px] font-bold tabular-nums">
        {fini ? "✓" : suivi.avancement == null ? "—" : `${Math.round(v)}%`}
      </span>
    </span>
  );
}

function CarteChantier({ ligne }: { ligne: LigneAccueil }) {
  const { c, r, statut, suivi } = ligne;
  const precision = c.tolerance_cm ? `${formatCm(c.tolerance_cm)} cm (CDC)` : CLASSES[c.classe].label;
  return (
    <Link href={`/chantier/?id=${c.id}`} className="carte flex items-center gap-3 p-3.5">
      <Anneau ligne={ligne} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{c.nom || "Sans nom"}</span>
        <span className="block truncate text-[13px] text-encre-2">
          {NATURES[c.nature]} · {METHODES[c.methode]} · {r.emq == null ? precision : `EMQ ${formatCm(r.emq)} cm`}
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATUTS[statut].classe}`}>{STATUTS[statut].label}</span>
          {suivi.retard > 0 && <span className="rounded-full bg-erreur-fond px-2.5 py-0.5 text-[12px] font-semibold text-erreur">{suivi.retard} j de retard</span>}
        </span>
      </span>
    </Link>
  );
}

// ── Premier lancement : aucun chantier (maquette, piste B) ──────────────────────────────────

export function PremierLancement({ pret, codeInvitation, nomEquipe, onExemple }: { pret: boolean; codeInvitation: string | null; nomEquipe: string; onExemple: () => Promise<void> }) {
  const [enCours, setEnCours] = useState(false);
  const lien = codeInvitation ? `${window.location.origin}/?invitation=${codeInvitation}` : "";
  const texte = `Rejoins l'équipe « ${nomEquipe} » sur GeoTopo. Ouvre ce lien, crée ton compte avec ton numéro, puis touche « Rejoindre » : ${lien}`;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
      <svg width="132" height="132" viewBox="0 0 120 120" fill="none" stroke="var(--accent)" strokeWidth="2" aria-hidden="true">
        <ellipse cx="60" cy="92" rx="46" ry="12" opacity=".3" />
        <ellipse cx="60" cy="92" rx="30" ry="7" opacity=".6" />
        <path d="M60 90S34 64 34 44a26 26 0 0 1 52 0c0 20-26 46-26 46z" fill="var(--surface)" />
        <circle cx="60" cy="44" r="9" />
        <path d="M38 36c8 4 14-2 22 2s12 10 22 6" opacity=".5" />
      </svg>
      <div>
        <h1 className="text-2xl font-bold">Ton premier chantier</h1>
        <p className="mx-auto mt-2 max-w-sm text-encre-2">
          Saisis les exigences du cahier des charges, lève tes points sur le terrain, et GeoTopo calcule l&apos;EMQ et le verdict.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Link href="/nouveau-chantier/" className="bouton-principal min-h-12 text-base">
          + Créer un chantier
        </Link>
        {codeInvitation && (
          <a href={`https://wa.me/?text=${encodeURIComponent(texte)}`} target="_blank" rel="noopener noreferrer" className="bouton-secondaire min-h-12 text-base">
            Inviter mon équipe sur WhatsApp
          </a>
        )}
        <button
          type="button"
          disabled={!pret || enCours}
          onClick={async () => {
            setEnCours(true);
            await onExemple();
          }}
          className="min-h-11 text-sm font-semibold text-accent underline disabled:opacity-50"
        >
          {enCours ? "Préparation de l'exemple…" : "Voir un chantier d'exemple"}
        </button>
        <p className="text-[12px] text-encre-2">L&apos;exemple est un chantier fictif ajouté à ton équipe, que tu peux supprimer depuis sa fiche.</p>
      </div>
    </div>
  );
}
