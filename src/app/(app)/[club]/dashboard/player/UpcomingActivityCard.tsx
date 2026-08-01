import Link from "next/link";
import { CalendarPlus, Trophy, MapPin, Users as UsersIcon } from "lucide-react";
import { durationLabel } from "@/lib/durations";
import { tournamentCategoryLabel, tournamentStatusLabel } from "@/lib/tournamentLabels";
import type { MyReservation } from "@/lib/playerReservations";
import type { UpcomingBookingDetails, UpcomingTournamentActivity } from "@/lib/playerDashboard";

const RESERVATION_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente de confirmación",
  confirmed: "Confirmada",
};

const RESERVATION_TYPE_LABEL: Record<string, string> = { match: "Partido", class: "Clase" };

function formatCompactDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

interface UpcomingActivityCardProps {
  clubSlug: string;
  booking: (MyReservation & UpcomingBookingDetails) | null;
  tournamentActivity: UpcomingTournamentActivity | null;
}

// Sección 2 del spec — siempre la primera sección funcional. Prioridad
// Reserva/Partido (una sola tarjeta destacada, la más próxima de
// myBookings) por encima de Torneo (solo si no hay ninguna reserva
// próxima). Nunca crea nada — solo enlaza al módulo correspondiente.
export function UpcomingActivityCard({ clubSlug, booking, tournamentActivity }: UpcomingActivityCardProps) {
  if (booking) {
    return (
      <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Próxima actividad</h2>
          <span className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">
            {RESERVATION_TYPE_LABEL[booking.type] ?? "Reserva"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-white">
          <span className="font-semibold capitalize">{formatCompactDate(booking.date)}</span>
          <span>{booking.start_time.slice(0, 5)} · {durationLabel(booking.duration_minutes)}</span>
          <span className="inline-flex items-center gap-1 text-brand-muted">
            <MapPin className="w-3.5 h-3.5" /> {booking.courtName}
          </span>
        </div>

        {booking.companions.length > 0 && (
          <div className="inline-flex items-center gap-1.5 text-xs text-brand-muted">
            <UsersIcon className="w-3.5 h-3.5" /> Con {booking.companions.join(", ")}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-brand-muted">{RESERVATION_STATUS_LABEL[booking.status] ?? booking.status}</span>
          <Link
            href={`/${clubSlug}/reservations`}
            className="inline-flex items-center h-8 px-3 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--club-primary, #00ffff)", color: "#001A24" }}
          >
            Ver reserva
          </Link>
        </div>
      </div>
    );
  }

  if (tournamentActivity) {
    const t = tournamentActivity.tournament;
    return (
      <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Próxima actividad</h2>
          <span className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">Torneo</span>
        </div>

        <p className="text-sm font-semibold text-white">{t.name}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-brand-muted">
          {t.starts_at && (
            <span className="capitalize">{formatCompactDate(t.starts_at.slice(0, 10))}</span>
          )}
          <span>Categoría {tournamentCategoryLabel(t.category, t.secondary_category)}</span>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-brand-muted">
            {tournamentActivity.entryStatus === "pending" ? "Inscripción pendiente" : tournamentStatusLabel(t.status)}
          </span>
          <Link
            href={`/${clubSlug}/tournaments/${t.slug}`}
            className="inline-flex items-center h-8 px-3 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--club-primary, #00ffff)", color: "#001A24" }}
          >
            Ver torneo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-white">Próxima actividad</h2>
      <p className="text-sm text-brand-muted">No tienes actividades próximas.</p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/${clubSlug}/reservations`}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--club-primary, #00ffff)", color: "#001A24" }}
        >
          <CalendarPlus className="w-3.5 h-3.5" /> Reservar cancha
        </Link>
        <Link
          href={`/${clubSlug}/tournaments`}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold border border-white/10 text-white hover:bg-white/5 transition-colors"
        >
          <Trophy className="w-3.5 h-3.5" /> Ver torneos
        </Link>
      </div>
    </div>
  );
}
