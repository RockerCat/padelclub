import { notFound, redirect } from "next/navigation";
import { CalendarDays, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

interface PlayerReservationsPageProps {
  params: Promise<{ club: string }>;
}

type ReservationRow = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  type: "match" | "class" | "block";
  title: string | null;
  courts: { name: string } | null;
  reservation_players: Array<{
    profiles: { full_name: string | null } | null;
  }>;
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(t: string) {
  return t.slice(0, 5);
}

function endTime(startTime: string, durationMinutes: number) {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const TYPE_LABELS: Record<string, string> = {
  match: "Partido",
  class: "Clase",
  block: "Bloqueo",
};

const TYPE_COLORS: Record<string, string> = {
  match: "text-brand-primary bg-brand-primary/10 border-brand-primary/20",
  class: "text-brand-secondary bg-brand-secondary/10 border-brand-secondary/20",
  block: "text-brand-muted bg-white/5 border-white/10",
};

export default async function PlayerReservationsPage({
  params,
}: PlayerReservationsPageProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!club) notFound();

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) redirect("/unauthorized");

  const today = new Date().toISOString().split("T")[0];

  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      `
      id, date, start_time, duration_minutes, type, title,
      courts(name),
      reservation_players(profiles(full_name))
    `
    )
    .eq("club_id", club.id)
    .gte("date", today)
    .eq("status", "confirmed")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  const rows = (reservations ?? []) as unknown as ReservationRow[];

  // Group reservations by date
  const grouped = rows.reduce<Record<string, ReservationRow[]>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {});

  const dates = Object.keys(grouped).sort();

  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Reservaciones</h1>
        <p className="text-sm text-brand-muted mt-1">{club.name}</p>
      </div>

      {dates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: "color-mix(in srgb, var(--club-primary) 12%, transparent)",
              color: "var(--club-primary)",
            }}
          >
            <CalendarDays className="w-7 h-7" />
          </div>
          <div>
            <p className="text-white font-semibold mb-1">Sin reservas próximas</p>
            <p className="text-sm text-brand-muted">
              Cuando haya reservas confirmadas aparecerán aquí.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {dates.map((date) => (
            <div key={date}>
              <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3 capitalize">
                {formatDate(date)}
              </p>
              <div className="flex flex-col gap-2">
                {grouped[date].map((r) => {
                  const players = r.reservation_players
                    .map((rp) => rp.profiles?.full_name)
                    .filter(Boolean) as string[];

                  return (
                    <div
                      key={r.id}
                      className="bg-brand-surface border border-white/10 rounded-2xl p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span
                              className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${TYPE_COLORS[r.type]}`}
                            >
                              {TYPE_LABELS[r.type]}
                            </span>
                            <span className="text-sm font-semibold text-white">
                              {r.courts?.name ?? "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-brand-muted">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {formatTime(r.start_time)} –{" "}
                              {endTime(r.start_time, r.duration_minutes)}
                            </span>
                          </div>
                          {r.title && (
                            <p className="text-xs text-brand-muted mt-1 truncate">
                              {r.title}
                            </p>
                          )}
                          {players.length > 0 && (
                            <p className="text-xs text-brand-muted mt-1 truncate">
                              {players.join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
