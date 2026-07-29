// Single source for the Spanish labels/badge variants shown for a
// tournament's status/visibility — same convention as roleLabels.ts. Values
// audited directly from the tournaments_valid_status/tournaments_valid_visibility
// CHECK constraints (20260903000001_tournaments_table.sql), never guessed.
import type { BadgeProps } from "@/components/ui/Badge";

export const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  registration_open: "Inscripciones abiertas",
  registration_closed: "Inscripciones cerradas",
  bracket_generated: "Cuadro generado",
  in_progress: "En curso",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

export function tournamentStatusLabel(status: string): string {
  return TOURNAMENT_STATUS_LABELS[status] ?? status;
}

export const TOURNAMENT_STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  draft: "outline",
  registration_open: "success",
  registration_closed: "warning",
  bracket_generated: "secondary",
  in_progress: "primary",
  completed: "default",
  cancelled: "danger",
};

export function tournamentStatusBadgeVariant(status: string): BadgeProps["variant"] {
  return TOURNAMENT_STATUS_BADGE_VARIANT[status] ?? "default";
}

export const TOURNAMENT_VISIBILITY_LABELS: Record<string, string> = {
  public: "Público",
  private: "Privado",
};

export function tournamentVisibilityLabel(visibility: string): string {
  return TOURNAMENT_VISIBILITY_LABELS[visibility] ?? visibility;
}

// Bloque 2.2.1A — category is always the single/superior code, secondary
// only present for a combined tournament. Never "Suma N" or any other
// commercial name — that's a separate, not-yet-approved product decision.
export function tournamentCategoryLabel(category: string, secondaryCategory: string | null): string {
  return secondaryCategory ? `${category} + ${secondaryCategory}` : category;
}

// Bloque 2.3 — tournament_matches.status values, audited directly from
// tournament_matches_valid_status (20260907000001_tournament_matches_table.sql).
export const TOURNAMENT_MATCH_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  scheduled: "Programado",
  in_progress: "En curso",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

export function tournamentMatchStatusLabel(status: string): string {
  return TOURNAMENT_MATCH_STATUS_LABELS[status] ?? status;
}

export const TOURNAMENT_MATCH_STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  pending: "outline",
  scheduled: "secondary",
  in_progress: "primary",
  completed: "success",
  cancelled: "danger",
};

export function tournamentMatchStatusBadgeVariant(status: string): BadgeProps["variant"] {
  return TOURNAMENT_MATCH_STATUS_BADGE_VARIANT[status] ?? "default";
}
