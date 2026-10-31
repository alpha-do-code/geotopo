"use client";

// Groupe de boutons à choix unique (classe, méthode, système de coordonnées…)
export function Choix<T extends string | number>({
  legende,
  options,
  valeur,
  onChange,
  aide,
}: {
  legende: string;
  options: { valeur: T; label: string }[];
  valeur: T;
  onChange: (v: T) => void;
  aide?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1.5 text-sm font-medium">{legende}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.valeur)}
            type="button"
            aria-pressed={o.valeur === valeur}
            onClick={() => onChange(o.valeur)}
            className={`min-h-11 rounded-md border px-3.5 text-sm ${o.valeur === valeur ? "border-accent bg-accent text-accent-encre" : "border-bord-fort bg-surface"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {aide && <p className="text-[13px] text-encre-2">{aide}</p>}
    </fieldset>
  );
}

export function Encart({ ton, titre, children }: { ton: "ok" | "alerte" | "erreur" | "info"; titre: string; children?: React.ReactNode }) {
  const classes = { ok: "bg-ok-fond text-ok", alerte: "bg-alerte-fond text-alerte", erreur: "bg-erreur-fond text-erreur", info: "bg-info-fond text-info" };
  return (
    <div className={`flex flex-col gap-1 rounded-md p-3.5 text-sm ${classes[ton]}`}>
      <strong>{titre}</strong>
      {children}
    </div>
  );
}
