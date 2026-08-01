"use client";

import { useMemo, useState } from "react";
import { FilterDropdown } from "@/components/ui";
import type { PlayerSportEvolutionPoint } from "@/lib/playerDashboard";

type Metric = "points" | "position";
type Range = "30d" | "3m" | "6m" | "hist";

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "points", label: "Puntos" },
  { value: "position", label: "Posición" },
];

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "30d", label: "30 días" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "hist", label: "Histórico" },
];

const RANGE_MS: Record<Exclude<Range, "hist">, number> = {
  "30d": 30 * 24 * 60 * 60 * 1000,
  "3m": 90 * 24 * 60 * 60 * 1000,
  "6m": 182 * 24 * 60 * 60 * 1000,
};

// Mismo huso horario que el resto del proyecto interpreta para toda fecha
// visible al usuario (ver CLAUDE.md → varios módulos, y
// src/lib/clubStatisticsRange.ts) — fijo y explícito, nunca el huso por
// defecto del entorno de ejecución. `toLocaleDateString`/`Intl.DateTimeFormat`
// SIN `timeZone` explícito usan el huso del sistema: el servidor (Node) y el
// navegador del visitante casi nunca coinciden, así que un mismo instante
// cerca de un cambio de día podía renderizarse como "27 jul" en el HTML del
// servidor y "28 jul" al hidratar en el cliente — la causa exacta del
// hydration mismatch reportado. Fijar el huso hace que el texto sea una
// función pura del instante, idéntica en cualquier entorno.
const DASHBOARD_TIMEZONE = "America/Bogota";

const COMPACT_DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: DASHBOARD_TIMEZONE,
});

// snapshotAt es siempre un timestamptz real (instante), nunca una fecha
// calendario sin hora — se conserva el instante exacto (new Date(iso), sin
// reconstrucción manual de componentes) y solo se le aplica un huso
// explícito al formatear, nunca al parsear.
function formatCompactDate(iso: string): string {
  return COMPACT_DATE_FORMATTER.format(new Date(iso));
}

// Recorta al rango elegido, conservando el último punto anterior al corte
// (si existe) para que la línea nunca "empiece de la nada" a mitad de
// valor — mismo espíritu que el resto de gráficas del proyecto (nunca
// inventar un punto, solo evitar un salto visual engañoso).
function filterByRange(points: PlayerSportEvolutionPoint[], range: Range, now: Date): PlayerSportEvolutionPoint[] {
  if (range === "hist") return points;
  const cutoff = now.getTime() - RANGE_MS[range];
  const filtered = points.filter((p) => new Date(p.snapshotAt).getTime() >= cutoff);
  if (filtered.length === points.length) return filtered;
  const lastBeforeCutoff = points[points.length - filtered.length - 1];
  return lastBeforeCutoff ? [lastBeforeCutoff, ...filtered] : filtered;
}

// Sección 4 del spec — "Evolución deportiva". Únicamente datos reales
// (evolution ya viene reconstruido desde el ledger real por
// get_my_club_sport_profile, ver esa migración) — sin historial suficiente
// en el rango elegido, se muestra un estado vacío explícito, nunca una
// línea inventada. Espaciado por evento (no proporcional al tiempo real
// entre puntos) — misma simplicidad visual que el resto de gráficas del
// proyecto (p.ej. MonthlyActivityChart), nunca falsea un valor, solo su
// posición horizontal relativa.
export function SportEvolutionSection({ evolution }: { evolution: PlayerSportEvolutionPoint[] }) {
  const [metric, setMetric] = useState<Metric>("points");
  const [range, setRange] = useState<Range>("3m");
  // "Ahora" para recortar el rango se ancla al último punto de `evolution`
  // (el propio now() que get_my_club_sport_profile ya usó al generarlo) en
  // vez de leer un `new Date()` fresco aquí: ese `new Date()` se evaluaría
  // una vez durante el render en el servidor y otra vez, en un instante
  // distinto, al hidratar en el cliente — dos valores distintos que podían
  // incluir/excluir un punto cercano al corte de forma diferente en cada
  // lado (otro hydration mismatch, además del de fecha). Derivarlo de
  // `evolution` lo vuelve una función pura de los datos ya recibidos,
  // idéntica en servidor y cliente.
  const now = useMemo(() => {
    const last = evolution[evolution.length - 1];
    return last ? new Date(last.snapshotAt) : new Date(0);
  }, [evolution]);
  const points = useMemo(() => filterByRange(evolution, range, now), [evolution, range, now]);

  const hasHistory = points.length >= 2;

  const width = 600;
  const height = 160;
  const padX = 12;
  const padY = 16;

  const scaledValues = points.map((p) => (metric === "points" ? p.points : -p.rankingPosition));
  const min = Math.min(...scaledValues, 0);
  const max = Math.max(...scaledValues, 0);
  const range_ = max - min || 1;

  const coords = points.map((p, i) => {
    const x = points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - padX * 2);
    const y = height - padY - ((scaledValues[i] - min) / range_) * (height - padY * 2);
    return { x, y, point: p };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Evolución deportiva</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterDropdown label="Métrica" value={metric} defaultValue="points" options={METRIC_OPTIONS} onChange={setMetric} />
          <FilterDropdown label="Rango" value={range} defaultValue="3m" options={RANGE_OPTIONS} onChange={setRange} />
        </div>
      </div>

      {!hasHistory ? (
        <div className="py-10 text-center">
          <p className="text-sm text-brand-muted">Todavía no hay suficiente historial para mostrar esta evolución.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[420px]" style={{ height }}>
            <polyline
              points={polylinePoints}
              fill="none"
              stroke="var(--club-primary, #00ffff)"
              strokeWidth={2}
            />
            {coords.map((c, i) => {
              // <title> siempre con un único hijo string (una sola expresión
              // de plantilla) — React desaconseja explícitamente un array de
              // varios nodos como children de <title> (advertencia real
              // vista junto con el hydration mismatch original).
              const valueLabel = metric === "points" ? `${c.point.points} pts` : `#${c.point.rankingPosition}`;
              return (
                <circle key={i} cx={c.x} cy={c.y} r={3} fill="var(--club-primary, #00ffff)">
                  <title>{`${formatCompactDate(c.point.snapshotAt)}: ${valueLabel}`}</title>
                </circle>
              );
            })}
          </svg>
          <div className="flex items-center justify-between text-[10px] text-brand-muted/70 mt-1 px-1">
            <span>{formatCompactDate(points[0].snapshotAt)}</span>
            <span>{formatCompactDate(points[points.length - 1].snapshotAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
