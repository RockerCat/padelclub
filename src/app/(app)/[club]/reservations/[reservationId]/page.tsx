import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getReservationShareDetail,
  getPendingReservationJoinRequests,
  resolveReservationSlugToId,
} from "@/lib/reservationJoinRequests";
import { extractReservationId, parseShortReservationSlug, buildReservationSlug } from "@/lib/reservationSlug";
import { resolveClubAccess } from "@/lib/clubAccess";
import { getClubDurations } from "@/lib/durations";
import { ReservationShareView } from "./ReservationShareView";

interface ReservationSharePageProps {
  params: Promise<{ club: string; reservationId: string }>;
}

// URL compartible de una reserva (sección 5 del spec) — reutiliza
// reservations.id como identificador real (ya es un uuid no adivinable,
// sin necesidad de un token nuevo). El segmento de ruta visible es un slug
// corto y legible "nombre-YYYYMMDDHHmm" (ver @/lib/reservationSlug) — nunca
// la fuente de verdad. Tres formas posibles de resolverlo, en orden:
//   1. El segmento trae un uuid real incrustado (un enlace puro, o el
//      formato anterior "nombre-fecha-uuid") → se extrae con una regex,
//      sin ningún round-trip.
//   2. El segmento es el slug corto nuevo, sin uuid → resolveReservationSlugToId
//      (RPC resolve_reservation_slug) lo resuelve por club + fecha/hora +
//      nombre del creador, sin ambigüedad (0 o >1 coincidencias = no
//      resuelve, nunca adivina).
//   3. Ninguno de los dos → notFound().
// En cualquier caso, get_reservation_share_detail sigue siendo la única
// puerta real de autorización/contenido — el slug nunca la reemplaza. Si el
// segmento visitado no coincide con el slug canónico actual (nombre
// desactualizado, o alguien entró con el uuid puro), la página redirige una
// sola vez al slug correcto — el enlace nunca se rompe, solo se
// "auto-corrige" en la barra de direcciones.
//
// Server Component: resuelve club + auth + autorización antes de
// renderizar nada, nunca filtra jugadores/categorías a un visitante no
// autenticado o ajeno al club. Un visitante sin sesión va a
// /auth/login?next=<esta URL>; uno autenticado pero sin membresía activa
// ve un mensaje de acceso restringido en esta misma página, sin redirigir
// (a diferencia de /unauthorized, que sí redirige — el spec pide
// explícitamente que este caso se resuelva inline).
export default async function ReservationSharePage({ params }: ReservationSharePageProps) {
  const { club: slug, reservationId: rawParam } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, slug, allowed_reservation_durations")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (!club) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/${slug}/reservations/${rawParam}`)}`);
  }

  // El slug es puramente cosmético — se resuelve por uuid incrustado
  // (formatos viejos) o, si no hay ninguno, por la RPC de resolución del
  // slug corto nuevo (club + fecha/hora + nombre).
  let reservationId = extractReservationId(rawParam);
  if (!reservationId) {
    const parsed = parseShortReservationSlug(rawParam);
    if (parsed) {
      reservationId = await resolveReservationSlugToId(club.id, parsed.namePart, parsed.date, parsed.startTime);
    }
  }
  if (!reservationId) notFound();

  const result = await getReservationShareDetail(reservationId);

  if (result.status === "not_found") notFound();

  if (result.status === "forbidden") {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Shield className="h-8 w-8 text-red-400" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Acceso restringido</h1>
          <p className="text-brand-muted text-sm mb-8">
            Solo los miembros activos de {club.name} pueden ver el detalle de esta reserva.
          </p>
          <Link
            href={`/${slug}`}
            className="inline-flex items-center justify-center h-12 px-6 text-base font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200 w-full"
          >
            Ir al club
          </Link>
        </div>
      </div>
    );
  }

  const { detail } = result;

  // La reserva debe pertenecer al club de la URL — un miembro de OTRO club
  // que coincidentemente también pertenece al club real de la reserva
  // nunca debe verla renderizada bajo un slug que no es el suyo.
  if (detail.club.slug !== slug) notFound();

  // Canoniza la URL visible — un uuid puro (enlace viejo, notificación) o
  // un slug con el nombre desactualizado terminan siempre en el mismo
  // slug legible y actual. Nunca se repite si ya coincide (evita un
  // redirect en cada visita normal).
  const canonicalSlug = buildReservationSlug({
    creatorName: detail.reservation.creator_name,
    date: detail.reservation.date,
    startTime: detail.reservation.start_time,
    id: detail.reservation.id,
  });
  if (rawParam !== canonicalSlug) {
    redirect(`/${slug}/reservations/${canonicalSlug}`);
  }

  const pendingRequests = detail.can_manage ? await getPendingReservationJoinRequests(reservationId) : [];

  // OWNER/ADMIN real (nunca solo el creador PLAYER, que también es
  // can_manage) — mismo resolveClubAccess que ya usa requireAdminRole en
  // admin/reservations/actions.ts, así que esta bandera coincide exactamente
  // con quién esas Server Actions ya aceptan server-side. courts/members/
  // allowedDurations solo se consultan cuando hacen falta (Editar reutiliza
  // el mismo ReservationForm que el panel administrativo).
  const access = await resolveClubAccess(supabase, club.id);
  const isOwnerOrAdmin = access.authorized && (access.role === "OWNER" || access.role === "ADMIN");

  let courts: Array<{ id: string; name: string }> = [];
  let members: Array<{ profile_id: string; full_name: string | null; avatar_url: string | null }> = [];
  if (isOwnerOrAdmin) {
    const [courtsRes, membersRes] = await Promise.all([
      supabase.from("courts").select("id, name").eq("club_id", club.id).eq("is_active", true).order("sort_order", { ascending: true }),
      supabase
        .from("club_members")
        .select("profile_id, profiles!inner(full_name, avatar_url)")
        .eq("club_id", club.id)
        .eq("role", "PLAYER")
        .eq("is_active", true),
    ]);
    courts = courtsRes.data ?? [];
    members = (membersRes.data ?? []).map((m) => ({
      profile_id: m.profile_id,
      full_name: (m.profiles as { full_name: string | null; avatar_url: string | null } | null)?.full_name ?? null,
      avatar_url: (m.profiles as { full_name: string | null; avatar_url: string | null } | null)?.avatar_url ?? null,
    }));
  }
  const allowedDurations = getClubDurations(
    (club as typeof club & { allowed_reservation_durations?: number[] })?.allowed_reservation_durations
  );

  return (
    <ReservationShareView
      detail={detail}
      pendingRequests={pendingRequests}
      clubSlug={slug}
      clubId={club.id}
      isOwnerOrAdmin={isOwnerOrAdmin}
      courts={courts}
      members={members}
      allowedDurations={allowedDurations}
    />
  );
}
