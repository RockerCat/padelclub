"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Clock, MessageCircle, ExternalLink, Navigation, Camera } from "lucide-react";
import { GalleryLightbox } from "@/components/clubs/GalleryLightbox";
import { getSurfaceLabel } from "@/components/courts/CourtIllustration";
import type { ScheduleGroup } from "@/lib/operatingHours";
import type { Court } from "@/components/clubs/ClubPublicView";

const LocationMap = dynamic(
  () => import("@/app/(app)/[club]/dashboard/onboarding/LocationMap").then((m) => m.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[180px] rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
    ),
  }
);

export type ClubInfoClub = {
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  latitude: number | null;
  longitude: number | null;
  gallery_image_urls: string[];
};

// "Información del club" for the player home page — same real data as the
// public page (getClubPublicPageData + the club row), but its own compact
// presentation: no join/login CTAs, no public navigation, never the full
// ClubPublicView layout. Only real, present data renders a block; nothing
// here is invented.
export function ClubInfoSections({
  club,
  schedule,
  courts,
}: {
  club: ClubInfoClub;
  schedule: ScheduleGroup[];
  courts: Court[];
}) {
  const locFull = [club.city, club.state, club.country].filter(Boolean).join(", ");
  const hasCoords = club.latitude != null && club.longitude != null;
  const hasContact = club.whatsapp || club.instagram || club.facebook || club.youtube;
  const gallery = club.gallery_image_urls ?? [];
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

  const hasNothing =
    !locFull && !club.address && !hasCoords && schedule.length === 0 && courts.length === 0 && !hasContact && gallery.length === 0;
  if (hasNothing) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
            ) : null}
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

      {/* Horarios + Instalaciones */}
      {(schedule.length > 0 || courts.length > 0) && (
        <div className="rounded-2xl bg-brand-surface border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-brand-muted" />
            <h3 className="text-sm font-semibold text-white">Horarios e instalaciones</h3>
          </div>
          <div className="px-5 divide-y divide-white/5">
            {schedule.map(({ label, timeRange }) => (
              <div key={label} className="flex items-center justify-between py-3">
                <span className="text-sm text-white">{label}</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--club-primary, #B7E000)" }}>
                  {timeRange}
                </span>
              </div>
            ))}
            {courts.length > 0 && (
              <div className="py-3">
                <p className="text-sm text-white">
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
            )}
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
              <a
                href={`https://wa.me/${club.whatsapp.replace(/[^\d+]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 py-3 hover:opacity-80 transition-opacity"
              >
                <MessageCircle className="w-4 h-4 text-brand-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-brand-muted/60">WhatsApp</p>
                  <p className="text-sm text-white font-medium truncate">{club.whatsapp}</p>
                </div>
              </a>
            )}
            {club.instagram && (
              <a
                href={club.instagram.startsWith("http") ? club.instagram : `https://instagram.com/${club.instagram.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 py-3 hover:opacity-80 transition-opacity"
              >
                <ExternalLink className="w-4 h-4 text-brand-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-brand-muted/60">Instagram</p>
                  <p className="text-sm text-white font-medium truncate">{club.instagram}</p>
                </div>
              </a>
            )}
            {club.facebook && (
              <a href={club.facebook} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-3 hover:opacity-80 transition-opacity">
                <ExternalLink className="w-4 h-4 text-brand-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-brand-muted/60">Facebook</p>
                  <p className="text-sm text-white font-medium truncate">{club.facebook}</p>
                </div>
              </a>
            )}
            {club.youtube && (
              <a href={club.youtube} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-3 hover:opacity-80 transition-opacity">
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

      {/* Galería */}
      {gallery.length > 0 && (
        <div className="rounded-2xl bg-brand-surface border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
            <Camera className="w-3.5 h-3.5 text-brand-muted" />
            <h3 className="text-sm font-semibold text-white">Galería</h3>
          </div>
          <div className="p-3 grid grid-cols-3 gap-2">
            {gallery.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="block cursor-pointer rounded-lg overflow-hidden"
                aria-label={`Ver foto ${i + 1} en tamaño grande`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Foto ${i + 1}`} className="w-full aspect-square object-cover hover:opacity-90 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <GalleryLightbox
          images={gallery}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          altPrefix="Foto"
        />
      )}
    </div>
  );
}
