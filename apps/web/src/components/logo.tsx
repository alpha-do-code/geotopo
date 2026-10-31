import { useId } from "react";

// Symbole GeoTopo (logo créé dans Canva, redessiné en vecteur, comme public/icone.svg) :
// triangle de triangulation, réticule de visée, borne
export function Logo({ taille = 28 }: { taille?: number }) {
  const masque = useId();
  return (
    <svg width={taille} height={taille} viewBox="190 98 644 630" aria-hidden="true">
      <mask id={masque}>
        <rect x="0" y="0" width="1024" height="1024" fill="#fff" />
        <rect x="430" y="560" width="165" height="80" fill="#000" />
        <circle cx="512" cy="430" r="30" fill="#000" />
      </mask>
      <g fill="#7FD1BC">
        <g mask={`url(#${masque})`}>
          <path fillRule="evenodd" d="M512 108 L823 630 H201 Z M512 235 L298 575 H727 Z" />
          <rect x="504" y="235" width="16" height="290" />
          <rect x="389" y="421" width="246" height="18" />
          <circle cx="512" cy="430" r="48" />
        </g>
        <circle cx="512" cy="430" r="17" />
        <path d="M468 520 H556 L581 690 H443 Z" />
        <rect x="408" y="688" width="208" height="30" />
      </g>
    </svg>
  );
}
