import type { ReactNode } from "react";
import { CLUB_PRIMARY_COLOR, CLUB_SECONDARY_COLOR } from "@/lib/constants/clubTheme";

// Identidad cromática fija para todos los clubes (ver
// src/lib/constants/clubTheme.ts) — ya no hay personalización por club, así
// que este wrapper no necesita props, estado ni contexto: solo inyecta las
// mismas dos variables CSS de siempre (--color-brand-primary/secondary,
// que sobreescriben los tokens Tailwind brand-*, y --club-primary/secondary
// para los estilos inline que ya las consumían) con un valor constante.
export function ClubThemeProvider({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col md:flex-row"
      style={
        {
          "--color-brand-primary": CLUB_PRIMARY_COLOR,
          "--color-brand-secondary": CLUB_SECONDARY_COLOR,
          "--club-primary": CLUB_PRIMARY_COLOR,
          "--club-secondary": CLUB_SECONDARY_COLOR,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
