import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  ChevronRight,
  Compass,
  MapPin,
  Plus,
  Search,
} from "lucide-react";
import { formatOpenMatchDay, formatOpenMatchTime } from "@/lib/openMatches";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { Badge } from "@/components/ui";
import { MatchCard } from "@/components/openMatches/MatchCard";
import type { PlayerHomeClub, PlayerHomeData } from "./loadPlayerHome";
import { AchievementsSection, EvolutionSection, RankingsSection, SummarySection } from "./SportSections";
import type { UpcomingItem } from "@/lib/playerHome";

const KIND_BADGE: Record<UpcomingItem["kind"], { label: string; variant: "primary" | "secondary" | "warning" | "default" }> = {
  open_match: { label: "Partido abierto", variant: "primary" },
  booking: { label: "Reserva", variant: "secondary" },
  request: { label: "Solicitud", variant: "warning" },
  tournament: { label: "Torneo", variant: "default" },
};

// Vista de "Mi Pádel" — pura composición visual; toda la carga ocurre en
// loadPlayerHome (llamado una vez desde page.tsx).
export function MiPadelView({
  data,
  userId,
  name,
  avatarUrl,
}: {
  data: PlayerHomeData;
  userId: string;
  name: string;
  avatarUrl: string | null;
}) {
  const firstName = name.split(/\s+/)[0];
  const operationalClubs = data.clubs.filter((c) => !c.deactivated);

  const contextParts = [
    data.clubs.length === 0 ? "Sin club por ahora" : data.clubs.length === 1 ? "1 club" : `${data.clubs.length} clubes`,
    data.myUpcomingMatchCount > 0
      ? `${data.myUpcomingMatchCount} partido${data.myUpcomingMatchCount === 1 ? "" : "s"} próximo${data.myUpcomingMatchCount === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  const opportunitiesHref = data.preferredCity ? `/partidos?ciudad=${encodeURIComponent(data.preferredCity.city)}` : "/partidos";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-6 pb-16 sm:pt-8">
      {/* A. Encabezado personal */}
      <header className="flex items-center gap-3">
        <PlayerAvatar player={{ id: userId, full_name: name, avatar_url: avatarUrl }} size="lg" />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-brand-primary">Mi Pádel</p>
          <h1 className="truncate text-2xl font-bold text-white">Hola, {firstName}</h1>
          <p className="text-sm text-brand-muted">{contextParts.join(" · ")}</p>
        </div>
      </header>

      {/* B. Acciones principales */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/partidos"
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-primary px-4 text-base font-semibold text-brand-bg shadow-lg shadow-brand-primary/20 hover:brightness-110"
        >
          <Search className="h-5 w-5" /> Buscar partido
        </Link>
        <Link
          href="/partidos/crear"
          className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-brand-primary/40 bg-brand-primary/10 px-4 text-base font-semibold text-brand-primary hover:bg-brand-primary/20"
        >
          <Plus className="h-5 w-5" /> Crear partido
        </Link>
      </div>

      {data.loadErrors.length > 0 && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Parte de tu información no se pudo cargar. Recarga la página para intentarlo de nuevo.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* C. Próxima actividad */}
        <section className="rounded-2xl border border-white/10 bg-brand-surface p-4 sm:p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <CalendarClock className="h-4 w-4 text-brand-primary" /> Próxima actividad
            </h2>
            <Link href="/partidos/mis-partidos" className="text-xs font-semibold text-brand-primary hover:underline">
              Mis partidos
            </Link>
          </div>
          {data.upcoming.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-white">No tienes actividad próxima.</p>
              <p className="mt-1 text-xs text-brand-muted">Únete a un partido abierto o crea el tuyo.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.upcoming.map((item) => {
                const badge = KIND_BADGE[item.kind];
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-colors hover:border-brand-primary/40 ${item.needsAction ? "border-amber-500/40 bg-amber-500/5" : "border-white/5 bg-white/[0.02]"}`}
                    >
                      <div className="w-14 shrink-0 text-center">
                        <p className="text-[11px] font-semibold uppercase text-brand-primary">
                          {item.date.startsWith("9999") ? "—" : formatOpenMatchDay(item.date, data.todayStr)}
                        </p>
                        <p className="text-xs text-white tabular-nums">{item.time ? formatOpenMatchTime(item.time) : ""}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                          <span className="truncate text-[11px] text-brand-muted">{item.origin}</span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-white">{item.title}</p>
                        <p className={`truncate text-xs ${item.needsAction ? "text-amber-300" : "text-brand-muted"}`}>{item.status}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-brand-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* D. Oportunidades para jugar */}
        <section className="rounded-2xl border border-white/10 bg-brand-surface p-4 sm:p-5 lg:col-span-2">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Compass className="h-4 w-4 text-brand-primary" /> Para jugar
            </h2>
            <Link href={opportunitiesHref} className="text-xs font-semibold text-brand-primary hover:underline">
              Ver todos
            </Link>
          </div>
          <p className="mb-3 flex items-center gap-1 text-xs text-brand-muted">
            <MapPin className="h-3 w-3" />
            {data.preferredCity
              ? `${data.preferredCity.city} · ${data.preferredCity.source === "matches" ? "según tus partidos" : "ciudad de tus clubes"}`
              : "Todas las ciudades"}
          </p>
          {data.opportunities.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 p-4 text-center">
              <p className="text-sm text-white">No hay partidos con cupo por ahora.</p>
              <div className="mt-3 flex flex-col gap-2">
                <Link href="/partidos/crear" className="text-sm font-semibold text-brand-primary hover:underline">
                  Crear un partido →
                </Link>
                <Link href="/partidos" className="text-xs text-brand-muted hover:text-white">
                  Explorar otras ciudades
                </Link>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.opportunities.map((m) => (
                <li key={m.id}>
                  <MatchCard match={m} today={data.todayStr} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* E–H. Actividad deportiva (clubes) */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Tu actividad en clubes</h2>
        {data.sport.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
            <p className="text-sm font-semibold text-white">Aún no perteneces a ningún club</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-brand-muted">
              Al unirte a un club verás aquí tus torneos, horas jugadas, ranking, categoría y logros. Mientras tanto, los partidos abiertos funcionan sin club.
            </p>
            <Link
              href="/clubs#explorar"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white hover:bg-white/5"
            >
              <Building2 className="h-4 w-4" /> Explorar clubes
            </Link>
          </div>
        ) : (
          <>
            <SummarySection clubs={data.sport} />
            <EvolutionSection clubs={data.sport} todayStr={data.todayStr} />
            <div className="grid gap-6 lg:grid-cols-2">
              <RankingsSection clubs={data.sport} />
              <AchievementsSection clubs={data.sport} />
            </div>
          </>
        )}
      </div>

      {/* I–J. Mis clubes + explorar */}
      <section className="rounded-2xl border border-white/10 bg-brand-surface p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Building2 className="h-4 w-4 text-brand-primary" /> Mis clubes
          </h2>
          <Link href="/clubs#explorar" className="text-xs font-semibold text-brand-primary hover:underline">
            Explorar clubes
          </Link>
        </div>
        {data.clubs.length === 0 ? (
          <p className="text-sm text-brand-muted">
            Encuentra clubes en la plataforma y únete para reservar canchas y participar en sus torneos.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.clubs.map((c) => (
              <li key={c.clubId}>
                <ClubRow club={c} />
              </li>
            ))}
          </ul>
        )}
        {operationalClubs.length > 0 && (
          <p className="mt-3 text-[11px] text-brand-muted">Dentro de cada club encuentras sus reservas, torneos, ranking y tu dashboard en ese club.</p>
        )}
      </section>
    </div>
  );
}

function ClubRow({ club }: { club: PlayerHomeClub }) {
  const initials = club.clubName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const body = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-primary/10 text-xs font-bold text-brand-primary">
        {club.clubLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.clubLogoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white">{club.clubName}</span>
        <span className="block truncate text-xs text-brand-muted">
          {club.deactivated ? "Desactivado" : club.archived ? "Archivado · solo lectura" : club.city ?? "Reservas, torneos y ranking"}
        </span>
      </span>
      {!club.deactivated && <ArrowRight className="h-4 w-4 shrink-0 text-brand-muted" />}
    </>
  );
  if (club.deactivated) {
    return <div className="flex items-center gap-3 rounded-xl border border-white/5 p-3 opacity-60">{body}</div>;
  }
  return (
    <Link href={`/${club.clubSlug}/dashboard`} className="flex items-center gap-3 rounded-xl border border-white/5 p-3 transition-colors hover:border-brand-primary/40">
      {body}
    </Link>
  );
}
