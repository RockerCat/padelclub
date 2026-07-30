"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { Globe, MapPin, Images, ChevronRight, Pencil, Eye } from "lucide-react";
import { ClubHero } from "@/components/clubs/ClubHero";
import { ClubPublicView, type Court, type ClubNewsCard } from "@/components/clubs/ClubPublicView";
import type { ScheduleGroup } from "@/lib/operatingHours";
import type { Club } from "@/types/database";
import { PublicProfileModal } from "./PublicProfileModal";
import { PublicPreviewCard } from "./PublicPreviewCard";
import { GalleryModal } from "./GalleryModal";
import { LocationModal } from "../settings/LocationModal";

type ModuleKey = "profile" | "gallery" | "location";
type Mode = "edit" | "preview";

interface PublicPageSectionsProps {
  club: Club;
  courts: Court[];
  schedule: ScheduleGroup[];
  playerCount: number;
  news: ClubNewsCard[];
  /** Current viewer's membership role in this same club — drives the disabled CTA in Vista previa. */
  currentUserRole: string;
}

function ModuleCard({
  icon: Icon,
  title,
  onClick,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col text-left gap-3 p-5 rounded-2xl bg-brand-surface border border-white/10 hover:border-brand-primary/25 hover:bg-brand-primary/5 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-brand-muted shrink-0" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>

      <div className="flex-1 flex flex-col gap-1">{children}</div>

      <span
        className="inline-flex items-center gap-1 text-xs font-medium self-end"
        style={{ color: "var(--club-primary)" }}
      >
        Editar
        <ChevronRight className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}

export function PublicPageSections({ club, courts, schedule, playerCount, news, currentUserRole }: PublicPageSectionsProps) {
  const [mode, setMode] = useState<Mode>("edit");
  const [openModal, setOpenModal] = useState<ModuleKey | null>(null);

  const isPublic = club.visibility !== "private";
  const galleryCount = club.gallery_image_urls?.length ?? 0;

  // Modo Vista previa: el contenido debe ser exactamente el mismo que la
  // página pública real (mismo ClubPublicView) — sin título administrativo,
  // sin tablist, sin padding del admin. La única diferencia permitida es el
  // banner inyectado como `topBar` (con el botón para volver a Editar).
  if (mode === "preview") {
    return (
      <ClubPublicView
        club={club}
        courts={courts}
        schedule={schedule}
        playerCount={playerCount}
        news={news}
        viewerContext={{ kind: "previewMember", role: currentUserRole }}
        topBar={
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-5 py-3 mb-6 mx-5 mt-5 max-w-5xl lg:mx-auto">
            <div>
              <p className="text-sm text-amber-300/90">Estás viendo la página como visitante</p>
              <p className="text-xs text-amber-300/50 mt-0.5">
                Algunas acciones públicas están deshabilitadas porque ya perteneces a este club.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMode("edit")}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-400/15 text-amber-300 hover:bg-amber-400/25 transition-colors"
            >
              Volver a editar
            </button>
          </div>
        }
      />
    );
  }

  return (
    <div className="p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Página pública</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Así es como los jugadores ven tu club. Administra su imagen y presencia pública.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div
          role="tablist"
          className="inline-flex items-center gap-1 p-1 rounded-2xl bg-brand-surface border border-white/10 self-start"
        >
          {([
            { key: "edit" as const, label: "Editar", Icon: Pencil },
            { key: "preview" as const, label: "Vista previa", Icon: Eye },
          ]).map(({ key, label, Icon }) => {
            const isActive = mode === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setMode(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-colors whitespace-nowrap ${
                  isActive ? "font-semibold" : "text-brand-muted hover:text-white"
                }`}
                style={
                  isActive
                    ? { backgroundColor: "color-mix(in srgb, var(--club-primary) 18%, transparent)", color: "var(--club-primary)" }
                    : undefined
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </div>

        <ClubHero club={club} variant="card" editable />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ModuleCard icon={Globe} title="Perfil público" onClick={() => setOpenModal("profile")}>
            <Badge variant={isPublic ? "success" : "outline"} size="sm" className="self-start mb-1">
              {isPublic ? "Club público" : "Club privado"}
            </Badge>
            <p className="text-xs text-brand-muted truncate">
              {club.description || "Sin descripción"}
            </p>
          </ModuleCard>

          <ModuleCard icon={Images} title="Galería del Club" onClick={() => setOpenModal("gallery")}>
            <p className="text-sm text-white/80">{galleryCount}/10 fotos</p>
            <p className="text-xs text-brand-muted">Muéstrale el club a los jugadores</p>
          </ModuleCard>

          <ModuleCard icon={MapPin} title="Ubicación" onClick={() => setOpenModal("location")}>
            <p className="text-sm text-white/80 truncate">
              {[club.city, club.state, club.country].filter(Boolean).join(", ") || "Sin ubicación configurada"}
            </p>
          </ModuleCard>
        </div>

        <PublicPreviewCard clubSlug={club.slug} />

        {openModal === "profile" && (
          <PublicProfileModal club={club} onClose={() => setOpenModal(null)} />
        )}
        {openModal === "gallery" && (
          <GalleryModal
            clubId={club.id}
            images={club.gallery_image_urls ?? []}
            onClose={() => setOpenModal(null)}
          />
        )}
        {openModal === "location" && (
          <LocationModal club={club} onClose={() => setOpenModal(null)} />
        )}
      </div>
    </div>
  );
}
