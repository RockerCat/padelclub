// Single source of truth for reservation-rejection reasons — shared by the
// reject modal (client, builds the selector) and rejectPendingReservation
// (server, authoritative validation). The client never gets to compose the
// final player-facing text on its own; it only picks a code and types an
// optional/required comment, and validateRejectionInput turns that into the
// stored rejection_reason server-side.

export const REJECTION_REASONS = [
  { code: "court_unavailable", label: "Cancha no disponible" },
  { code: "court_maintenance", label: "Cancha en mantenimiento" },
  { code: "schedule_unavailable", label: "Horario no disponible" },
  { code: "club_event", label: "Evento o torneo del club" },
  { code: "duplicate_request", label: "Solicitud duplicada" },
  { code: "other", label: "Otro motivo" },
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASONS)[number]["code"];

export const REJECTION_REASON_LABELS: Record<RejectionReasonCode, string> =
  Object.fromEntries(REJECTION_REASONS.map((r) => [r.code, r.label])) as Record<
    RejectionReasonCode,
    string
  >;

export const REJECTION_COMMENT_MAX_LENGTH = 500;

function isRejectionReasonCode(value: string): value is RejectionReasonCode {
  return Object.prototype.hasOwnProperty.call(REJECTION_REASON_LABELS, value);
}

// Collapses stray control/non-printable characters to a space and trims —
// the text is only ever rendered as plain text (React auto-escapes), so
// this is shape sanitization, not HTML stripping.
const CONTROL_CHARS_PATTERN = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(127) + "]",
  "g"
);

function sanitizeComment(raw: string): string {
  return raw.replace(CONTROL_CHARS_PATTERN, " ").trim();
}

export type RejectionValidationResult =
  | { error: string }
  | { reasonCode: RejectionReasonCode; reasonText: string };

// For a predefined reason, the label itself is always a sufficient,
// player-readable explanation — the extra comment is optional and, when
// present, appended to it. "Otro motivo" has no label worth showing on its
// own, so the comment is mandatory and becomes the entire explanation.
export function validateRejectionInput(
  rawCode: string,
  rawComment: string
): RejectionValidationResult {
  if (!isRejectionReasonCode(rawCode)) {
    return { error: "Selecciona un motivo de rechazo." };
  }

  const comment = sanitizeComment(rawComment ?? "");
  if (comment.length > REJECTION_COMMENT_MAX_LENGTH) {
    return { error: "El comentario es demasiado largo." };
  }

  if (rawCode === "other") {
    if (!comment) {
      return { error: "Escribe el motivo del rechazo." };
    }
    return { reasonCode: rawCode, reasonText: comment };
  }

  const label = REJECTION_REASON_LABELS[rawCode];
  const reasonText = comment ? `${label}: ${comment}` : label;
  return { reasonCode: rawCode, reasonText };
}
