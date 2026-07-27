import { durationLabel } from "@/lib/durations";
import type { ProfileActivityReservation } from "@/lib/profileActivity";

const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Local, self-contained status config — deliberately NOT imported from
// PlayerActivity.tsx's ACTIVITY_STATUS or ReservationTicketPanel.tsx's
// TYPE_LABELS: both source files start with "use client", and this
// component renders inside /profile, a plain Server Component tree with
// no client boundary of its own. Importing a plain (non-component) export
// from a "use client" module into server-only code does not resolve to
// the real object at render time — that cross-boundary import is exactly
// what produced "Cannot read properties of undefined (reading 'bg')"
// here, for every status, not a missing key. Same copy/colors as
// PendingReservationReview.tsx's STATUS_LABEL (admin/reservations/[id]/
// PendingReservationReview.tsx:53-58), the closest existing precedent
// using "Confirmada" rather than PlayerActivity's request-approval-specific
// "Aprobada" wording — appropriate here since this list is a general
// reservation history, not a join-request outcome.
const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  confirmed: { label: "Confirmada", dot: "bg-[#00FF00]", text: "text-[#00FF00]", bg: "bg-[#00FF00]/10 border-[#00FF00]/20" },
  pending:   { label: "Pendiente",  dot: "bg-amber-400",  text: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  cancelled: { label: "Cancelada",  dot: "bg-red-400/60", text: "text-brand-muted", bg: "bg-white/[0.03] border-white/5" },
  rejected:  { label: "Rechazada",  dot: "bg-red-400",    text: "text-red-400",   bg: "bg-red-400/10 border-red-400/20" },
};

// Never thrown from, never silently drops the row, never mislabeled as
// "confirmed" — a genuinely unexpected future status still renders, with a
// neutral, honest label.
const FALLBACK_STATUS = { label: "Estado desconocido", dot: "bg-white/30", text: "text-brand-muted", bg: "bg-white/[0.03] border-white/10" };

const TYPE_LABELS: Record<string, string> = { match: "Partido", class: "Clase" };

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${MONTH[d.getMonth()]}`;
}

function endTime(start: string, durationMinutes: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// No edit/cancel/approve/reject action lives here — pure history. Ordered
// by get_my_profile_activity itself (reservations.date/start_time
// descending, never created_at) — this component only renders the order
// it receives.
export function RecentActivityList({ reservations }: { reservations: ProfileActivityReservation[] }) {
  return (
    <div className="flex flex-col divide-y divide-white/[0.06]">
      {reservations.map((r) => {
        // Falls back to a neutral, visible config for any value not in
        // STATUS_CONFIG — never throws, never drops the row, never reads
        // as "confirmed".
        const status = STATUS_CONFIG[r.status] ?? FALLBACK_STATUS;
        const typeLabel = TYPE_LABELS[r.type] ?? r.type;
        return (
          <div key={r.id} className="py-3 first:pt-0 last:pb-0">
            {/* Club name demoted, operational detail (date/court/time/type)
                promoted — same two class strings this component already
                used, just swapped, so the reservation's actual specifics
                are what stands out per row, not which club it belongs to. */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs text-brand-muted truncate min-w-0">{r.clubName}</span>
              <span
                className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${status.bg} ${status.text}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </div>
            <p className="text-sm font-medium text-white truncate">
              {formatDate(r.date)} · {r.courtName} · {r.startTime}–{endTime(r.startTime, r.durationMinutes)} ·{" "}
              {durationLabel(r.durationMinutes)} · {typeLabel}
            </p>
          </div>
        );
      })}
    </div>
  );
}
