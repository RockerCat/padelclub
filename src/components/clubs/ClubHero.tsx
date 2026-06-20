import type { ReactNode } from "react";
import { MapPin, Lock } from "lucide-react";
import { CoverUploadButton, LogoUploadButton } from "./ClubHeroUploadButtons";
import { ClubNameEditor } from "./ClubNameEditor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClubHeroClub = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  primary_color: string;
  city: string | null;
  state: string | null;
  visibility: string;
};

interface ClubHeroProps {
  club: ClubHeroClub;
  /** Slot for page-specific CTAs. Rendered right-aligned on desktop, below identity on mobile. */
  actions?: ReactNode;
  /**
   * "page" — full-bleed cover, no outer wrapper (public page).
   * "card" — cover + identity inside a rounded card (dashboard).
   */
  variant?: "page" | "card";
  /** Show inline upload buttons for cover and logo. Only pass true for OWNER context. */
  editable?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClubHero({ club, actions, variant = "page", editable = false }: ClubHeroProps) {
  const p       = club.primary_color;
  const loc     = [club.city, club.state].filter(Boolean).join(", ");
  const isPrivate = club.visibility === "private";

  const DEFAULT_COVER = "/img/portada-default.png";
  const customCover  = club.cover_image_url?.trim();

  // Always use an image (never the gradient).
  // Two-layer backgroundImage gives native CSS fallback: if the custom URL
  // fails to load (any error), the browser reveals the default layer beneath.
  const coverStyle: React.CSSProperties = {
    backgroundImage: customCover
      ? `url(${customCover}), url(${DEFAULT_COVER})`
      : `url(${DEFAULT_COVER})`,
  };

  const inner = (
    <>
      {/* Cover — full-bleed within its container */}
      <div className="h-48 sm:h-64 w-full bg-cover bg-center relative" style={coverStyle}>
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,.45), rgba(0,0,0,.15), transparent)" }}
        />
        {editable && <CoverUploadButton clubId={club.id} />}
      </div>

      {/* Identity — relative z-10 lifts this above the positioned cover div */}
      <div className={`relative z-10 ${variant === "card" ? "px-5 pb-5" : "max-w-5xl mx-auto px-5"}`}>
        <div className="flex flex-col lg:flex-row lg:items-end lg:gap-6 -mt-10 lg:-mt-12 pb-6">

          {/* Logo — overlaps cover via negative margin.
              Outer wrapper: relative z-10 for stacking; no overflow-hidden so the
              edit badge can peek beyond the logo's rounded corners.
              Inner div: carries the visual styles + overflow-hidden for image clipping. */}
          <div className="relative z-10 shrink-0 w-24 h-24 lg:w-28 lg:h-28">
            <div
              className="w-full h-full rounded-2xl flex items-center justify-center text-xl lg:text-2xl font-bold overflow-hidden"
              style={{
                backgroundColor: `${p}25`,
                color: p,
                border: `4px solid #0a0a0a`,
                boxShadow: `0 8px 28px ${p}35`,
              }}
            >
              {club.logo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={club.logo_url} alt="" className="w-full h-full object-cover" />
                : getInitials(club.name)}
            </div>
            {editable && <LogoUploadButton clubId={club.id} />}
          </div>

          {/* Name + info + actions */}
          <div className="flex-1 min-w-0 mt-4 lg:mt-0 lg:pb-2">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between lg:gap-8">

              <div className="min-w-0">
                {editable ? (
                  <ClubNameEditor
                    clubId={club.id}
                    name={club.name}
                    primaryColor={p}
                  />
                ) : (
                  <h1
                    className="text-2xl lg:text-3xl font-black text-white tracking-tight leading-tight"
                    style={{ textShadow: "0 2px 4px rgba(0,0,0,.6), 0 4px 12px rgba(0,0,0,.4)" }}
                  >
                    {club.name}
                  </h1>
                )}
                {loc && (
                  <p
                    className="flex items-center gap-1.5 text-sm text-brand-muted mt-1"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,.5)" }}
                  >
                    <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: `${p}aa` }} />
                    {loc}
                  </p>
                )}
                <div className="mt-2" style={{ textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>
                  {isPrivate ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
                      <Lock className="w-3 h-3 shrink-0" />
                      Club privado · Requiere aprobación
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      Club público · Cualquier jugador puede unirse
                    </span>
                  )}
                </div>
                {club.description && (
                  <p className="hidden lg:block text-sm text-white/60 leading-relaxed mt-3 max-w-lg line-clamp-2">
                    {club.description}
                  </p>
                )}
              </div>

              {actions && (
                <div className="mt-5 lg:mt-1 shrink-0">
                  {actions}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description — mobile only */}
        {club.description && (
          <p className="lg:hidden text-sm text-white/65 leading-relaxed -mt-2 mb-6">
            {club.description}
          </p>
        )}
      </div>
    </>
  );

  if (variant === "card") {
    return (
      <div className="rounded-2xl border border-white/10 mb-8 overflow-hidden bg-brand-surface">
        {inner}
      </div>
    );
  }

  return <>{inner}</>;
}
