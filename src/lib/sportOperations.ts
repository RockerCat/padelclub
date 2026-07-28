// Single source of truth for the point-adjustment reason catalog and the
// category-change type catalog — shared by the admin forms (client, builds
// the selectors) and the authoritative validation inside
// adjust_club_player_points / change_club_player_category (server,
// SECURITY DEFINER, 20260822000001). The client never gets to invent a
// code of its own; it only picks one of these and types a note, same
// pattern as reservationRejection.ts.

export const POINT_ADJUSTMENT_REASONS = [
  { code: "internal_league", label: "Liga interna" },
  { code: "coach_clinic", label: "Clínica con el entrenador" },
  { code: "no_show_penalty", label: "Sanción por no presentarse" },
  { code: "club_representation_bonus", label: "Bonus por representar al club" },
  { code: "special_event", label: "Evento especial" },
  { code: "other", label: "Otro" },
] as const;

export type PointAdjustmentReasonCode = (typeof POINT_ADJUSTMENT_REASONS)[number]["code"];

export const CATEGORY_CHANGE_TYPES = [
  { code: "promotion", label: "Ascenso" },
  { code: "demotion", label: "Descenso" },
  { code: "correction", label: "Corrección administrativa" },
] as const;

export type CategoryChangeType = (typeof CATEGORY_CHANGE_TYPES)[number]["code"];

export const SPORT_NOTE_MAX_LENGTH = 500;

// Same control-character sanitization as reservationRejection.ts —
// shape-only, never HTML stripping (React already escapes on render).
const CONTROL_CHARS_PATTERN = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(127) + "]",
  "g"
);

export function sanitizeSportNote(raw: string): string {
  return raw.replace(CONTROL_CHARS_PATTERN, " ").trim();
}
