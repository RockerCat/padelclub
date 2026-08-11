// Portado de src/lib/tournamentLabels.ts (app web) — misma fuente única
// que mobile ahora también usa. Valores auditados directamente de las
// CHECK constraints tournaments_valid_status/tournaments_valid_visibility
// (20260903000001_tournaments_table.sql), nunca adivinados.

// Mismos 7 variants que Badge.tsx (app web) — el componente Badge en sí
// se queda en WEB (UI), pero el string union que describe sus variantes
// es puro y ambas plataformas lo necesitan para tipar el mapeo de
// status→variant.
export type TournamentBadgeVariant = "default" | "primary" | "secondary" | "success" | "warning" | "danger" | "outline";

export const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  registration_open: "Inscripciones abiertas",
  registration_closed: "Inscripciones cerradas",
  in_progress: "En curso",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

export function tournamentStatusLabel(status: string): string {
  return TOURNAMENT_STATUS_LABELS[status] ?? status;
}

export const TOURNAMENT_STATUS_BADGE_VARIANT: Record<string, TournamentBadgeVariant> = {
  draft: "outline",
  registration_open: "success",
  registration_closed: "warning",
  in_progress: "primary",
  completed: "default",
  cancelled: "danger",
};

export function tournamentStatusBadgeVariant(status: string): TournamentBadgeVariant {
  return TOURNAMENT_STATUS_BADGE_VARIANT[status] ?? "default";
}

export const TOURNAMENT_VISIBILITY_LABELS: Record<string, string> = {
  public: "Público",
  private: "Privado",
};

export function tournamentVisibilityLabel(visibility: string): string {
  return TOURNAMENT_VISIBILITY_LABELS[visibility] ?? visibility;
}

// category es siempre el código único/superior, secondaryCategory solo
// presente en un torneo combinado. Nunca "Suma N" ni ningún otro nombre
// comercial — eso es una decisión de producto separada, no aprobada.
export function tournamentCategoryLabel(category: string, secondaryCategory: string | null): string {
  return secondaryCategory ? `${category} + ${secondaryCategory}` : category;
}

// Valor de inscripción — moneda fija COP (informativo, sin pagos ni
// recaudo real). Un solo formato reutilizado en tarjetas, detalle y vista
// de PLAYER, nunca reimplementado por pantalla.
export function tournamentEntryFeeLabel(entryFeeAmount: number): string {
  if (entryFeeAmount <= 0) return "Inscripción gratuita";
  const formatted = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(entryFeeAmount);
  return `Inscripción: ${formatted} por persona`;
}
