import Link from "next/link";

// Sur téléphone, RACI et Indicateurs partagent l'entrée « Suivi » de la barre du bas : on passe de l'un à l'autre ici
export function BasculeSuivi({ actif }: { actif: "raci" | "indicateurs" }) {
  const lien = (cle: "raci" | "indicateurs", href: string, label: string) => (
    <Link
      href={href}
      aria-current={actif === cle ? "page" : undefined}
      className={`flex min-h-10 flex-1 items-center justify-center rounded-md text-sm font-medium ${actif === cle ? "bg-surface text-encre shadow-sm" : "text-encre-2"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Suivi" className="flex gap-1 rounded-lg border border-bord bg-surface-2 p-1 md:hidden">
      {lien("raci", "/raci/", "Qui fait quoi")}
      {lien("indicateurs", "/indicateurs/", "Indicateurs")}
    </nav>
  );
}
