"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { useSession } from "./session";

const LIENS = [
  { href: "/", label: "Chantiers", icone: "M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" },
  { href: "/terrain/", label: "Terrain", icone: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" },
  { href: "/referentiels/", label: "Référentiels", icone: "M4 5h7v14H4zM13 5h7v14h-7zM6 9h3M15 9h3M6 13h3M15 13h3" },
  { href: "/compte/", label: "Compte", icone: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

function Icone({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// compact : pastille seule (rail de navigation sur tablette), le texte passe en info-bulle
export function EtatSync({ compact = false }: { compact?: boolean }) {
  const { user, org, enLigne, enAttente, sync, synchroniserMaintenant } = useSession();
  let texte: string;
  let ton: string;
  if (!user || !org) {
    texte = enAttente ? `Local · ${enAttente} à envoyer` : "Données sur cet appareil";
    ton = "bg-info-fond text-info";
  } else if (!enLigne) {
    texte = enAttente ? `Hors ligne · ${enAttente} en attente` : "Hors ligne";
    ton = "bg-alerte-fond text-alerte";
  } else if (sync.erreur) {
    texte = "Erreur de synchronisation";
    ton = "bg-erreur-fond text-erreur";
  } else if (sync.enCours) {
    texte = "Synchronisation…";
    ton = "bg-info-fond text-info";
  } else {
    texte = enAttente ? `${enAttente} à envoyer` : "À jour";
    ton = "bg-ok-fond text-ok";
  }
  const detail = sync.erreur ?? (sync.derniere ? `Dernière synchronisation : ${new Date(sync.derniere).toLocaleTimeString("fr-FR")}` : undefined);
  return (
    <button
      type="button"
      onClick={synchroniserMaintenant}
      title={compact ? [texte, detail].filter(Boolean).join(" · ") : detail}
      aria-label={compact ? texte : undefined}
      className={`inline-flex min-h-8 items-center gap-2 rounded-full text-xs font-semibold ${compact ? "size-9 justify-center" : "px-3"} ${ton}`}
    >
      <span className="size-2 rounded-full bg-current" aria-hidden="true" />
      {!compact && texte}
    </button>
  );
}

export function Coquille({ children }: { children: React.ReactNode }) {
  const chemin = usePathname();
  const { org } = useSession();
  const actif = (href: string) => (href === "/" ? chemin === "/" || chemin.startsWith("/chantier") : chemin.startsWith(href));

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Tablette : rail d'icônes ; grand écran : navigation complète */}
      <nav aria-label="Navigation principale" className="pas-impression sticky top-0 hidden h-dvh w-20 shrink-0 flex-col items-center gap-1 bg-nav px-2 py-4 md:flex lg:w-60 lg:items-stretch lg:p-4">
        <Link href="/" aria-label="GeoTopo, accueil" className="mb-6 flex items-center gap-2.5 text-lg font-bold text-white lg:px-2">
          <Logo taille={32} />
          <span className="hidden lg:inline">GeoTopo</span>
        </Link>
        {LIENS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={actif(l.href) ? "page" : undefined}
            title={l.label}
            className={`flex min-h-11 w-full items-center justify-center gap-3 rounded-md lg:justify-start lg:px-3 ${actif(l.href) ? "bg-nav-actif font-medium text-white" : "text-nav-encre hover:text-white"}`}
          >
            <Icone d={l.icone} />
            <span className="sr-only lg:not-sr-only">{l.label}</span>
          </Link>
        ))}
        <div className="mt-auto w-full border-t border-white/10 pt-3 text-sm text-nav-encre lg:px-3">
          <div className="hidden truncate font-semibold text-white lg:block">{org?.nom ?? "Mode local"}</div>
          <div className="flex justify-center lg:mt-2 lg:block">
            <span className="lg:hidden"><EtatSync compact /></span>
            <span className="hidden lg:inline"><EtatSync /></span>
          </div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="pas-impression flex items-center justify-between gap-3 bg-nav px-4 py-3 md:hidden">
          <Link href="/" className="flex items-center gap-2 font-bold text-white"><Logo taille={26} />GeoTopo</Link>
          <EtatSync />
        </header>
        {children}
      </div>

      <nav aria-label="Navigation principale" className="pas-impression fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-bord bg-surface md:hidden">
        {LIENS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={actif(l.href) ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${actif(l.href) ? "font-semibold text-accent" : "text-encre-2"}`}
          >
            <Icone d={l.icone} />
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
