import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateReservation, cancelReservation, getAvailableSlots } from "../actions";
import { ReservationForm } from "../ReservationForm";
import { CancelButton } from "./CancelButton";
import { PendingReservationReview } from "./PendingReservationReview";
import { getClubDurations } from "@/lib/durations";
import { buildDayGrid } from "@/lib/courtAvailability";

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
  created_at: string;
  created_by: string;
  price_amount: number | null;
  price_currency: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  courts: { name: string; surface: string | null; is_indoor: boolean | null } | null;
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
    .select("id, name, slug, allowed_reservation_durations")
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
      id, court_id, date, start_time, duration_minutes, type, title, notes, status, created_at, created_by,
      price_amount, price_currency,
      rejection_reason, rejected_at, rejected_by,
      courts(name, surface, is_indoor),
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

  // A pending request gets the dedicated review screen (court card +
  // availability timeline + approve/reject) instead of the generic edit
  // form below — this is the "official" screen a reservation-request
  // notification links to (see notify_reservation_request_created). A
  // rejected request reuses the same read-only detail (no action footer,
  // reservation.status !== "pending") so the reason/traceability stays
  // visible to OWNER/ADMIN after the fact — the notification's destination
  // never changes once resolved.
  if (reservation.status === "pending" || reservation.status === "rejected") {
    const [{ data: playerProfile }, { data: rejectedByProfile }, availableSlots] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", reservation.created_by).maybeSingle(),
      reservation.rejected_by
        ? supabase.from("profiles").select("full_name").eq("id", reservation.rejected_by).maybeSingle()
        : Promise.resolve({ data: null }),
      getAvailableSlots(club.id, reservation.court_id, reservation.date, reservation.duration_minutes, reservationId),
    ]);

    const grid = buildDayGrid(availableSlots.openMins, availableSlots.closeMins, reservation.duration_minutes);

    return (
      <PendingReservationReview
        clubId={club.id}
        clubSlug={slug}
        reservation={{
          id: reservation.id,
          date: reservation.date,
          start_time: reservation.start_time,
          duration_minutes: reservation.duration_minutes,
          status: reservation.status,
          created_at: reservation.created_at,
          playerName: playerProfile?.full_name ?? null,
          price_amount: reservation.price_amount,
          price_currency: reservation.price_currency,
          rejection_reason: reservation.rejection_reason,
          rejected_at: reservation.rejected_at,
          rejectedByName: rejectedByProfile?.full_name ?? null,
        }}
        court={{
          id: reservation.court_id,
          name: reservation.courts?.name ?? "—",
          surface: reservation.courts?.surface ?? null,
          is_indoor: reservation.courts?.is_indoor ?? null,
        }}
        grid={grid}
        slots={availableSlots.slots}
      />
    );
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
      .eq("role", "PLAYER")
      .eq("is_active", true),
  ]);

  const courts = (courtsResult.data ?? []) as { id: string; name: string }[];
  const members = (membersResult.data ?? [])
    .map((m) => ({
      profile_id: m.profile_id,
      full_name: (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
    }))
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "es"));

  const allowedDurations = getClubDurations(
    (club as typeof club & { allowed_reservation_durations?: number[] })?.allowed_reservation_durations
  );

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
        clubId={club.id}
        clubSlug={slug}
        allowedDurations={allowedDurations}
        editingReservationId={reservationId}
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
