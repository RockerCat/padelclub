import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createReservation } from "../actions";
import { ReservationForm } from "../ReservationForm";

interface NewReservationPageProps {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ date?: string }>;
}

export default async function NewReservationPage({
  params,
  searchParams,
}: NewReservationPageProps) {
  const { club: slug } = await params;
  const { date: prefilledDate } = await searchParams;

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

  // layout.tsx already guards OWNER/ADMIN, but double-check just in case
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
  const defaultDate = prefilledDate ?? today;
  const action = createReservation.bind(null, club.id, club.slug, false);

  return (
    <div className="p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Nueva reserva</h1>
        <p className="text-sm text-brand-muted mt-1">{club.name}</p>
      </div>

      {courts.length === 0 ? (
        <p className="text-sm text-brand-muted">
          No hay canchas activas. Agrega una cancha primero en{" "}
          <a
            href={`/${slug}/admin/courts`}
            className="text-brand-primary hover:underline"
          >
            Canchas
          </a>
          .
        </p>
      ) : (
        <ReservationForm
          action={action}
          courts={courts}
          members={members}
          defaultDate={defaultDate}
          cancelHref={`/${slug}/admin/reservations`}
        />
      )}
    </div>
  );
}
