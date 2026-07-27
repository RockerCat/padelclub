import type { ProfileActivitySummary } from "@/lib/profileActivity";

// Small stat tiles (not full KPI cards — 8 metrics at that visual weight
// would be heavy on mobile). 2 columns on mobile, 4 on desktop — a natural
// grid, never forced/horizontal-scrolling.
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-brand-surface border border-white/10 rounded-xl p-3">
      <p className="text-lg font-bold text-white tabular-nums leading-tight">{value}</p>
      <p className="text-[11px] text-brand-muted mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

export function ProfileSummaryGrid({ summary }: { summary: ProfileActivitySummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatTile label="Reservas totales" value={String(summary.totalReservations)} />
      <StatTile label="Confirmadas" value={String(summary.confirmed)} />
      <StatTile label="Pendientes" value={String(summary.pending)} />
      <StatTile label="Canceladas" value={String(summary.cancelled)} />
      <StatTile label="Rechazadas" value={String(summary.rejected)} />
      <StatTile label="Partidos" value={String(summary.matches)} />
      <StatTile label="Clases" value={String(summary.classes)} />
      {/* Never "horas jugadas"/"asistencia" — a confirmed reservation
          doesn't verify real attendance, only that the slot was reserved. */}
      <StatTile label="Horas confirmadas" value={`${summary.confirmedHours}h`} />
    </div>
  );
}
