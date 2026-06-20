import { useId } from "react";

export const SURFACE_OPTIONS = [
  { value: "",                  label: "Sin especificar" },
  { value: "cristal",           label: "Cristal" },
  { value: "moqueta",           label: "Moqueta" },
  { value: "césped_artificial", label: "Césped artificial" },
  { value: "cemento",           label: "Cemento" },
  { value: "tierra",            label: "Tierra batida" },
];

// Surface → court tint, loosely matching real padel surfaces (glass courts
// read blue, artificial turf reads green, carpet/cement read cooler/neutral).
const SURFACE_TINTS: Record<string, string> = {
  "":                  "#64748B", // sin especificar — slate
  cristal:             "#2563EB", // azul pádel clásico
  moqueta:             "#1E3A8A", // azul oscuro
  césped_artificial:   "#16A34A", // verde
  cemento:             "#6B7280", // gris
  tierra:              "#B45309", // tierra batida
};

export function getSurfaceLabel(surface: string | null | undefined): string {
  return SURFACE_OPTIONS.find((opt) => opt.value === (surface ?? ""))?.label ?? SURFACE_OPTIONS[0].label;
}

interface CourtIllustrationProps {
  surface: string | null | undefined;
  className?: string;
}

// Padel court, top-down — CSS/SVG only, no external images. Pure illustration:
// no name, no surface text, no metrics, no badges. Keep it clean and reusable
// across onboarding, court management and dashboard occupancy cards — callers
// render their own info below it.
export function CourtIllustration({ surface, className }: CourtIllustrationProps) {
  const tint = SURFACE_TINTS[surface ?? ""] ?? SURFACE_TINTS[""];
  const sheenId = useId();

  return (
    <svg viewBox="0 0 200 150" className={className ?? "w-full max-w-[220px]"}>
      <defs>
        <linearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Perimeter walls */}
      <rect
        x="4" y="4" width="192" height="142" rx="10"
        fill="none" stroke="#475569" strokeWidth="6" strokeOpacity="0.85"
      />

      {/* Court surface + boundary line */}
      <rect
        x="16" y="16" width="168" height="118" rx="6"
        fill={tint} fillOpacity="0.22" stroke={tint} strokeWidth="2" strokeOpacity="0.95"
      />

      {/* Net — full-height line at the court's horizontal midpoint */}
      <line x1="100" y1="16" x2="100" y2="134" stroke={tint} strokeWidth="3" strokeOpacity="0.95" />

      {/* Service lines — near the left/right walls, one per half */}
      <line x1="50" y1="16" x2="50" y2="134" stroke={tint} strokeWidth="2" strokeOpacity="0.85" />
      <line x1="150" y1="16" x2="150" y2="134" stroke={tint} strokeWidth="2" strokeOpacity="0.85" />

      {/* Center service line — splits the service boxes left/right, between the two service lines only */}
      <line x1="50" y1="75" x2="150" y2="75" stroke={tint} strokeWidth="1.5" strokeOpacity="0.7" />

      {/* Subtle sheen for depth */}
      <rect x="16" y="16" width="168" height="118" rx="6" fill={`url(#${sheenId})`} />
    </svg>
  );
}
