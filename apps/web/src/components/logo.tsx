import { useId } from "react";

const TETE = "M512 600 L366 398 A178 178 0 1 1 658 398 Z";

// Symbole GeoTopo (logo créé dans Canva, redessiné en vecteur, comme public/icone.svg) :
// épingle de localisation et courbes de niveau
export function Logo({ taille = 28 }: { taille?: number }) {
  const id = useId();
  return (
    <svg width={taille} height={taille} viewBox="207 105 610 610" aria-hidden="true">
      <clipPath id={`${id}t`}><path d={TETE} /></clipPath>
      <mask id={`${id}m`}>
        <rect width="1024" height="1024" fill="#fff" />
        <circle cx="512" cy="300" r="80" fill="#000" />
      </mask>
      <g fill="none" stroke="#7FD1BC" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round">
        <g clipPath={`url(#${id}t)`} mask={`url(#${id}m)`}>
          <path d="M330 230 C 400 190, 450 170, 500 120" />
          <path d="M560 120 C 520 190, 600 240, 700 230" />
          <path d="M330 330 C 400 330, 410 420, 490 420 C 560 420, 560 480, 520 540" />
          <path d="M700 340 C 620 350, 600 400, 600 470" />
        </g>
        <path d={TETE} />
        <circle cx="512" cy="300" r="68" />
        <path d="M440 612 C 470 598, 556 598, 584 612 C 600 626, 560 636, 512 636 C 464 636, 424 626, 440 612 Z" strokeWidth="18" />
        <path d="M360 600 C 420 572, 610 572, 664 600 C 700 622, 650 670, 512 670 C 380 670, 320 630, 360 600 Z" strokeWidth="18" />
        <path d="M290 590 C 360 548, 650 540, 730 588 C 790 624, 720 712, 512 712 C 320 712, 230 640, 290 590 Z" strokeWidth="18" />
      </g>
    </svg>
  );
}
