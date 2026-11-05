import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowLeft, CalendarDays, Clock, MapPin, MessageSquareText, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { Badge } from "@/components/ui";
import { MatchCourtBadge, MatchPhaseBadge, SpotsDots } from "@/components/openMatches/MatchBadges";
import { MatchDetailActions } from "@/components/openMatches/MatchDetailActions";
import { MatchVenueCard } from "@/components/openMatches/MatchVenueCard";
import {
  formatOpenMatchDayLong,
  formatOpenMatchTime,
  formatSpotsLeft,
  getOpenMatch,
  isOpenMatchId,
  openMatchLevelLabel,
  openMatchPlaceName,
} from "@/lib/openMatches";

interface Props {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}

// Una sola lectura por request, compartida entre generateMetadata y la
// página (React cache).
const loadMatch = cache(async (matchId: string) => {
  if (!isOpenMatchId(matchId)) return { match: null, userId: null };
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data },
  ] = await Promise.all([supabase.auth.getUser(), getOpenMatch(supabase, matchId)]);
  return { match: data, userId: user?.id ?? null };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { matchId } = await params;
  const { match } = await loadMatch(matchId);
  if (!match) return { title: "Partido no encontrado | Mi Pádel Club" };
  const place = openMatchPlaceName(match);
  const title = `Partido de pádel en ${place ? `${place}, ` : ""}${match.city} · ${formatOpenMatchDayLong(match.matchDate)}`;
  const description = `${formatOpenMatchTime(match.startTime)} · ${openMatchLevelLabel(match.level)} · ${formatSpotsLeft(match.spotsLeft)}. Únete en Mi Pádel Club.`;
  return { title, description, openGraph: { title, description } };
}

// Enlace compartible: visible sin sesión, nunca expone teléfonos, correos
// ni nombres completos (get_open_match solo devuelve nombre corto).
export default async function OpenMatchDetailPage({ params, searchParams }: Props) {
  const { matchId } = await params;
  const { nuevo } = await searchParams;
  const { match, userId } = await loadMatch(matchId);
  if (!match) notFound();

  const participants = match.participants ?? [];
  const guests = Array.from({ length: match.guestCount });
  const freeSpots = Array.from({ length: Math.max(match.spotsLeft, 0) });
  const active = match.phase === "open" || match.phase === "full";

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="mx-auto max-w-lg px-4 pt-6 pb-20 sm:pt-8">
        <Link href="/partidos" className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Encuentra tu partido
        </Link>

        <article className="mt-4 rounded-2xl border border-white/10 bg-brand-surface p-5">
          <div className="flex flex-wrap gap-2">
            <MatchPhaseBadge phase={match.phase} />
            <MatchCourtBadge status={match.courtStatus} />
            <Badge variant="default" size="sm">{openMatchLevelLabel(match.level)}</Badge>
          </div>

          <h1 className="mt-3 text-2xl font-bold text-white">Partido en {match.city}</h1>

          <dl className="mt-3 flex flex-col gap-1.5 text-sm">
            <div className="flex items-center gap-2 text-white">
              <CalendarDays className="h-4 w-4 text-brand-muted" />
              <dt className="sr-only">Fecha</dt>
              <dd className="first-letter:uppercase">{formatOpenMatchDayLong(match.matchDate)}</dd>
            </div>
            <div className="flex items-center gap-2 text-white">
              <Clock className="h-4 w-4 text-brand-muted" />
              <dt className="sr-only">Hora</dt>
              <dd>
                {formatOpenMatchTime(match.startTime)}
                {match.courtStatus === "pending" && <span className="text-brand-muted"> (tentativa)</span>}
              </dd>
            </div>
            <div className="flex items-center gap-2 text-white">
              <MapPin className="h-4 w-4 text-brand-muted" />
              <dt className="sr-only">Lugar</dt>
              <dd className="min-w-0 truncate">
                {openMatchPlaceName(match) ?? <span className="text-brand-muted">Lugar por definir</span>}
              </dd>
            </div>
          </dl>

          {match.venue && <MatchVenueCard match={match} venue={match.venue} active={active} />}

          {match.courtStatus === "pending" && active && (
            <p className="mt-3 text-xs text-brand-muted">
              La cancha aún no está confirmada: el organizador la reserva directamente con el establecimiento y lo marcará aquí.
            </p>
          )}

          {match.comment && (
            <p className="mt-4 flex gap-2 rounded-xl bg-white/[0.04] p-3 text-sm text-white/90">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted" />
              <span className="whitespace-pre-line break-words">{match.comment}</span>
            </p>
          )}

          <section className="mt-5 border-t border-white/5 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Jugadores</h2>
              <span className="flex items-center gap-2 text-sm text-brand-muted">
                <SpotsDots taken={match.taken} max={match.maxPlayers} />
                {match.taken}/{match.maxPlayers}
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {participants.map((p, i) => (
                <li key={`p-${i}`} className="flex items-center gap-3">
                  <PlayerAvatar player={{ full_name: p.displayName, avatar_url: p.avatarUrl }} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">
                    {p.displayName}
                    {p.isViewer && <span className="text-brand-muted"> (tú)</span>}
                  </span>
                  {p.isOrganizer && <Badge variant="secondary" size="sm">Organiza</Badge>}
                  {!p.isOrganizer && p.needsReconfirm && active && (
                    <Badge variant="warning" size="sm">Por confirmar horario</Badge>
                  )}
                </li>
              ))}
              {guests.map((_, i) => (
                <li key={`g-${i}`} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                    <UserRound className="h-4 w-4 text-brand-muted" />
                  </span>
                  <span className="text-sm text-white/80">Acompañante de {match.organizerName}</span>
                </li>
              ))}
              {active &&
                freeSpots.map((_, i) => (
                  <li key={`f-${i}`} className="flex items-center gap-3">
                    <span className="h-8 w-8 rounded-full border border-dashed border-white/25" />
                    <span className="text-sm text-brand-muted">Cupo libre</span>
                  </li>
                ))}
            </ul>
          </section>

          {match.phase === "cancelled" && (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              El organizador canceló este partido.
            </p>
          )}
          {match.phase === "finished" && (
            <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-brand-muted">
              Este partido ya se jugó.{" "}
              <Link href="/partidos" className="text-brand-primary hover:underline">Busca otro</Link>.
            </p>
          )}
        </article>

        <div className="mt-4">
          <MatchDetailActions match={match} isAuthenticated={!!userId} justCreated={nuevo === "1"} />
        </div>

        <p className="mt-6 text-center text-xs text-brand-muted">
          Mi Pádel Club no reserva la cancha: coordina el lugar directamente con el establecimiento.
        </p>
      </div>
    </div>
  );
}
