import type { Tournament } from "../types/domain";

// Extraído de TournamentsGrid.tsx (app web) — antes vivía inline dentro
// del componente (nunca exportado), portado a mano en mobile. Ahora es la
// única fuente para ambas plataformas.
//
// "archived" no es un valor real de tournaments.status — es ortogonal
// (archived_at IS NOT NULL), así que tiene su propia clave de tab
// sintética aquí, filtrada distinto (ver tournamentsForTab). Cualquier
// otra clave es un valor real de status, siempre filtrado también con
// `!t.archived_at`, así que un torneo archivado — sin importar su status
// real — nunca aparece también en uno de los otros seis tabs (sin
// duplicados).
export type TabKey =
  | "draft"
  | "registration_open"
  | "registration_closed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "archived";

export const ADMIN_TAB_ORDER: { key: TabKey; label: string }[] = [
  { key: "draft", label: "Borradores" },
  { key: "registration_open", label: "Inscripciones abiertas" },
  { key: "registration_closed", label: "Inscripciones cerradas" },
  { key: "in_progress", label: "En vivo" },
  { key: "completed", label: "Finalizados" },
  { key: "cancelled", label: "Cancelados" },
  { key: "archived", label: "Archivados" },
];

// PLAYER nunca ve Borradores (un torneo sin publicar) ni Archivados (un
// torneo que el club retiró de su operación normal) — mismo orden que el
// de OWNER/ADMIN para el resto, solo con esos dos tabs quitados.
export const PLAYER_TAB_ORDER: { key: TabKey; label: string }[] = ADMIN_TAB_ORDER.filter(
  ({ key }) => key !== "draft" && key !== "archived"
);

export function tournamentsForTab(tournaments: Tournament[], key: TabKey): Tournament[] {
  return tournaments.filter((t) => (key === "archived" ? !!t.archived_at : t.status === key && !t.archived_at));
}

// En vivo gana siempre que exista al menos un torneo en ese estado; si
// no, el primer tab (en el orden dado) que tenga al menos un torneo. Con
// el club totalmente vacío no importa cuál quede activo (no hay nada que
// mostrar), así que cae en el primero por simplicidad.
export function resolveDefaultTab(tournaments: Tournament[], tabOrder: { key: TabKey; label: string }[]): TabKey {
  if (tournamentsForTab(tournaments, "in_progress").length > 0) return "in_progress";
  for (const { key } of tabOrder) {
    if (tournamentsForTab(tournaments, key).length > 0) return key;
  }
  return tabOrder[0].key;
}
