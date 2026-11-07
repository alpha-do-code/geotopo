"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// Installation de la PWA. Chrome et Edge (Android, ordinateur) proposent une invitation que l'on
// garde pour l'ouvrir au clic ; Safari sur iPhone n'en a pas : on explique « Partager »,
// puis « Sur l'écran d'accueil ».

type Invitation = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Plateforme = "installee" | "invitation" | "ios" | "ios-autre-navigateur" | "autre";

type Etat = { plateforme: Plateforme; installer: () => Promise<void> };
const Ctx = createContext<Etat>({ plateforme: "autre", installer: async () => {} });

function detecter(invitation: Invitation | null): Plateforme {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installee";
  if (invitation) return "invitation";
  const ua = navigator.userAgent;
  // Les iPad récents se présentent comme un Mac, mais ont un écran tactile
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-autre-navigateur" : "ios";
  return "autre";
}

export function InstallationProvider({ children }: { children: ReactNode }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [plateforme, setPlateforme] = useState<Plateforme>("autre");

  useEffect(() => {
    // Mise à jour après le montage : la détection lit le navigateur, absent au rendu statique
    const maj = (i: Invitation | null) => setPlateforme(detecter(i));
    maj(null);
    const surInvitation = (e: Event) => {
      e.preventDefault();
      setInvitation(e as Invitation);
      maj(e as Invitation);
    };
    const surInstallee = () => {
      setInvitation(null);
      setPlateforme("installee");
    };
    window.addEventListener("beforeinstallprompt", surInvitation);
    window.addEventListener("appinstalled", surInstallee);
    return () => {
      window.removeEventListener("beforeinstallprompt", surInvitation);
      window.removeEventListener("appinstalled", surInstallee);
    };
  }, []);

  const installer = useCallback(async () => {
    if (!invitation) return;
    await invitation.prompt();
    const { outcome } = await invitation.userChoice;
    // Une invitation ne sert qu'une fois
    setInvitation(null);
    setPlateforme(outcome === "accepted" ? "installee" : detecter(null));
  }, [invitation]);

  return <Ctx.Provider value={{ plateforme, installer }}>{children}</Ctx.Provider>;
}

export const useInstallation = () => useContext(Ctx);

function Etape({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-encre">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

// Les étapes adaptées à l'appareil du visiteur
export function GuideInstallation() {
  const { plateforme, installer } = useInstallation();

  if (plateforme === "installee")
    return <p className="rounded-lg bg-ok-fond p-4 text-ok">GeoTopo est installée sur cet appareil. Tu peux l&apos;ouvrir depuis son icône, même sans réseau.</p>;

  if (plateforme === "invitation")
    return (
      <div className="flex flex-col items-start gap-3">
        <button type="button" onClick={installer} className="bouton-principal">
          Installer GeoTopo
        </button>
        <p className="text-sm text-encre-2">L&apos;icône apparaît sur ton écran d&apos;accueil ou dans tes applications.</p>
      </div>
    );

  if (plateforme === "ios-autre-navigateur")
    return (
      <p className="rounded-lg bg-alerte-fond p-4 text-alerte">
        Sur iPhone et iPad, l&apos;installation se fait depuis <strong>Safari</strong>. Copie l&apos;adresse de cette page et ouvre-la dans Safari.
      </p>
    );

  if (plateforme === "ios")
    return (
      <ol className="flex flex-col gap-3">
        <Etape n={1}>
          Touche le bouton <strong>Partager</strong> (le carré avec une flèche vers le haut), en bas de Safari.
        </Etape>
        <Etape n={2}>
          Fais défiler et choisis <strong>Sur l&apos;écran d&apos;accueil</strong>.
        </Etape>
        <Etape n={3}>
          Touche <strong>Ajouter</strong>. L&apos;icône GeoTopo apparaît avec tes autres applications.
        </Etape>
      </ol>
    );

  return (
    <ol className="flex flex-col gap-3">
      <Etape n={1}>
        Sur <strong>Android</strong>, ouvre cette page dans <strong>Chrome</strong>, touche le menu <strong>⋮</strong> puis <strong>Installer l&apos;application</strong> (ou « Ajouter à l&apos;écran d&apos;accueil »).
      </Etape>
      <Etape n={2}>
        Sur <strong>ordinateur</strong>, dans Chrome ou Edge, clique sur l&apos;icône d&apos;installation à droite de la barre d&apos;adresse.
      </Etape>
      <Etape n={3}>
        Sur <strong>iPhone</strong>, ouvre la page dans Safari, puis Partager et <strong>Sur l&apos;écran d&apos;accueil</strong>.
      </Etape>
    </ol>
  );
}

const CLE_BANDEAU = "geotopo-bandeau-installation";

// Bandeau discret sur l'accueil, tant que l'application n'est pas installée
export function BandeauInstallation() {
  const { plateforme, installer } = useInstallation();
  const [masque, setMasque] = useState(true);

  useEffect(() => {
    let ferme = false;
    try {
      ferme = localStorage.getItem(CLE_BANDEAU) === "ferme";
    } catch {}
    // Lecture du stockage local après le montage, absent au rendu statique
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMasque(ferme);
  }, []);

  if (masque || plateforme === "installee") return null;
  const fermer = () => {
    setMasque(true);
    try {
      localStorage.setItem(CLE_BANDEAU, "ferme");
    } catch {}
  };

  return (
    <div className="pas-impression flex flex-wrap items-center gap-3 rounded-lg border border-bord bg-surface p-3 text-sm">
      <span className="min-w-0 basis-full sm:flex-1 sm:basis-0">
        <strong>Installe GeoTopo</strong> sur ton téléphone ou ton ordinateur : elle s&apos;ouvre comme une application, même sans réseau sur le terrain.
      </span>
      {plateforme === "invitation" ? (
        <button type="button" onClick={installer} className="bouton-principal">
          Installer
        </button>
      ) : (
        <Link href="/installer/" className="bouton-secondaire">
          Comment faire
        </Link>
      )}
      <button type="button" onClick={fermer} aria-label="Masquer ce bandeau" className="ml-auto flex size-9 sm:ml-0 items-center justify-center rounded-full text-encre-2 hover:bg-surface-2">
        ✕
      </button>
    </div>
  );
}
