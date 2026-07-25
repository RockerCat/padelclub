"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { FilterDropdown, Badge } from "@/components/ui";
import type { FilterDropdownOption } from "@/components/ui";
import { durationLabel } from "@/lib/durations";

export type RejectedReservation = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  courtName: string;
  playerName: string | null;
  // Frozen at request time — shown as-is, never recalculated. Same value
  // OWNER/ADMIN and the PLAYER both see.
  price_amount: number | null;
  price_currency: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  rejectedByName: string | null;
};

const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function formatRejectedAt(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function calcEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type PeriodFilter = "30" | "90" | "all";

const PERIOD_OPTIONS: FilterDropdownOption<PeriodFilter>[] = [
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "all", label: "Todo" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// A row with no rejected_at (shouldn't happen post-migration, but is
// nullable) is never hidden by a period filter — same "don't hide, always
// show" default as the reason/date display below.
function isWithinPeriod(rejectedAt: string | null, period: PeriodFilter): boolean {
  if (period === "all" || !rejectedAt) return true;
  const cutoff = Date.now() - Number(period) * DAY_MS;
  return new Date(rejectedAt).getTime() >= cutoff;
}

// Historial operativo de solicitudes rechazadas — vive dentro del mismo
// módulo de Reservas (no una pantalla nueva), colapsado por defecto para no
// competir con "Solicitudes pendientes" ni con el calendario semanal.
// Reutiliza FilterDropdown/Badge (ya usados en Jugadores) y enlaza al mismo
// detalle ([id]/page.tsx) que ya muestra motivo completo, quién rechazó y
// cuándo.
export function RejectedReservationsSection({
  reservations,
  clubSlug,
}: {
  reservations: RejectedReservation[];
  clubSlug: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [period, setPeriod] = useState<PeriodFilter>("30");

  if (reservations.length === 0) return null;

  const filtered = reservations.filter((r) => isWithinPeriod(r.rejected_at, period));

  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-2 mb-3 w-full text-left"
      >
        <XCircle className="w-4 h-4 text-red-400" />
        <h2 className="text-base font-semibold text-white">Reservas rechazadas</h2>
        <span className="px-2 py-0.5 rounded-full bg-red-400/15 text-red-400 text-xs font-medium">
          {reservations.length}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-brand-muted ml-auto" />
        ) : (
          <ChevronDown className="w-4 h-4 text-brand-muted ml-auto" />
        )}
      </button>

      {expanded && (
        <>
          <div className="mb-3">
            <FilterDropdown
              label="Periodo"
              value={period}
              defaultValue="30"
              options={PERIOD_OPTIONS}
              onChange={setPeriod}
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-brand-muted py-4">No hay reservas rechazadas en este periodo.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((r) => (
                <Link
                  key={r.id}
                  href={`/${clubSlug}/admin/reservations/${r.id}`}
                  className="block bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="danger" size="sm">
                          Rechazada
                        </Badge>
                        <p className="text-white font-medium truncate">{r.playerName ?? "Jugador"}</p>
                      </div>
                      <p className="text-sm text-brand-muted">
                        {formatDate(r.date)} · {r.courtName} · {r.start_time.slice(0, 5)}–
                        {calcEndTime(r.start_time, r.duration_minutes)} · {durationLabel(r.duration_minutes)}
                      </p>
                      {r.rejection_reason && (
                        <p className="text-sm text-red-400/90 mt-1">{r.rejection_reason}</p>
                      )}
                      {r.rejected_at && (
                        <p className="text-xs text-brand-muted/60 mt-1">
                          Rechazada el {formatRejectedAt(r.rejected_at)}
                          {r.rejectedByName ? ` por ${r.rejectedByName}` : ""}
                        </p>
                      )}
                    </div>
                    {r.price_amount != null && r.price_currency && (
                      <p className="text-sm text-white font-medium shrink-0">
                        {formatCurrency(r.price_amount, r.price_currency)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
