import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getClubEntryPath } from "@/lib/utils/navigation";
import {
  ArrowLeft, MapPin, MessageCircle, ExternalLink,
  LayoutGrid, Clock, Camera, Trophy, CalendarDays,
} from "lucide-react";
import { RequestAccessButton } from "./RequestAccessButton";
import { ClubHero } from "@/components/clubs/ClubHero";
import { buildScheduleSummary, type OperatingHour as Hour } from "@/lib/operatingHours";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props { params: Promise<{ slug: string }> }

type Court = { id: string; name: string; is_indoor: boolean | null; surface: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function DashStat({ Icon, value, label, color, pending = false }: {
  Icon: LucideIcon; value?: string; label: string; color: string; pending?: boolean;
}) {
  return (
    <div className={`rounded-xl px-4 py-3.5 flex items-center gap-3 ${pending ? "bg-white/3 border border-dashed border-white/8" : "bg-brand-surface border border-white/10"}`}>
      <Icon className="w-5 h-5 shrink-0" style={{ color: pending ? "rgba(255,255,255,0.18)" : color }} />
      <div className="min-w-0">
        {pending ? (
          <p className="text-xs text-brand-muted/35 font-medium">{label} · pronto</p>
        ) : (
          <>
            <p className="text-base font-black text-white leading-none tabular-nums truncate">{value}</p>
            <p className="text-[11px] text-brand-muted mt-0.5">{label}</p>
          </>
        )}
      </div>
    </div>
  );
}

function InfoRow({ Icon, label, value, badge, badgeAmber = false }: {
  Icon: LucideIcon; label: string; value: string; badge?: string; badgeAmber?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="w-4 h-4 text-brand-muted/60 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-brand-muted/50 font-medium">{label}</p>
        <p className="text-sm text-white mt-0.5 leading-snug">{value}</p>
      </div>
      {badge && (
        <span className={`text-[10px] font-medium shrink-0 mt-1 px-1.5 py-0.5 rounded-md ${badgeAmber ? "text-amber-400/80 bg-amber-500/10" : "text-brand-muted/50 bg-white/5"}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase  = await createClient();
  const { data }  = await supabase.from("clubs").select("name, description")
    .eq("slug", slug).eq("is_active", true).single();
  if (!data) return { title: "Club no encontrado | PadelClub" };
  return { title: `${data.name} | PadelClub`, description: data.description ?? `Conoce ${data.name} en PadelClub.` };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicClubPage({ params }: Props) {
  const { slug } = await params;
  const supabase  = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: clubData } = await supabase
    .from("clubs")
    .select("id, name, slug, description, logo_url, cover_image_url, primary_color, secondary_color, visibility, city, state, country, address, whatsapp, instagram, facebook, youtube")
    .eq("slug", slug).eq("is_active", true).single();

  if (!clubData) notFound();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const club = clubData!;

  const [membershipResult, courtsResult, hoursResult, joinRequestResult] = await Promise.all([
    user
      ? supabase.from("club_members").select("role").eq("club_id", club.id).eq("profile_id", user.id).eq("is_active", true).single()
      : Promise.resolve({ data: null }),
    supabase.from("courts").select("id, name, is_indoor, surface").eq("club_id", club.id).eq("is_active", true).order("sort_order"),
    supabase.from("club_operating_hours").select("day_of_week, is_open, opens_at, closes_at").eq("club_id", club.id).order("day_of_week"),
    user
      ? supabase.from("club_join_requests").select("id").eq("club_id", club.id).eq("profile_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const membership       = membershipResult.data as { role: string } | null;
  const courts           = (courtsResult.data ?? []) as Court[];
  const rawHours         = (hoursResult.data  ?? []) as Hour[];
  const schedule         = buildScheduleSummary(rawHours);
  const alreadyRequested = joinRequestResult.data != null;

  const p            = club.primary_color;
  const isPublic     = club.visibility === "public";
  const locFull      = [club.city, club.state, club.country].filter(Boolean).join(", ");
  const isAdmin      = membership?.role === "OWNER" || membership?.role === "ADMIN";
  const hasContact   = club.whatsapp || club.instagram || club.facebook || club.youtube;
  const mainSchedule = schedule[0]?.timeRange ?? null;

  // CTA buttons (reusable in two spots)
  function CtaBlock({ compact = false }: { compact?: boolean }) {
    if (membership) {
      return (
        <Link
          href={getClubEntryPath(club.slug, membership.role)}
          className={`inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-colors ${compact ? "px-5 py-2.5" : "px-7 py-3"}`}
          style={{ backgroundColor: `${p}22`, color: p, border: `1px solid ${p}44` }}
        >
          {isAdmin ? "Administrar club →" : "Entrar al club →"}
        </Link>
      );
    }
    if (!user) {
      return (
        <div className={`flex ${compact ? "flex-row gap-2" : "flex-col sm:flex-row gap-2.5"}`}>
          <Link
            href={`/auth/signup?next=/clubs/${club.slug}`}
            className={`inline-flex items-center justify-center rounded-xl bg-brand-primary text-brand-bg text-sm font-semibold hover:bg-brand-primary/90 transition-colors ${compact ? "px-4 py-2.5" : "px-7 py-3"}`}
          >
            {isPublic ? "Unirme al club" : "Solicitar acceso"}
          </Link>
          <Link
            href={`/auth/login?next=/clubs/${club.slug}`}
            className={`inline-flex items-center justify-center rounded-xl border border-white/15 text-white text-sm font-medium hover:bg-white/5 transition-colors ${compact ? "px-4 py-2.5" : "px-7 py-3"}`}
          >
            Entrar
          </Link>
        </div>
      );
    }
    return (
      <RequestAccessButton
        clubId={club.id}
        clubSlug={club.slug}
        whatsapp={club.whatsapp}
        isPublic={isPublic}
        alreadyRequested={alreadyRequested}
        className={compact ? "!px-4 !py-2.5" : "w-full sm:w-auto"}
      />
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-white/8 bg-brand-bg/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/clubs" className="flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Explorar clubes
          </Link>
          {!user && (
            <Link href={`/auth/login?next=/clubs/${club.slug}`} className="text-sm text-brand-muted hover:text-white transition-colors">
              Iniciar sesión
            </Link>
          )}
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <ClubHero club={club} variant="page" actions={<CtaBlock compact />} />

      {/* ── Stats row ────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 pb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {courts.length > 0 && (
            <DashStat Icon={LayoutGrid} value={String(courts.length)} label={courts.length === 1 ? "Cancha activa" : "Canchas activas"} color={p} />
          )}
          {mainSchedule && (
            <DashStat Icon={Clock} value={mainSchedule} label="Horario principal" color={p} />
          )}
          {club.city && (
            <DashStat Icon={MapPin} value={club.city} label="Ubicación" color={p} />
          )}
          <DashStat Icon={Trophy} label="Ranking" color={p} pending />
        </div>
      </div>

      {/* ── Two-column body ──────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:items-start">

          {/* ── Left column (3/5) — Gallery + About + Courts ─────────────── */}
          <div className="lg:col-span-3 flex flex-col gap-6">

            {/* Gallery — Airbnb bento */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl overflow-hidden h-56 sm:h-72 lg:h-80">
              <div
                className="col-span-2 row-span-2 flex items-center justify-center relative"
                style={{ backgroundColor: `${p}12` }}
              >
                <Camera className="w-8 h-8" style={{ color: `${p}28` }} />
                <span className="absolute bottom-3 left-3 text-[10px] text-white/20 font-medium">
                  Fotos próximamente
                </span>
              </div>
              <div className="flex items-center justify-center" style={{ backgroundColor: `${p}08` }}>
                <Camera className="w-4 h-4" style={{ color: `${p}18` }} />
              </div>
              <div className="flex items-center justify-center" style={{ backgroundColor: `${p}06` }}>
                <Camera className="w-4 h-4" style={{ color: `${p}14` }} />
              </div>
            </div>

            {/* About */}
            <div>
              <h2 className="text-base font-semibold text-white mb-2.5">Sobre {club.name}</h2>
              {club.description ? (
                <p className="text-sm text-white/65 leading-relaxed whitespace-pre-line">{club.description}</p>
              ) : (
                <p className="text-sm text-brand-muted/40 italic">Este club aún no ha añadido una descripción.</p>
              )}
            </div>

            {/* Courts */}
            {courts.length > 0 && (
              <div>
                <h2 className="text-base font-semibold text-white mb-2.5">Instalaciones</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {courts.map((court) => (
                    <div key={court.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3">
                      <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${p}18` }}>
                        <LayoutGrid className="w-3.5 h-3.5" style={{ color: p }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{court.name}</p>
                        {(court.is_indoor != null || court.surface) && (
                          <p className="text-xs text-brand-muted mt-0.5">
                            {court.is_indoor === true ? "Indoor" : court.is_indoor === false ? "Outdoor" : ""}
                            {court.is_indoor != null && court.surface ? " · " : ""}
                            {court.surface ?? ""}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom CTA — mobile + tablet only */}
            {(!user || !membership) && (
              <div
                className="lg:hidden rounded-2xl p-6 text-center"
                style={{
                  background: isPublic
                    ? `linear-gradient(135deg, ${p}22 0%, ${p}0a 100%)`
                    : `linear-gradient(135deg, rgba(251,191,36,0.07) 0%, transparent 100%)`,
                  border: isPublic ? `1px solid ${p}30` : `1px solid rgba(251,191,36,0.12)`,
                }}
              >
                <h3 className="text-base font-bold text-white mb-1.5">
                  {isPublic ? `¿Listo para jugar en ${club.name}?` : `¿Quieres jugar en ${club.name}?`}
                </h3>
                <p className="text-sm text-brand-muted mb-4">
                  {isPublic ? "Únete al club y comienza a reservar canchas." : "Solicita acceso. Un administrador revisará tu solicitud."}
                </p>
                <CtaBlock />
              </div>
            )}

          </div>

          {/* ── Right column (2/5) — Info + Schedule + Contact + CTA ─────── */}
          <div className="lg:col-span-2 flex flex-col gap-4 lg:sticky lg:top-20">

            {/* Quick info card */}
            <div className="rounded-2xl bg-brand-surface border border-white/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <h3 className="text-sm font-semibold text-white">Información del club</h3>
              </div>
              <div className="px-5 divide-y divide-white/5">
                {locFull && (
                  <InfoRow Icon={MapPin} label="Ubicación" value={locFull} />
                )}
                {mainSchedule && (
                  <InfoRow Icon={Clock} label="Horario principal" value={mainSchedule} />
                )}
                {courts.length > 0 && (
                  <InfoRow Icon={LayoutGrid} label="Instalaciones" value={`${courts.length} cancha${courts.length > 1 ? "s" : ""} activa${courts.length > 1 ? "s" : ""}`} />
                )}
                <InfoRow Icon={CalendarDays} label="Reservas" value="Online vía PadelClub" />
                <InfoRow Icon={Trophy} label="Ranking" value="En construcción" badge="Pronto" badgeAmber />
              </div>
            </div>

            {/* Horarios */}
            {schedule.length > 0 && (
              <div className="rounded-2xl bg-brand-surface border border-white/10 overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-brand-muted" />
                  <h3 className="text-sm font-semibold text-white">Horarios</h3>
                </div>
                <div className="px-5 divide-y divide-white/5">
                  {schedule.map(({ label, timeRange }) => (
                    <div key={label} className="flex items-center justify-between py-3">
                      <span className="text-sm text-white">{label}</span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: p }}>{timeRange}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contacto */}
            {hasContact && (
              <div className="rounded-2xl bg-brand-surface border border-white/10 overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-white">Contacto</h3>
                </div>
                <div className="px-5 divide-y divide-white/5">
                  {club.whatsapp && (
                    <a href={`https://wa.me/${club.whatsapp.replace(/[^\d+]/g, "")}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 py-3 hover:opacity-80 transition-opacity">
                      <MessageCircle className="w-4 h-4 text-brand-muted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] text-brand-muted/60">WhatsApp</p>
                        <p className="text-sm text-white font-medium truncate">{club.whatsapp}</p>
                      </div>
                    </a>
                  )}
                  {club.instagram && (
                    <a href={club.instagram.startsWith("http") ? club.instagram : `https://instagram.com/${club.instagram.replace(/^@/, "")}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 py-3 hover:opacity-80 transition-opacity">
                      <ExternalLink className="w-4 h-4 text-brand-muted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] text-brand-muted/60">Instagram</p>
                        <p className="text-sm text-white font-medium truncate">{club.instagram}</p>
                      </div>
                    </a>
                  )}
                  {club.facebook && (
                    <a href={club.facebook} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 py-3 hover:opacity-80 transition-opacity">
                      <ExternalLink className="w-4 h-4 text-brand-muted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] text-brand-muted/60">Facebook</p>
                        <p className="text-sm text-white font-medium truncate">{club.facebook}</p>
                      </div>
                    </a>
                  )}
                  {club.youtube && (
                    <a href={club.youtube} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 py-3 hover:opacity-80 transition-opacity">
                      <ExternalLink className="w-4 h-4 text-brand-muted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] text-brand-muted/60">YouTube</p>
                        <p className="text-sm text-white font-medium truncate">{club.youtube}</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Bottom CTA — desktop only */}
            {(!user || !membership) && (
              <div
                className="hidden lg:block rounded-2xl p-6 text-center"
                style={{
                  background: isPublic
                    ? `linear-gradient(135deg, ${p}22 0%, ${p}0a 100%)`
                    : `linear-gradient(135deg, rgba(251,191,36,0.07) 0%, transparent 100%)`,
                  border: isPublic ? `1px solid ${p}30` : `1px solid rgba(251,191,36,0.12)`,
                }}
              >
                <h3 className="text-base font-bold text-white mb-1.5">
                  {isPublic ? `¿Listo para jugar en ${club.name}?` : `¿Quieres jugar en ${club.name}?`}
                </h3>
                <p className="text-sm text-brand-muted mb-4">
                  {isPublic ? "Únete al club y comienza a reservar canchas." : "Solicita acceso. Un administrador revisará tu solicitud."}
                </p>
                <CtaBlock />
              </div>
            )}

          </div>
        </div>
      </div>

    </div>
  );
}
