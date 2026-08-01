import type { LucideIcon } from "lucide-react";
import { Star, Hash, Layers, Trophy, Medal, Crown, Clock } from "lucide-react";

interface StatTileProps {
  label: string;
  value: string;
  Icon: LucideIcon;
}

function StatTile({ label, value, Icon }: StatTileProps) {
  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: "color-mix(in srgb, var(--club-primary) 15%, transparent)", color: "var(--club-primary)" }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xl font-bold text-white tabular-nums leading-none">{value}</p>
      <p className="text-[11px] text-brand-muted leading-tight">{label}</p>
    </div>
  );
}

interface SportSummaryGridProps {
  currentPoints: number;
  rankingPosition: number | null;
  rankingTotal: number;
  category: string | null;
  torneosJugados: number;
  torneosGanados: number;
  podios: number;
  playedHours: number;
}

// Sección 3 del spec — "Resumen deportivo". Únicamente métricas personales,
// todas ya resueltas en playerDashboard.ts (RPC de perfil deportivo + mis
// torneos + reservas del club) — este componente solo las presenta.
export function SportSummaryGrid({
  currentPoints,
  rankingPosition,
  rankingTotal,
  category,
  torneosJugados,
  torneosGanados,
  podios,
  playedHours,
}: SportSummaryGridProps) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">Resumen deportivo</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Puntos actuales" value={String(currentPoints)} Icon={Star} />
        <StatTile
          label="Posición actual"
          value={rankingPosition !== null ? `#${rankingPosition}${rankingTotal ? ` / ${rankingTotal}` : ""}` : "—"}
          Icon={Hash}
        />
        <StatTile label="Categoría" value={category ?? "—"} Icon={Layers} />
        <StatTile label="Torneos jugados" value={String(torneosJugados)} Icon={Trophy} />
        <StatTile label="Torneos ganados" value={String(torneosGanados)} Icon={Crown} />
        <StatTile label="Podios" value={String(podios)} Icon={Medal} />
        <StatTile label="Horas jugadas" value={String(playedHours)} Icon={Clock} />
      </div>
    </div>
  );
}
