"use client";

import { useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpCircle, ArrowUpRight, Clock, Crown, Medal, Star, Trophy } from "lucide-react";
import { FilterDropdown } from "@/components/ui";
import { SportEvolutionSection } from "@/app/(app)/[club]/dashboard/player/SportEvolutionSection";
import {
  ALL_CLUBS,
  aggregateSportSummary,
  collectAchievements,
  filterClubs,
  monthlyPlayedHours,
  type ClubFilter,
  type ClubSportSnapshot,
} from "@/lib/playerHome";

// Cada sección guarda su PROPIO filtro de club (estado local independiente):
// cambiar uno nunca altera los demás. Valor inicial: "Todos mis clubes".
// Con un solo club no hay selector — se nombra el club como origen.

function useClubFilter() {
  return useState<ClubFilter>(ALL_CLUBS);
}

function ClubFilterControl({
  clubs,
  value,
  onChange,
}: {
  clubs: ClubSportSnapshot[];
  value: ClubFilter;
  onChange: (v: ClubFilter) => void;
}) {
  if (clubs.length <= 1) {
    return clubs[0] ? <span className="truncate text-xs text-brand-muted">{clubs[0].clubName}</span> : null;
  }
  return (
    <FilterDropdown<string>
      label="Club"
      value={value}
      defaultValue={ALL_CLUBS}
      options={[{ value: ALL_CLUBS, label: "Todos mis clubes" }, ...clubs.map((c) => ({ value: c.clubId, label: c.clubName }))]}
      onChange={onChange}
    />
  );
}

function SectionCard({
  title,
  icon: Icon,
  control,
  children,
  accent,
}: {
  title: string;
  icon?: LucideIcon;
  control?: React.ReactNode;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <section className={`rounded-2xl border bg-brand-surface p-4 sm:p-5 ${accent ? "border-amber-400/20" : "border-white/10"}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
          {Icon && <Icon className={`h-4 w-4 shrink-0 ${accent ? "text-amber-400" : "text-brand-primary"}`} />}
          <span className="truncate">{title}</span>
        </h2>
        <div className="shrink-0">{control}</div>
      </div>
      {children}
    </section>
  );
}

// ─── Resumen deportivo (solo métricas agregables) ────────────────────────

function Stat({ label, value, Icon }: { label: string; value: string; Icon: LucideIcon }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <Icon className="h-4 w-4 text-brand-primary" />
      <p className="text-xl font-bold leading-none text-white tabular-nums">{value}</p>
      <p className="text-[11px] leading-tight text-brand-muted">{label}</p>
    </div>
  );
}

export function SummarySection({ clubs }: { clubs: ClubSportSnapshot[] }) {
  const [filter, setFilter] = useClubFilter();
  const s = aggregateSportSummary(clubs, filter);
  return (
    <SectionCard title="Resumen deportivo" icon={Trophy} control={<ClubFilterControl clubs={clubs} value={filter} onChange={setFilter} />}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Torneos jugados" value={String(s.torneosJugados)} Icon={Trophy} />
        <Stat label="Torneos ganados" value={String(s.torneosGanados)} Icon={Crown} />
        <Stat label="Podios" value={String(s.podios)} Icon={Medal} />
        <Stat label="Horas jugadas" value={String(s.playedHours)} Icon={Clock} />
      </div>
      <p className="mt-3 text-[11px] text-brand-muted">
        Horas: reservas confirmadas ya terminadas en tus clubes. Los partidos abiertos no suman resultados ni horas verificadas.
      </p>
    </SectionCard>
  );
}

// ─── Evolución deportiva ─────────────────────────────────────────────────
// "Todos mis clubes": horas jugadas por mes (sumables entre clubes). Un club:
// su serie real de puntos/posición — los puntos de distintos clubes nunca
// se mezclan en una misma línea.

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function EvolutionSection({ clubs, todayStr }: { clubs: ClubSportSnapshot[]; todayStr: string }) {
  const [filter, setFilter] = useClubFilter();
  const single = filter !== ALL_CLUBS ? clubs.find((c) => c.clubId === filter) : clubs.length === 1 ? clubs[0] : null;

  if (single) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-brand-muted">
            Puntos y posición en el ranking de <span className="text-white">{single.clubName}</span>
          </p>
          {clubs.length > 1 && <ClubFilterControl clubs={clubs} value={filter} onChange={setFilter} />}
        </div>
        <SportEvolutionSection evolution={single.evolution} />
      </div>
    );
  }

  const series = monthlyPlayedHours(clubs, ALL_CLUBS, todayStr, 6);
  const max = Math.max(...series.map((p) => p.hours), 0);
  return (
    <SectionCard title="Evolución deportiva" control={<ClubFilterControl clubs={clubs} value={filter} onChange={setFilter} />}>
      <p className="mb-3 text-xs text-brand-muted">
        Horas jugadas por mes en todos tus clubes. Elige un club para ver tu evolución de puntos en su ranking.
      </p>
      {max === 0 ? (
        <p className="py-8 text-center text-sm text-brand-muted">Todavía no hay horas jugadas registradas en los últimos 6 meses.</p>
      ) : (
        <div className="flex h-36 items-end gap-2" role="img" aria-label="Horas jugadas por mes">
          {series.map((p) => {
            const month = MONTH_SHORT[Number(p.month.slice(5, 7)) - 1];
            return (
              <div key={p.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-white tabular-nums">{p.hours > 0 ? p.hours : ""}</span>
                <div
                  className="w-full max-w-10 rounded-t-md bg-brand-primary/70"
                  style={{ height: `${Math.max((p.hours / max) * 100, p.hours > 0 ? 4 : 0)}%` }}
                  title={`${month}: ${p.hours} h`}
                />
                <span className="text-[10px] text-brand-muted">{month}</span>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Rankings y categorías (siempre desglosados por club) ────────────────

export function RankingsSection({ clubs }: { clubs: ClubSportSnapshot[] }) {
  const [filter, setFilter] = useClubFilter();
  const rows = filterClubs(clubs, filter);
  return (
    <SectionCard title="Rankings y categorías" icon={Star} control={<ClubFilterControl clubs={clubs} value={filter} onChange={setFilter} />}>
      <ul className="flex flex-col divide-y divide-white/5">
        {rows.map((c) => (
          <li key={c.clubId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{c.clubName}</p>
              <p className="text-xs text-brand-muted">{c.category ? `Categoría ${c.category}` : "Sin categoría asignada"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-white tabular-nums">
                {c.rankingPosition !== null ? `#${c.rankingPosition}` : "—"}
                {c.rankingPosition !== null && c.rankingTotal > 0 && (
                  <span className="text-xs font-normal text-brand-muted"> / {c.rankingTotal}</span>
                )}
              </p>
              <p className="flex items-center justify-end gap-1 text-xs text-brand-muted tabular-nums">
                {c.currentPoints} pts
                {c.trend &&
                  (c.trend.direction === "up" ? (
                    <span className="inline-flex items-center text-emerald-400"><ArrowUpRight className="h-3 w-3" />{c.trend.delta}</span>
                  ) : (
                    <span className="inline-flex items-center text-red-400"><ArrowDownRight className="h-3 w-3" />{c.trend.delta}</span>
                  ))}
              </p>
            </div>
            <Link href={`/${c.clubSlug}/ranking`} className="shrink-0 text-xs font-semibold text-brand-primary hover:underline">
              Ver
            </Link>
          </li>
        ))}
      </ul>
      {clubs.length > 1 && (
        <p className="mt-3 text-[11px] text-brand-muted">Cada club tiene su propio ranking: puntos y posiciones no se suman entre clubes.</p>
      )}
    </SectionCard>
  );
}

// ─── Logros (con club de origen) ─────────────────────────────────────────

const ACHIEVEMENT_ICON: Record<string, LucideIcon> = {
  "first-tournament": Trophy,
  "first-podium": Medal,
  "first-championship": Crown,
  "top-3": Star,
  "category-promotion": ArrowUpCircle,
};

export function AchievementsSection({ clubs }: { clubs: ClubSportSnapshot[] }) {
  const [filter, setFilter] = useClubFilter();
  const items = collectAchievements(clubs, filter);
  return (
    <SectionCard title="Logros" icon={Trophy} accent control={<ClubFilterControl clubs={clubs} value={filter} onChange={setFilter} />}>
      {items.length === 0 ? (
        <p className="py-4 text-sm text-brand-muted">
          Aún no hay logros{filter !== ALL_CLUBS || clubs.length === 1 ? " en este club" : ""}. Se ganan jugando torneos y subiendo en el ranking de tus clubes.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((a) => {
            const Icon = ACHIEVEMENT_ICON[a.id] ?? Trophy;
            return (
              <li key={`${a.clubId}:${a.id}`} className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-400">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{a.label}</p>
                  <p className="truncate text-[11px] text-brand-muted">{a.clubName}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
