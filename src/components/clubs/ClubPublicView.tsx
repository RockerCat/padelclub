"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  MapPin, MessageCircle, ExternalLink,
  LayoutGrid, Clock, Camera, Trophy, CalendarDays, Navigation, Users, Video,
} from "lucide-react";
import { ClubHero, type ClubHeroClub } from "./ClubHero";
import { GalleryLightbox } from "./GalleryLightbox";
import { RequestAccessButton } from "@/app/clubs/[slug]/RequestAccessButton";
import { getClubEntryPath } from "@/lib/utils/navigation";
import type { ScheduleGroup } from "@/lib/operatingHours";
import { CourtIllustration, getSurfaceLabel } from "@/components/courts/CourtIllustration";

const LocationMap = dynamic(
  () => import("@/app/(app)/[club]/dashboard/onboarding/LocationMap").then((m) => m.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[220px] rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
    ),
  }
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClubPublicViewClub = ClubHeroClub & {
  address: string | null;
  country: string | null;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  latitude: number | null;
  longitude: number | null;
  gallery_image_urls: string[];
};

export type Court = {
  id: string;
  name: string;
  is_indoor: boolean | null;
  surface: string | null;
  streaming_url: string | null;
};

export type ViewerContext =
  | { kind: "visitor" }
  | { kind: "pendingRequest"; alreadyRequested: boolean }
  | { kind: "member"; role: string }
  /**
   * Admin "Vista previa" only — the current viewer already belongs to this
   * club (OWNER/ADMIN/PLAYER). Looks like the real public page, but join/
   * login CTAs are replaced with a disabled, informational badge so the
   * owner can't accidentally trigger a join/login flow on their own club.
   */
  | { kind: "previewMember"; role: string };

interface ClubPublicViewProps {
  club: ClubPublicViewClub;
  courts: Court[];
  schedule: ScheduleGroup[];
  playerCount: number;
  viewerContext: ViewerContext;
  /** Chrome rendered above the Hero — real page's top bar, or the admin preview banner. */
  topBar?: ReactNode;
}

// ─── Small presentational helpers (same as the real public page) ─────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function ClubPublicView({ club, courts, schedule, playerCount, viewerContext, topBar }: ClubPublicViewProps) {
  const p            = club.primary_color;
  const isPublic     = club.visibility === "public";
  const locFull      = [club.city, club.state, club.country].filter(Boolean).join(", ");
  const isAdmin      = viewerContext.kind === "member" && (viewerContext.role === "OWNER" || viewerContext.role === "ADMIN");
  const hasContact   = club.whatsapp || club.instagram || club.facebook || club.youtube;
  const mainSchedule = schedule[0]?.timeRange ?? null;
  const hasCoords    = club.latitude != null && club.longitude != null;
  const gallery      = club.gallery_image_urls ?? [];
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const streamingCourts = courts.filter((c) => c.streaming_url);
  const courtsBySurface = courts.reduce<Record<string, number>>((acc, c) => {
    if (!c.surface) return acc;
    acc[c.surface] = (acc[c.surface] ?? 0) + 1;
    return acc;
  }, {});
  const surfaceLines = Object.entries(courtsBySurface).map(
    ([surface, count]) => `${count} cancha${count > 1 ? "s" : ""} de ${getSurfaceLabel(surface).toLowerCase()}`
  );

  const directionsHref = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${club.latitude},${club.longitude}`
    : locFull || club.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([club.address, locFull].filter(Boolean).join(", "))}`
      : null;

  function CtaBlock({ compact = false }: { compact?: boolean }) {
    if (viewerContext.kind === "member") {
      return (
        <Link
          href={getClubEntryPath(club.slug, viewerContext.role)}
          className={`inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-colors ${compact ? "px-5 py-2.5" : "px-7 py-3"}`}
          style={{ backgroundColor: `${p}22`, color: p, border: `1px solid ${p}44` }}
        >
          {isAdmin ? "Administrar club →" : "Entrar al club →"}
        </Link>
      );
    }
    if (viewerContext.kind === "previewMember") {
      const label =
        viewerContext.role === "OWNER" ? "Ya eres propietario"
        : viewerContext.role === "ADMIN" ? "Ya perteneces a este club"
        : "Ya eres miembro";
      return (
        <span
          className={`inline-flex items-center justify-center rounded-xl text-sm font-semibold cursor-default select-none ${compact ? "px-5 py-2.5" : "px-7 py-3"}`}
          style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          {label}
        </span>
      );
    }
    if (viewerContext.kind === "visitor") {
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
        alreadyRequested={viewerContext.alreadyRequested}
        className={compact ? "!px-4 !py-2.5" : "w-full sm:w-auto"}
      />
    );
  }

  const showBottomCta = viewerContext.kind === "visitor" || viewerContext.kind === "pendingRequest";

  return (
    <div className="min-h-screen bg-brand-bg">

      {topBar}

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <ClubHero club={club} variant="page" actions={<CtaBlock compact />} showSocial />

      {/* ── Stats row ────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 pb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {courts.length > 0 && (
            <DashStat Icon={LayoutGrid} value={String(courts.length)} label={courts.length === 1 ? "Cancha activa" : "Canchas activas"} color={p} />
          )}
          {playerCount > 0 && (
            <DashStat Icon={Users} value={String(playerCount)} label={playerCount === 1 ? "Jugador" : "Jugadores"} color={p} />
          )}
          {mainSchedule && (
            <DashStat Icon={Clock} value={mainSchedule} label="Horario principal" color={p} />
          )}
          {club.city && (
            <DashStat Icon={MapPin} value={club.city} label="Ubicación" color={p} />
          )}
        </div>
      </div>

      {/* ── Two-column body ──────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:items-start">

          {/* ── Left column (3/5) — Gallery + Streaming + Location ───────────────── */}
          <div className="lg:col-span-3 flex flex-col gap-6">

            {/* Gallery */}
            {gallery.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 rounded-2xl overflow-hidden">
                {gallery.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    className="block cursor-pointer"
                    aria-label={`Ver foto ${i + 1} en tamaño grande`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`${club.name} — foto ${i + 1}`}
                      className="w-full aspect-square object-cover hover:opacity-90 transition-opacity"
                    />
                  </button>
                ))}
              </div>
            ) : (
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
            )}

            {/* Transmisiones en vivo */}
            {streamingCourts.length > 0 && (
              <div>
                <h2 className="text-base font-semibold text-white mb-2.5">🎥 Transmisiones en vivo</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {streamingCourts.map((court) => (
                    <div key={court.id} className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden flex flex-col">
                      <div className="relative p-4 pb-0">
                        <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold bg-red-500/90 text-white">
                          <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 animate-pulse" />
                          EN VIVO
                        </span>
                        <CourtIllustration surface={court.surface} className="w-full" />
                      </div>
                      <div className="p-4 pt-3 flex flex-col gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white uppercase tracking-wide truncate">{court.name}</p>
                          {(court.is_indoor != null || court.surface) && (
                            <p className="text-xs text-brand-muted mt-0.5">
                              {court.is_indoor === true ? "Indoor" : court.is_indoor === false ? "Outdoor" : ""}
                              {court.is_indoor != null && court.surface ? " · " : ""}
                              {court.surface ?? ""}
                            </p>
                          )}
                        </div>
                        <a
                          href={court.streaming_url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 h-9 rounded-xl text-sm font-semibold bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors"
                        >
                          <Video className="w-3.5 h-3.5" />
                          Ver transmisión
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ubicación */}
            {(club.address || locFull || hasCoords) && (
              <div className="rounded-2xl bg-brand-surface border border-white/10 overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-brand-muted" />
                  <h3 className="text-sm font-semibold text-white">Ubicación</h3>
                </div>
                <div className="px-5 pt-4 pb-5 flex flex-col gap-3">
                  {(club.address || locFull) && (
                    <p className="text-sm text-white/80 leading-snug">
                      {[club.address, locFull].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {hasCoords ? (
                    <LocationMap lat={club.latitude as number} lng={club.longitude as number} />
                  ) : (
                    <div className="w-full h-[120px] rounded-xl border border-dashed border-white/10 bg-white/[0.02] flex items-center justify-center">
                      <p className="text-xs text-brand-muted/50">Ubicación exacta próximamente</p>
                    </div>
                  )}
                  {directionsHref && (
                    <a
                      href={directionsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-medium border border-white/15 text-white hover:bg-white/5 transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Cómo llegar
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Bottom CTA — mobile + tablet only */}
            {showBottomCta && (
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

          {/* ── Right column (2/5) — Info + Schedule + Contact + CTA ─────────────── */}
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
                  <div className="flex items-start gap-3 py-3">
                    <span className="text-base shrink-0 mt-0.5">🎾</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-brand-muted/50 font-medium">Instalaciones</p>
                      <p className="text-sm text-white mt-0.5">
                        {courts.length} cancha{courts.length > 1 ? "s" : ""} activa{courts.length > 1 ? "s" : ""}
                      </p>
                      {surfaceLines.length > 0 && (
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {surfaceLines.map((line) => (
                            <li key={line} className="text-xs text-brand-muted">{line}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
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
            {showBottomCta && (
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

      {lightboxIndex !== null && (
        <GalleryLightbox
          images={gallery}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          altPrefix={`${club.name} — foto`}
        />
      )}

    </div>
  );
}
