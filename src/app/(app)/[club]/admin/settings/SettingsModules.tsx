"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { Info, Globe, MapPin, Clock, ChevronRight } from "lucide-react";
import { durationLabel, getClubDurations } from "@/lib/durations";
import { buildScheduleSummary, type OperatingHour } from "@/lib/operatingHours";
import type { Club } from "@/types/database";
import { ClubInfoModal } from "./ClubInfoModal";
import { PublicProfileModal } from "./PublicProfileModal";
import { LocationModal } from "./LocationModal";
import { OperationModal } from "./OperationModal";

type ModuleKey = "info" | "profile" | "location" | "operation";

interface SettingsModulesProps {
  club: Club;
  initialHours: OperatingHour[];
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

export function SettingsModules({ club, initialHours }: SettingsModulesProps) {
  const [openModal, setOpenModal] = useState<ModuleKey | null>(null);

  const isPublic = club.visibility !== "private";
  const locationLine = [club.city, club.state, club.country].filter(Boolean).join(", ");
  const schedule = buildScheduleSummary(initialHours);
  const allowedDurations = getClubDurations(club.allowed_reservation_durations);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ModuleCard icon={Info} title="Información del club" onClick={() => setOpenModal("info")}>
          <p className="text-sm text-white/80 truncate">{club.name}</p>
          <p className="text-xs text-brand-muted">Logo, portada y nombre</p>
        </ModuleCard>

        <ModuleCard icon={Globe} title="Perfil público" onClick={() => setOpenModal("profile")}>
          <Badge variant={isPublic ? "success" : "outline"} size="sm" className="self-start mb-1">
            {isPublic ? "Club público" : "Club privado"}
          </Badge>
          <p className="text-xs text-brand-muted truncate">
            {club.description || "Sin descripción"}
          </p>
        </ModuleCard>

        <ModuleCard icon={MapPin} title="Ubicación" onClick={() => setOpenModal("location")}>
          <p className="text-sm text-white/80 truncate">{locationLine || "Sin ubicación configurada"}</p>
        </ModuleCard>

        <ModuleCard icon={Clock} title="Operación" onClick={() => setOpenModal("operation")}>
          {schedule.length === 0 ? (
            <p className="text-xs text-brand-muted/50">Sin horarios configurados</p>
          ) : (
            <p className="text-xs text-white/70">
              {schedule[0].label} <span className="text-brand-muted">· {schedule[0].timeRange}</span>
            </p>
          )}
          <p className="text-xs text-brand-muted truncate">
            Duraciones: {allowedDurations.map((m) => durationLabel(m)).join(", ")}
          </p>
        </ModuleCard>
      </div>

      {openModal === "info" && <ClubInfoModal club={club} onClose={() => setOpenModal(null)} />}
      {openModal === "profile" && <PublicProfileModal club={club} onClose={() => setOpenModal(null)} />}
      {openModal === "location" && <LocationModal club={club} onClose={() => setOpenModal(null)} />}
      {openModal === "operation" && (
        <OperationModal
          clubId={club.id}
          initialHours={initialHours}
          allowedDurations={allowedDurations}
          onClose={() => setOpenModal(null)}
        />
      )}
    </>
  );
}
