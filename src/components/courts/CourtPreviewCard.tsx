import { CourtIllustration, getSurfaceLabel } from "./CourtIllustration";

interface CourtPreviewCardProps {
  name: string;
  surface: string;
  badgeLabel?: string;
  placeholderName?: string;
}

// Live preview of a court being created/edited — illustration reacts to the
// selected surface. Shared between onboarding's first-court step and the
// "Crear cancha" modal so both keep the exact same visual language.
export function CourtPreviewCard({
  name,
  surface,
  badgeLabel = "Nueva cancha",
  placeholderName = "Nueva cancha",
}: CourtPreviewCardProps) {
  const displayName = name.trim() || placeholderName;

  return (
    <div className="relative flex flex-col items-center gap-3 h-full min-h-[300px] rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-6 text-center overflow-hidden">
      <span
        className="absolute top-4 right-4 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
        style={{
          backgroundColor: "color-mix(in srgb, var(--club-primary, #B7E000) 15%, transparent)",
          color: "var(--club-primary, #B7E000)",
        }}
      >
        {badgeLabel}
      </span>

      <p className="text-[11px] text-brand-muted/45 uppercase tracking-wide mt-7 leading-relaxed">
        Vista superior<br />de cancha de pádel
      </p>

      <CourtIllustration surface={surface} className="w-full max-w-[220px] drop-shadow-lg" />

      <div className="mt-1">
        <p className="text-base font-bold text-white uppercase tracking-wide leading-tight">
          {displayName}
        </p>
        <p className="text-sm text-brand-muted/70 mt-0.5">{getSurfaceLabel(surface)}</p>
      </div>
    </div>
  );
}
