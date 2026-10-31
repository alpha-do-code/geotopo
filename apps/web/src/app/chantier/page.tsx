import { Suspense } from "react";
import { FicheChantier } from "./fiche";

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-encre-2">Chargement…</p>}>
      <FicheChantier />
    </Suspense>
  );
}
