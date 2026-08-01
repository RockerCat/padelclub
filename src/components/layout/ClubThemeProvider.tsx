import type { ReactNode } from "react";
import { CLUB_PRIMARY_COLOR, CLUB_SECONDARY_COLOR } from "@/lib/constants/clubTheme";

// Identidad cromática fija para todos los clubes (ver
// src/lib/constants/clubTheme.ts) — ya no hay personalización por club, así
// que este wrapper no necesita props, estado ni contexto: solo inyecta las
// mismas dos variables CSS de siempre (--color-brand-primary/secondary,
// que sobreescriben los tokens Tailwind brand-*, y --club-primary/secondary
// para los estilos inline que ya las consumían) con un valor constante.
//
// Siempre `flex-col` a este nivel (nunca `md:flex-row`, a diferencia de una
// versión anterior): el caller (([club])/profile layout) es quien arma su
// propia fila sidebar+contenido como un único hijo, dejando el Footer
// global como el hijo siguiente, para que abarque todo el ancho debajo del
// sidebar en vez de quedar apretado como una tercera columna. `pb-28
// md:pb-0` reserva, solo en mobile, el espacio exacto de la tab bar fija
// de AppNav — así el Footer (el último contenido real de la página) nunca
// queda tapado por ella; en desktop no existe esa tab bar, así que no hace
// falta ningún espacio de más.
export function ClubThemeProvider({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col pb-28 md:pb-0"
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
