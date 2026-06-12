import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateReservation, cancelReservation } from "../actions";
import { ReservationForm } from "../ReservationForm";
import { CancelButton } from "./CancelButton";

interface EditReservationPageProps {
  params: Promise<{ club: string; id: string }>;
}

type ReservationDetail = {
  id: string;
  court_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  type: string;
  title: string | null;
  notes: string | null;
  status: string;
  courts: { name: string } | null;
  reservation_players: Array<{ profile_id: string }>;
};

const TYPE_LABELS: Record<string, string> = {
  match: "Partido",
  class: "Clase",
  block: "Bloqueo",
};

export default async function EditReservationPage({
  params,
}: EditReservationPageProps) {
  const { club: slug, id: reservationId } = await params;

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

  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    redirect(`/${slug}`);
  }

  // Fetch the reservation with its players
  const { data: rawReservation } = await supabase
    .from("reservations")
    .select(
      `
      id, court_id, date, start_time, duration_minutes, type, title, notes, status,
      courts(name),
      reservation_players(profile_id)
    `
    )
    .eq("id", reservationId)
    .eq("club_id", club.id)
    .single();

  if (!rawReservation) notFound();

  const reservation = rawReservation as unknown as ReservationDetail;

  if (reservation.status === "cancelled") {
    redirect(`/${slug}/admin/reservations`);
  }

  const [courtsResult, membersResult] = await Promise.all([
    supabase
      .from("courts")
      .select("id, name")
      .eq("club_id", club.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("club_members")
      .select("profile_id, profiles!inner(full_name)")
      .eq("club_id", club.id)
      .eq("is_active", true),
  ]);

  const courts = (courtsResult.data ?? []) as { id: string; name: string }[];
  const members = (membersResult.data ?? []).map((m) => ({
    profile_id: m.profile_id,
    full_name: (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
  }));

  const today = new Date().toISOString().split("T")[0];
  const updateAction = updateReservation.bind(null, club.id, club.slug, reservationId, false);
  const cancelAction = cancelReservation.bind(null, club.id, club.slug, reservationId);

  const existingPlayers = reservation.reservation_players.map((rp) => rp.profile_id);
  const courtName = reservation.courts?.name ?? "—";

  return (
    <div className="p-6 md:p-10">
      <div className="mb-8">
        <p className="text-sm text-brand-muted mb-1">
          {courtName} · {TYPE_LABELS[reservation.type] ?? reservation.type}
        </p>
        <h1 className="text-2xl font-bold text-white">Editar reserva</h1>
      </div>

      <ReservationForm
        action={updateAction}
        courts={courts}
        members={members}
        defaultDate={today}
        initialValues={{
          court_id: reservation.court_id,
          date: reservation.date,
          start_time: reservation.start_time,
          duration_minutes: reservation.duration_minutes,
          type: reservation.type,
          title: reservation.title ?? undefined,
          notes: reservation.notes ?? undefined,
          player_ids: existingPlayers,
        }}
        submitLabel="Guardar cambios"
        cancelHref={`/${slug}/admin/reservations`}
      />

      <div className="mt-8 pt-8 border-t border-white/10">
        <p className="text-sm text-brand-muted mb-4">Zona de peligro</p>
        <CancelButton action={cancelAction} />
      </div>
    </div>
  );
}
