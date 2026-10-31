import { Suspense } from "react";
import { SaisieTerrain } from "./saisie";

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-encre-2">Chargement…</p>}>
      <SaisieTerrain />
    </Suspense>
  );
}
