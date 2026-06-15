import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClubEntryPath } from "@/lib/utils/navigation";
import {
  ArrowLeft, MapPin, MessageCircle, ExternalLink,
  LayoutGrid, Clock, Check, Camera,
} from "lucide-react";
import { RequestAccessButton } from "./RequestAccessButton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ slug: string }>;
}

type Court = { id: string; name: string; is_indoor: boolean | null; surface: string | null };
type Hour  = { day_of_week: number; is_open: boolean; opens_at: string | null; closes_at: string | null };

// ─── Schedule helpers ─────────────────────────────────────────────────────────

const DAY_NAMES_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun

type ScheduleGroup = { label: string; timeRange: string };

function buildSchedule(hours: Hour[]): ScheduleGroup[] {
  const open = hours
    .filter((h) => h.is_open && h.opens_at && h.closes_at)
    .sort(
      (a, b) =>
        DAY_DISPLAY_ORDER.indexOf(a.day_of_week) -
        DAY_DISPLAY_ORDER.indexOf(b.day_of_week)
    );

  type Group = { startDay: number; endDay: number; opens: string; closes: string };
  const groups: Group[] = [];

  for (const h of open) {
    const last = groups[groups.length - 1];
    const prevIdx = last != null ? DAY_DISPLAY_ORDER.indexOf(last.endDay) : -2;
    const currIdx = DAY_DISPLAY_ORDER.indexOf(h.day_of_week);
    if (
      last &&
      currIdx === prevIdx + 1 &&
      last.opens === h.opens_at &&
      last.closes === h.closes_at
    ) {
      last.endDay = h.day_of_week;
    } else {
      groups.push({
        startDay: h.day_of_week,
        endDay: h.day_of_week,
        opens: h.opens_at!,
        closes: h.closes_at!,
      });
    }
  }

  return groups.map(({ startDay, endDay, opens, closes }) => ({
    label:
      startDay === endDay
        ? DAY_NAMES_FULL[startDay]
        : `${DAY_NAMES_FULL[startDay]} – ${DAY_NAMES_FULL[endDay]}`,
    timeRange: `${opens.slice(0, 5)} – ${closes.slice(0, 5)}`,
  }));
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-brand-surface border border-white/10 px-4 py-3.5 flex flex-col gap-1 min-w-0">
      <span className="text-lg font-bold text-white leading-none truncate">{value}</span>
      <span className="text-xs text-brand-muted">{label}</span>
    </div>
  );
}

const BENEFITS = [
  "Reserva canchas en línea — sin llamadas ni WhatsApp",
  "Consulta disponibilidad en tiempo real",
  "Organiza y gestiona tus partidos fácilmente",
  "Participa en torneos y actividades del club",
  "Accede desde cualquier dispositivo, cuando quieras",
];

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("clubs")
    .select("name, description")
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("visibility", "public")
    .single();
  if (!data) return { title: "Club no encontrado | PadelClub" };
  return {
    title: `${data.name} | PadelClub`,
    description: data.description ?? `Conoce ${data.name} en PadelClub.`,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicClubPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: club } = await supabase
    .from("clubs")
    .select(
      "id, name, slug, description, logo_url, primary_color, secondary_color, city, state, country, address, whatsapp, instagram, facebook, youtube"
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("visibility", "public")
    .single();

  if (!club) notFound();

  const [membershipResult, courtsResult, hoursResult] = await Promise.all([
    user
      ? supabase
          .from("club_members")
          .select("role")
          .eq("club_id", club.id)
          .eq("profile_id", user.id)
          .eq("is_active", true)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("courts")
      .select("id, name, is_indoor, surface")
      .eq("club_id", club.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("club_operating_hours")
      .select("day_of_week, is_open, opens_at, closes_at")
      .eq("club_id", club.id)
      .order("day_of_week", { ascending: true }),
  ]);

  const membership = membershipResult.data as { role: string } | null;
  const courts    = (courtsResult.data ?? []) as Court[];
  const rawHours  = (hoursResult.data  ?? []) as Hour[];
  const schedule  = buildSchedule(rawHours);

  // Derived
  const p          = club.primary_color;
  const loc        = [club.city, club.state, club.country].filter(Boolean).join(", ");
  const isAdmin    = membership?.role === "OWNER" || membership?.role === "ADMIN";
  const hasContact = club.whatsapp || club.instagram || club.facebook || club.youtube;
  const hasLocation = club.address || club.city || club.state || club.country;

  // Stats row — only non-empty values
  const mainSchedule = schedule[0]?.timeRange ?? null;
  const stats = [
    courts.length > 0 ? { value: String(courts.length), label: courts.length === 1 ? "Cancha" : "Canchas" } : null,
    mainSchedule       ? { value: mainSchedule,           label: "Horario principal" }                          : null,
    club.city          ? { value: club.city,              label: "Ciudad" }                                     : null,
  ].filter((s): s is { value: string; label: string } => s !== null);

  return (
    <div className="min-h-screen bg-brand-bg">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-white/10 bg-brand-bg/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/clubs"
            className="flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Explorar clubes
          </Link>
          {!user && (
            <div className="flex items-center gap-2">
              <Link
                href={`/auth/login?next=/clubs/${club.slug}`}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-white/15 text-white hover:border-white/30 hover:bg-white/5 transition-colors"
              >
                Iniciar sesión
              </Link>
              <Link
                href={`/auth/signup?next=/clubs/${club.slug}`}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-primary text-brand-bg hover:bg-brand-primary/90 transition-colors"
              >
                Registrarse
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div
        className="relative py-14 md:py-20 border-b border-white/5"
        style={{ background: `linear-gradient(160deg, ${p}10 0%, transparent 55%)` }}
      >
        <div className="max-w-2xl mx-auto px-4 flex flex-col items-center text-center">

          {/* Logo */}
          <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center text-2xl font-bold mb-6 overflow-hidden shrink-0"
            style={{ backgroundColor: `${p}1a`, color: p, border: `1px solid ${p}33` }}
          >
            {club.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={club.logo_url} alt={`Logo de ${club.name}`} className="w-full h-full object-cover" />
            ) : (
              getInitials(club.name)
            )}
          </div>

          {/* Name */}
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            {club.name}
          </h1>

          {/* Meta row: location, courts, schedule */}
          <div className="mt-3 flex flex-col items-center gap-1.5">
            {loc && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: `${p}cc` }} />
                <span className="text-sm text-brand-muted">{loc}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              {courts.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5 shrink-0" style={{ color: `${p}99` }} />
                  <span className="text-sm text-brand-muted">
                    {courts.length} {courts.length === 1 ? "cancha disponible" : "canchas disponibles"}
                  </span>
                </div>
              )}
              {mainSchedule && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: `${p}99` }} />
                  <span className="text-sm text-brand-muted">{mainSchedule}</span>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {club.description && (
            <p className="mt-5 text-base text-brand-muted/90 leading-relaxed max-w-lg">
              {club.description}
            </p>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-5">

        {/* ── Stats row ──────────────────────────────────────────────────── */}
        {stats.length > 0 && (
          <div
            className={`grid gap-3 ${
              stats.length === 1 ? "grid-cols-1" :
              stats.length === 2 ? "grid-cols-2" :
              "grid-cols-3"
            }`}
          >
            {stats.map((s) => (
              <StatCard key={s.label} value={s.value} label={s.label} />
            ))}
          </div>
        )}

        {/* ── Instalaciones ──────────────────────────────────────────────── */}
        {courts.length > 0 && (
          <section className="rounded-2xl bg-brand-surface border border-white/10 p-5">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-4">
              Instalaciones
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {courts.map((court) => (
                <div
                  key={court.id}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3"
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${p}18` }}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" style={{ color: p }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{court.name}</p>
                    {(court.is_indoor != null || court.surface) && (
                      <p className="text-xs text-brand-muted mt-0.5">
                        {court.is_indoor === true
                          ? "Indoor"
                          : court.is_indoor === false
                          ? "Outdoor"
                          : ""}
                        {court.is_indoor != null && court.surface ? " · " : ""}
                        {court.surface ?? ""}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Horarios ───────────────────────────────────────────────────── */}
        {schedule.length > 0 && (
          <section className="rounded-2xl bg-brand-surface border border-white/10 p-5">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-4 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Horarios
            </h2>
            <div className="divide-y divide-white/5">
              {schedule.map(({ label, timeRange }) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="text-sm text-white">{label}</span>
                  <span className="text-sm font-medium tabular-nums" style={{ color: p }}>
                    {timeRange}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── ¿Por qué jugar aquí? ───────────────────────────────────────── */}
        <section className="rounded-2xl bg-brand-surface border border-white/10 p-5">
          <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-4">
            ¿Por qué jugar aquí?
          </h2>
          <ul className="flex flex-col gap-2.5">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full mt-0.5"
                  style={{ backgroundColor: `${p}20` }}
                >
                  <Check className="w-3 h-3" style={{ color: p }} strokeWidth={3} />
                </div>
                <span className="text-sm text-white/80 leading-snug">{b}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Galería (placeholder) ──────────────────────────────────────── */}
        <section className="rounded-2xl bg-brand-surface border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
              Fotos del club
            </h2>
          </div>
          <div className="px-5 py-10 flex flex-col items-center gap-2.5">
            <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Camera className="w-5 h-5 text-brand-muted/40" />
            </div>
            <p className="text-sm text-brand-muted font-medium">Próximamente</p>
            <p className="text-xs text-brand-muted/50 text-center max-w-xs">
              El club podrá compartir fotos de sus canchas e instalaciones.
            </p>
          </div>
        </section>

        {/* ── Ubicación ──────────────────────────────────────────────────── */}
        {hasLocation && (
          <section className="rounded-2xl bg-brand-surface border border-white/10 p-5">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-4">
              Ubicación
            </h2>
            <div className="flex flex-col gap-2.5">
              {club.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-brand-muted shrink-0 mt-0.5" />
                  <span className="text-sm text-white">{club.address}</span>
                </div>
              )}
              {(club.city || club.state || club.country) && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-brand-muted/40 shrink-0 mt-0.5" />
                  <span className="text-sm text-brand-muted">
                    {[club.city, club.state, club.country].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Contacto ───────────────────────────────────────────────────── */}
        {hasContact && (
          <section className="rounded-2xl bg-brand-surface border border-white/10 p-5">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-4">
              Contacto
            </h2>
            <div className="flex flex-col gap-3">
              {club.whatsapp && (
                <a
                  href={`https://wa.me/${club.whatsapp.replace(/[^\d+]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm text-white hover:text-brand-primary transition-colors"
                >
                  <MessageCircle className="w-4 h-4 text-brand-muted shrink-0" />
                  <span>{club.whatsapp}</span>
                </a>
              )}
              {club.instagram && (
                <a
                  href={
                    club.instagram.startsWith("http")
                      ? club.instagram
                      : `https://instagram.com/${club.instagram.replace(/^@/, "")}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm text-white hover:text-brand-primary transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-brand-muted shrink-0" />
                  <span>Instagram · {club.instagram}</span>
                </a>
              )}
              {club.facebook && (
                <a
                  href={club.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm text-white hover:text-brand-primary transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-brand-muted shrink-0" />
                  <span>Facebook</span>
                </a>
              )}
              {club.youtube && (
                <a
                  href={club.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm text-white hover:text-brand-primary transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-brand-muted shrink-0" />
                  <span>YouTube</span>
                </a>
              )}
            </div>
          </section>
        )}

        {/* ── CTA ────────────────────────────────────────────────────────── */}
        <section className="rounded-2xl bg-brand-surface border border-white/10 p-6 text-center">
          {!user ? (
            <>
              <p className="text-base font-semibold text-white mb-1.5">
                ¿Quieres reservar en {club.name}?
              </p>
              <p className="text-sm text-brand-muted mb-5">
                Crea una cuenta gratuita para unirte al club y solicitar reservas.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href={`/auth/signup?next=/clubs/${club.slug}`}
                  className="inline-flex items-center justify-center rounded-xl bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-bg hover:bg-brand-primary/90 transition-colors"
                >
                  Crear cuenta gratis
                </Link>
                <Link
                  href={`/auth/login?next=/clubs/${club.slug}`}
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
                >
                  Iniciar sesión
                </Link>
              </div>
            </>
          ) : membership ? (
            <>
              <p className="text-xs text-brand-muted mb-4">
                {isAdmin
                  ? "Tienes permisos de administración en este club."
                  : "Ya eres miembro de este club."}
              </p>
              <Link
                href={getClubEntryPath(club.slug, membership.role)}
                className="inline-flex items-center justify-center rounded-xl px-7 py-3 text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: `${p}22`,
                  color: p,
                  border: `1px solid ${p}44`,
                }}
              >
                {isAdmin ? "Administrar club →" : "Entrar al club →"}
              </Link>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-white mb-1.5">
                ¿Quieres jugar en {club.name}?
              </p>
              <p className="text-sm text-brand-muted mb-5">
                Solicita acceso para unirte como jugador.
              </p>
              <RequestAccessButton whatsapp={club.whatsapp} />
            </>
          )}
        </section>

      </div>
    </div>
  );
}
