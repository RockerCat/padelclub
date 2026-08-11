// Identidad cromática de Mi Pádel Club, portada de src/app/globals.css y
// src/lib/constants/clubTheme.ts (app web) — la personalización de color
// por club fue eliminada por decisión de producto, así que estos valores
// fijos son la única fuente de verdad, nunca `clubs.primary_color`/
// `secondary_color`. Ver CLAUDE.md → Club Identity Principles.
export const theme = {
  colors: {
    bg: "#001A24",
    surface: "#082735",
    surfaceAlt: "#0B3040",
    border: "rgba(255,255,255,0.1)",
    white: "#FFFFFF",
    muted: "#94A3B8",
    primary: "#00FFFF",
    secondary: "#037172",
    danger: "#F87171",
    warning: "#FBBF24",
    success: "#00FF00",
    expired: "#FB923C",
  },
  spacing: (n: number) => n * 4,
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 999,
  },
} as const;
