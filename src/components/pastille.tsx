import { STATUTS, type Statut } from "@/lib/statut";

export function Pastille({ statut }: { statut: Statut }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold ${STATUTS[statut].classe}`}>{STATUTS[statut].label}</span>;
}
