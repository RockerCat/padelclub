import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { Tournament } from "../types/domain";
import { pairLabel } from "./classification";
import type { TournamentClassificationRow } from "./entries";

// Portado de src/app/(app)/[club]/admin/tournaments/actions.ts +
// src/components/tournaments/TournamentDetailView.tsx (app web) — mismo
// tournamentErrorMessage, mismas validaciones de parseTournamentFields
// (sin el parseo de FormData, que es específico de Next.js), mismos 11
// RPCs de nivel torneo (create/update/cover + las 8 transiciones de
// ciclo de vida), mismo copy exacto de cada confirmación, mismo mensaje
// de WhatsApp. La app web envuelve estas mismas funciones con
// requireAdminRole (sesión + rol, específico de Next.js/cookies) y
// revalidatePath después de una mutación exitosa — ninguna de las dos
// cosas es lógica de negocio pura, así que se quedan en la Server Action
// de WEB; mobile llama estas funciones directo, con RLS/el propio RPC
// como la autoridad real (mismo patrón ya establecido en el resto de
// mutaciones portadas de este proyecto).

export function tournamentErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "No tienes permisos para realizar esta acción.";
  if (error.code === "P0002") return "El torneo no existe o ya no está disponible.";
  if (error.code === "P0005") return "Este club se encuentra archivado.";

  if (error.code === "22023") {
    const msg = error.message ?? "";

    if (msg.includes("modified concurrently") || msg.includes("changed concurrently")) {
      return "El torneo fue actualizado por otra persona. Recarga la información e inténtalo nuevamente.";
    }
    if (
      msg.includes("not in an editable state") ||
      msg.includes("no longer in draft") ||
      msg.includes("Only a draft tournament") ||
      msg.includes("Only a tournament with open registration") ||
      msg.includes("Only a tournament with closed registration") ||
      msg.includes("cannot be cancelled in its current state") ||
      msg.includes("registration is no longer open") ||
      msg.includes("registration is no longer closed")
    ) {
      return "El torneo cambió de estado y esta acción ya no está disponible.";
    }
    if (msg.includes("Tournament registration window has closed")) {
      return "Las inscripciones de este torneo ya cerraron.";
    }
    if (msg.includes("At least 2 confirmed pairs are required to close registration")) {
      return "Se requieren al menos 2 duplas inscritas para cerrar las inscripciones.";
    }
    if (msg.includes("Only a completed or cancelled tournament can be archived")) {
      return "Solo un torneo finalizado o cancelado puede archivarse.";
    }
    if (msg.includes("Tournament is already archived")) {
      return "Este torneo ya está archivado.";
    }
    if (msg.includes("Tournament is not archived")) {
      return "Este torneo no está archivado.";
    }
    // "secondary_category cannot change..." es superstring de "category
    // cannot change...", así que la variante más específica va primero o
    // nunca se alcanzaría.
    if (msg.includes("secondary_category cannot change once registration is open")) {
      return "La categoría secundaria ya no puede modificarse porque las inscripciones están abiertas.";
    }
    if (msg.includes("category cannot change once registration is open")) {
      return "La categoría ya no puede modificarse porque las inscripciones están abiertas.";
    }
    if (msg.includes("registration_opens_at cannot change once registration is open")) {
      return "La apertura de inscripciones ya no puede modificarse porque las inscripciones están abiertas.";
    }
    if (msg.includes("cannot change once registration is open")) {
      return "Este campo ya no puede modificarse porque las inscripciones están abiertas.";
    }
    if (msg.includes("name cannot be blank")) return "El nombre del torneo es obligatorio.";
    if (msg.includes("Invalid tournament category combination")) {
      return "La combinación de categorías no es válida: la categoría principal debe ser superior a la secundaria.";
    }
    if (msg.includes("Invalid category")) return "Selecciona una categoría válida.";
    if (msg.includes("Invalid max pairs")) return "Un torneo debe permitir al menos 2 duplas.";
    if (msg.includes("Invalid entry fee amount")) {
      return "El valor de inscripción debe ser un número entero mayor o igual a 0.";
    }
    const activeEntriesMatch = msg.match(/max_pairs cannot be less than (\d+) active tournament entries/);
    if (activeEntriesMatch) {
      return `El cupo máximo no puede ser menor que las ${activeEntriesMatch[1]} duplas activas registradas.`;
    }
    if (msg.includes("Invalid visibility")) return "Selecciona una visibilidad válida.";
    if (msg.includes("registration_opens_at must be before registration_closes_at")) {
      return "La apertura de inscripciones debe ser anterior a su cierre.";
    }
    if (msg.includes("Invalid estimated duration")) {
      return "La duración estimada debe ser mayor a cero.";
    }
    if (msg.includes("registration_closes_at must not be after starts_at")) {
      return "El cierre de inscripciones no puede ser posterior al inicio del torneo.";
    }
    if (msg.includes("schedule is not fully configured")) {
      return "Completa todas las fechas del torneo (inscripción e inicio/fin) antes de abrir las inscripciones.";
    }
    if (msg.includes("needs at least one confirmed pair to start")) {
      return "El torneo necesita al menos una dupla confirmada para iniciar.";
    }
    if (msg.includes("has no confirmed entries")) {
      return "El torneo no tiene duplas confirmadas.";
    }
    if (msg.includes("inconsistent state")) {
      return "Los puntos de este torneo están en un estado inconsistente. Contacta a soporte.";
    }
    return "Datos inválidos.";
  }

  return "No fue posible completar la acción. Inténtalo de nuevo.";
}

// ─── Formulario de creación/edición ─────────────────────────────────────────

export type CreateTournamentFields = {
  name: string;
  description: string | null;
  category: string;
  secondaryCategory: string | null;
  maxPairs: number;
  visibility: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startsAt: string | null;
  estimatedDurationMinutes: number;
  prizeDescription: string | null;
  entryFeeAmount: number;
  // WEB puede traer una portada ya subida en el propio formulario de
  // creación (TournamentImageUpload, subida de archivo — UI que se queda
  // fuera de shared); mobile no tiene selector de imágenes en el
  // formulario de creación (solo en EditTournamentCoverModal, después de
  // creado el torneo) y siempre pasa null aquí — diferencia de
  // plataforma real y documentada, no una regla de negocio distinta.
  coverImageUrl?: string | null;
};

// Portado de parseTournamentFields (app web) — mismas validaciones
// exactas, sin el parseo de FormData (específico de Next.js; WEB sigue
// haciendo ese parseo antes de llamar a esto, mobile arma el mismo objeto
// directo desde su propio estado de formulario). create_tournament/
// update_tournament revalidan todo esto igual server-side — nunca la
// única fuente de verdad, solo la primera capa.
export function validateCreateTournamentFields(f: CreateTournamentFields): string | null {
  if (!f.name.trim()) return "El nombre del torneo es obligatorio.";
  if (!f.category) return "Selecciona una categoría.";
  if (f.secondaryCategory && f.secondaryCategory === f.category) {
    return "La categoría secundaria debe ser distinta de la principal.";
  }
  if (!Number.isInteger(f.maxPairs) || f.maxPairs < 2) return "Un torneo debe permitir al menos 2 duplas.";
  if (!Number.isInteger(f.entryFeeAmount) || f.entryFeeAmount < 0) {
    return "El valor de inscripción debe ser un número entero mayor o igual a 0.";
  }
  if (!["public", "private"].includes(f.visibility)) return "Selecciona una visibilidad válida.";
  if (!Number.isInteger(f.estimatedDurationMinutes) || f.estimatedDurationMinutes < 1) {
    return "La duración estimada debe ser mayor a cero.";
  }
  if (f.registrationOpensAt && f.registrationClosesAt && f.registrationOpensAt >= f.registrationClosesAt) {
    return "La apertura de inscripciones debe ser anterior a su cierre.";
  }
  if (f.registrationClosesAt && f.startsAt && f.registrationClosesAt > f.startsAt) {
    return "El cierre de inscripciones no puede ser posterior al inicio del torneo.";
  }
  return null;
}

// Portado de structuralFieldsLocked (TournamentForm.tsx, app web) —
// categoría/categoría secundaria/apertura de inscripciones se congelan en
// solo-lectura una vez que las inscripciones están abiertas o cerradas
// (update_tournament las rechaza server-side a partir de ahí).
export function isStructuralFieldsLocked(status: string): boolean {
  return status === "registration_open" || status === "registration_closed";
}

export async function createTournament(
  supabase: SupabaseClient<Database>,
  clubId: string,
  f: CreateTournamentFields
): Promise<{ tournament: Tournament | null; error: string | null }> {
  const validationError = validateCreateTournamentFields(f);
  if (validationError) return { tournament: null, error: validationError };

  const { data, error } = await supabase.rpc("create_tournament", {
    p_club_id: clubId,
    p_name: f.name.trim(),
    p_category: f.category,
    p_max_pairs: f.maxPairs,
    p_description: f.description ?? undefined,
    p_visibility: f.visibility,
    p_registration_opens_at: f.registrationOpensAt ?? undefined,
    p_registration_closes_at: f.registrationClosesAt ?? undefined,
    p_starts_at: f.startsAt ?? undefined,
    p_estimated_duration_minutes: f.estimatedDurationMinutes,
    p_secondary_category: f.secondaryCategory ?? undefined,
    p_prize_description: f.prizeDescription ?? undefined,
    p_cover_image_url: f.coverImageUrl ?? undefined,
    p_entry_fee_amount: f.entryFeeAmount,
  });

  if (error) return { tournament: null, error: tournamentErrorMessage(error) };
  return { tournament: (data?.[0] as Tournament | undefined) ?? null, error: null };
}

export async function updateTournament(
  supabase: SupabaseClient<Database>,
  tournamentId: string,
  f: CreateTournamentFields
): Promise<{ tournament: Tournament | null; error: string | null }> {
  const validationError = validateCreateTournamentFields(f);
  if (validationError) return { tournament: null, error: validationError };

  // SQL acepta NULL para estos parámetros obligatorios; los tipos
  // generados de Supabase no lo reflejan (marcan `string`, sin `| null`).
  const { data, error } = await supabase.rpc("update_tournament", {
    p_tournament_id: tournamentId,
    p_name: f.name.trim(),
    p_description: f.description as string,
    p_category: f.category,
    p_max_pairs: f.maxPairs,
    p_visibility: f.visibility,
    p_registration_opens_at: f.registrationOpensAt as string,
    p_registration_closes_at: f.registrationClosesAt as string,
    p_starts_at: f.startsAt as string,
    p_estimated_duration_minutes: f.estimatedDurationMinutes,
    p_secondary_category: f.secondaryCategory as string,
    p_prize_description: f.prizeDescription as string,
    p_cover_image_url: (f.coverImageUrl ?? null) as string,
    p_entry_fee_amount: f.entryFeeAmount,
  });

  if (error) return { tournament: null, error: tournamentErrorMessage(error) };
  return { tournament: (data?.[0] as Tournament | undefined) ?? null, error: null };
}

export async function updateTournamentCoverImage(
  supabase: SupabaseClient<Database>,
  tournamentId: string,
  coverImageUrl: string | null
): Promise<{ tournament: Tournament | null; error: string | null }> {
  // SQL acepta NULL para p_cover_image_url (obligatorio); el tipo generado
  // de Supabase no lo refleja (marca `string`, sin `| null`).
  const { data, error } = await supabase.rpc("update_tournament_cover_image", {
    p_tournament_id: tournamentId,
    p_cover_image_url: coverImageUrl as string,
  });
  if (error) return { tournament: null, error: tournamentErrorMessage(error) };
  return { tournament: (data?.[0] as Tournament | undefined) ?? null, error: null };
}

// ─── Transiciones de ciclo de vida ───────────────────────────────────────────
// Portadas de las 8 acciones de ciclo de vida en actions.ts + el copy de
// ConfirmDialog/las condiciones can*/hasAnyAdminAction en
// TournamentDetailView.tsx (app web) — antes ambos existían solo como
// lógica inline dentro del componente de WEB (nunca extraída/exportada)
// y una reconstrucción manual en mobile; ahora es la única fuente para
// ambas plataformas.

export type TournamentTransitionKey =
  | "open"
  | "close"
  | "reopen"
  | "start"
  | "finalize"
  | "cancel"
  | "archive"
  | "restore";

const TRANSITION_RPC: Record<TournamentTransitionKey, string> = {
  open: "open_tournament_registration",
  close: "close_tournament_registration",
  reopen: "reopen_tournament_registration",
  start: "start_tournament",
  finalize: "finalize_tournament",
  cancel: "cancel_tournament",
  archive: "archive_tournament",
  restore: "restore_tournament",
};

// Copy exacto de los 8 ConfirmDialog de TournamentDetailView.tsx (app
// web) — título/mensaje/label de confirmación/variante (destructiva o
// no).
export const TOURNAMENT_TRANSITION_COPY: Record<
  TournamentTransitionKey,
  { title: string; message: string; confirmLabel: string; destructive: boolean }
> = {
  open: {
    title: "Abrir inscripciones",
    message:
      "Al abrir las inscripciones, la categoría, el número máximo de duplas y la fecha de apertura ya no podrán modificarse.",
    confirmLabel: "Abrir inscripciones",
    destructive: false,
  },
  close: {
    title: "Cerrar inscripciones",
    message: "Al cerrar las inscripciones ya no se podrán registrar nuevas duplas hasta que las reabras.",
    confirmLabel: "Cerrar inscripciones",
    destructive: false,
  },
  reopen: {
    title: "Reabrir inscripciones",
    message: "Los jugadores elegibles podrán volver a inscribirse. Las solicitudes ya rechazadas no se reactivan.",
    confirmLabel: "Reabrir inscripciones",
    destructive: false,
  },
  start: {
    title: "Iniciar torneo",
    message:
      'Al iniciar el torneo cambiará su estado a "En curso".\n\nLos partidos se juegan normalmente en la cancha y el club es libre de organizarlos como prefiera.\n\nAl finalizar el torneo, Mi Pádel Club registrará únicamente la clasificación final de las duplas para actualizar el ranking y generar automáticamente la noticia del torneo.',
    confirmLabel: "Iniciar torneo",
    destructive: false,
  },
  finalize: {
    title: "Finalizar torneo",
    message:
      "La clasificación actual quedará congelada. Cada integrante final de cada dupla recibirá la cantidad completa de puntos de su dupla en el ranking (no se dividen entre los dos). Esta acción no se puede deshacer ni se duplica si se ejecuta más de una vez.",
    confirmLabel: "Finalizar torneo",
    destructive: true,
  },
  cancel: {
    title: "¿Cancelar este torneo?",
    message: "Esta acción conservará el torneo como historial, pero no podrá continuar su operación.",
    confirmLabel: "Cancelar torneo",
    destructive: true,
  },
  archive: {
    title: "Archivar torneo",
    message:
      "El torneo se moverá a la pestaña Archivados y dejará de mezclarse con los demás torneos. Conserva toda su información e historial — puedes restaurarlo cuando quieras.",
    confirmLabel: "Archivar torneo",
    destructive: false,
  },
  restore: {
    title: "Restaurar torneo",
    message: "El torneo volverá a aparecer en la pestaña correspondiente a su estado actual.",
    confirmLabel: "Restaurar torneo",
    destructive: false,
  },
};

export const TOURNAMENT_TRANSITION_SUCCESS: Record<TournamentTransitionKey, string> = {
  open: "Inscripciones abiertas correctamente",
  close: "Inscripciones cerradas correctamente",
  reopen: "Inscripciones reabiertas correctamente",
  start: "Torneo iniciado — ¡en curso!",
  finalize: "Torneo finalizado y puntos aplicados al ranking.",
  cancel: "Torneo cancelado correctamente",
  archive: "Torneo archivado correctamente",
  restore: "Torneo restaurado correctamente",
};

// Mismas condiciones exactas de TournamentDetailView.tsx (canEdit/
// canOpenRegistration/canCloseRegistration/canReopenRegistration/
// canStart/canFinalize/canCancel/canArchive/canRestore) que deciden qué
// botones de acción aparecen según tournament.status/capacity/archived_at
// — colapsadas en un único array para que un caller que renderiza en
// loop (como mobile) no tenga que evaluar cada condición por separado;
// WEB puede seguir usando las condiciones individuales de abajo
// (canEditTournament, etc.) si su JSX por botón lo pide así, ambas
// devuelven exactamente el mismo resultado sobre los mismos datos.
export function availableTransitions(tournament: Tournament, capacity: { confirmed: number }): TournamentTransitionKey[] {
  const t: TournamentTransitionKey[] = [];
  if (tournament.archived_at) {
    t.push("restore");
    return t;
  }
  if (tournament.status === "draft") t.push("open");
  if (tournament.status === "registration_open" && capacity.confirmed >= 2) t.push("close");
  if (tournament.status === "registration_closed") t.push("reopen");
  if (tournament.status === "registration_closed" && capacity.confirmed >= 1) t.push("start");
  if (tournament.status === "in_progress") t.push("finalize");
  if (["draft", "registration_open", "registration_closed", "in_progress"].includes(tournament.status)) t.push("cancel");
  if (["completed", "cancelled"].includes(tournament.status)) t.push("archive");
  return t;
}

// Condiciones individuales, mismos nombres/criterio que las variables
// inline de TournamentDetailView.tsx (canOpenRegistration/
// canCloseRegistration/canReopenRegistration/canStart/canFinalize/
// canCancel) — para un caller que renderiza un botón dedicado por acción
// (como el JSX ya existente de WEB) en vez de recorrer availableTransitions
// en loop. Mismo resultado exacto que availableTransitions sobre los
// mismos datos, nunca una segunda regla.
export function canOpenRegistration(status: string): boolean {
  return status === "draft";
}
export function canCloseRegistration(status: string, capacity: { confirmed: number }): boolean {
  return status === "registration_open" && capacity.confirmed >= 2;
}
export function canReopenRegistration(status: string): boolean {
  return status === "registration_closed";
}
export function canStartTournament(status: string, capacity: { confirmed: number }): boolean {
  return status === "registration_closed" && capacity.confirmed >= 1;
}
export function canFinalizeTournament(status: string): boolean {
  return status === "in_progress";
}
export function canCancelTournament(status: string): boolean {
  return ["draft", "registration_open", "registration_closed", "in_progress"].includes(status);
}

export function canShareWhatsapp(status: string): boolean {
  return ["registration_open", "registration_closed", "in_progress"].includes(status);
}

// Mismo criterio que isStructuralFieldsLocked pero para la visibilidad
// del botón "Editar" en sí (nunca solo los 3 campos congelados): editable
// en draft/registration_open/registration_closed, nunca en
// in_progress/completed/cancelled.
export function canEditTournament(status: string): boolean {
  return ["draft", "registration_open", "registration_closed"].includes(status);
}

export function canArchiveTournament(status: string, archivedAt: string | null): boolean {
  return ["completed", "cancelled"].includes(status) && !archivedAt;
}

export function canRestoreTournament(archivedAt: string | null): boolean {
  return !!archivedAt;
}

// ─── Vigencia temporal ──────────────────────────────────────────────────────
// El status persistido sigue siendo la única fuente de verdad para el
// workflow ADMINISTRATIVO (nunca se auto-transiciona por tiempo — este MVP
// no tiene cron, ver CLAUDE.md → Tournament Module Principles), pero un
// torneo con status='registration_open' que nadie cerró/inició a tiempo
// nunca puede seguir aceptando inscripciones de un PLAYER ni presentarse
// como actividad futura, solo porque el status quedó desactualizado.
// registration_closes_at/starts_at ya son timestamptz reales (instantes
// absolutos, no fecha+hora locales separadas como reservations.date/
// start_time) — compararlos contra `now` es correcto en cualquier huso del
// proceso/dispositivo que ejecute esto, sin necesitar anclarlos a
// America/Bogota acá: esa conversión ya ocurrió una única vez, al guardar
// el valor original (ver shared/utils/bogotaDatetime.ts,
// bogotaWallClockToISO). `now` se recibe como parámetro (nunca `new Date()`
// interno) por el mismo motivo que shared/reservations/editPolicy.ts ya
// establece: mantiene la función pura y testeable.

// ¿Siguen las inscripciones REALMENTE abiertas en este instante?
// status='registration_open' sigue siendo necesario pero ya no suficiente
// — además debe faltar tiempo real hasta el cierre de inscripciones Y
// hasta el inicio del torneo. Única fuente para el CTA "Inscribirme" del
// PLAYER (EntriesSection, WEB y mobile) y para el chequeo equivalente en
// register_tournament_entry (mismo criterio expresado en plpgsql, nunca
// una segunda regla) — OWNER/ADMIN nunca pasa por esta función: su propia
// capacidad de registrar duplas sigue rigiéndose solo por status, sin
// ningún límite temporal nuevo.
export function isRegistrationTemporallyOpen(
  tournament: Pick<Tournament, "status" | "registration_closes_at" | "starts_at">,
  now: Date = new Date()
): boolean {
  if (tournament.status !== "registration_open") return false;
  if (tournament.registration_closes_at && now.getTime() >= new Date(tournament.registration_closes_at).getTime()) {
    return false;
  }
  if (tournament.starts_at && now.getTime() >= new Date(tournament.starts_at).getTime()) return false;
  return true;
}

// ¿Ya pasó el horario real de inicio de este torneo? Único criterio para
// decidir si un torneo con status='registration_open' quedó temporalmente
// atrás y por lo tanto ya no puede competir como "Próxima actividad" en
// el Dashboard del PLAYER (getUpcomingTournamentActivity,
// shared/players/playerDashboard.ts) — nunca se auto-finaliza/cancela el
// torneo por esto, solo deja de ofrecerse como actividad futura. Un
// torneo in_progress nunca se filtra por esto (empezar en el pasado es
// justamente lo que "en curso" significa).
export function hasTournamentStarted(tournament: Pick<Tournament, "starts_at">, now: Date = new Date()): boolean {
  if (!tournament.starts_at) return false;
  return now.getTime() >= new Date(tournament.starts_at).getTime();
}

// Estado EFECTIVO para la vista de un PLAYER — NUNCA para OWNER/ADMIN
// (cuyo badge/acciones siguen leyendo tournament.status real sin cambios,
// para que sigan encontrando "Cerrar inscripciones"/"Iniciar torneo" sobre
// el torneo real que necesitan operar). Un 'registration_open'
// temporalmente cerrado se percibe como 'registration_closed' — el
// siguiente status real que un admin habría fijado a tiempo — nunca se
// escribe en la base de datos, solo cambia qué badge/label ve un PLAYER.
// Cualquier otro status se devuelve sin cambios.
export function effectivePlayerTournamentStatus(
  tournament: Pick<Tournament, "status" | "registration_closes_at" | "starts_at">,
  now: Date = new Date()
): string {
  if (tournament.status === "registration_open" && !isRegistrationTemporallyOpen(tournament, now)) {
    return "registration_closed";
  }
  return tournament.status;
}

// Portados a un torneo ascendente/descendente por starts_at — mismo
// null-handling que compareTournaments (sort.ts): un torneo sin
// starts_at siempre queda al final del orden, nunca intercalado por
// comparar contra null/undefined.
function compareByStartsAtAsc(a: Tournament, b: Tournament): number {
  if (!a.starts_at && !b.starts_at) return 0;
  if (!a.starts_at) return 1;
  if (!b.starts_at) return -1;
  return a.starts_at.localeCompare(b.starts_at);
}

export interface PlayerTournamentBuckets {
  /** en vivo, inscripción abierta (vigente), o cerrada pero aún sin arrancar — orden: inicio más próximo primero. */
  active: Tournament[];
  /** status='completed' — orden: más reciente primero. */
  finished: Tournament[];
}

// Agrupa los torneos de un club en lo que un PLAYER necesita ver de forma
// compacta (Página del club, ver ClubHomeScreen.tsx/page.tsx) — nunca una
// tercera lógica temporal: reutiliza exactamente
// effectivePlayerTournamentStatus/hasTournamentStarted ya definidos arriba.
// "Activo" es en_vivo, o inscripción-abierta vigente, o inscripción-cerrada
// mientras el torneo todavía no arranca (el mismo caso que
// effectivePlayerTournamentStatus ya reconoce como "cerrada mientras
// espera" cuando viene de un registration_open vencido, más el caso real
// de un admin que cerró inscripciones a tiempo). draft/cancelled — y
// cualquier torneo archivado (archived_at) — nunca aparecen en ningún
// bucket, igual que PLAYER_TAB_ORDER (tabs.ts) ya los excluye del listado
// completo.
export function partitionPlayerTournaments(tournaments: Tournament[], now: Date = new Date()): PlayerTournamentBuckets {
  const visible = tournaments.filter((t) => !t.archived_at);

  const active = visible
    .filter((t) => {
      const displayStatus = effectivePlayerTournamentStatus(t, now);
      if (displayStatus === "in_progress" || displayStatus === "registration_open") return true;
      if (displayStatus === "registration_closed") return !hasTournamentStarted(t, now);
      return false;
    })
    .sort(compareByStartsAtAsc);

  const finished = visible.filter((t) => t.status === "completed").sort((a, b) => compareByStartsAtAsc(b, a));

  return { active, finished };
}

export async function runTournamentTransition(
  supabase: SupabaseClient<Database>,
  key: TournamentTransitionKey,
  tournamentId: string
): Promise<{ tournament: Tournament | null; alreadyFinalized: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc(TRANSITION_RPC[key] as any, { p_tournament_id: tournamentId } as any);
  if (error) {
    // Antes solo 6 de las 8 transiciones logueaban el error crudo en WEB
    // (inconsistente entre funciones); ahora todas lo hacen igual, desde
    // el único lugar real donde ocurre la llamada.
    console.error(`[runTournamentTransition:${key}] RPC error:`, {
      code: error.code,
      message: error.message,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
    });
    return { tournament: null, alreadyFinalized: false, error: tournamentErrorMessage(error) };
  }
  // finalize_tournament devuelve {tournament_id, already_finalized,
  // entries_awarded, movements_created} — no la fila completa del torneo
  // (a diferencia de las otras 7 transiciones). El caller debe recargar
  // el torneo tras finalizar, igual que TournamentDetailView.tsx hace un
  // router.refresh() en vez de confiar en el valor de retorno del RPC.
  if (key === "finalize") {
    const row = data?.[0] as { already_finalized?: boolean } | undefined;
    return { tournament: null, alreadyFinalized: row?.already_finalized ?? false, error: null };
  }
  const row = data?.[0] as Tournament | undefined;
  return { tournament: row ?? null, alreadyFinalized: false, error: null };
}

// ─── Mensaje de WhatsApp ──────────────────────────────────────────────────────
// Portado de buildWhatsappShareMessage (TournamentDetailView.tsx, app
// web) — mismo orden de bloques exacto, usa el pairLabel canónico
// (fallback "Jugador") de ./classification. El caller sigue siendo
// responsable de un único encodeURIComponent al armar el href de
// api.whatsapp.com/send (nunca wa.me — ver CLAUDE.md → WhatsApp Share
// Principles), esta función solo construye el texto del mensaje.
export function buildTournamentWhatsappMessage(params: {
  clubName: string;
  clubSlug: string;
  tournament: Tournament;
  classification: TournamentClassificationRow[];
  siteUrl: string;
}): string {
  const { clubName, clubSlug, tournament, classification, siteUrl } = params;
  const isOpen = tournament.status === "registration_open";
  const blocks: string[] = [];

  if (isOpen) {
    blocks.push(`Ya puedes inscribirte al nuevo torneo en ${clubName}: ${tournament.name}.`);
    blocks.push("No te quedes por fuera.");
  } else {
    blocks.push(`Mira cómo va el nuevo torneo en ${clubName}: ${tournament.name}.`);
  }

  if (tournament.description) blocks.push(tournament.description);
  if (tournament.prize_description) blocks.push(`Premios:\n${tournament.prize_description}`);

  if (isOpen) {
    const feeLabel =
      tournament.entry_fee_amount <= 0
        ? "Gratis"
        : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
            tournament.entry_fee_amount
          );
    blocks.push(`Inscripción: ${feeLabel}`);
  }

  if (classification.length > 0) {
    const pairLines = classification.map((row) =>
      tournament.status === "in_progress" ? `${pairLabel(row.entry)} — ${row.entry.points} pts` : pairLabel(row.entry)
    );
    blocks.push(`Duplas registradas:\n${pairLines.join("\n")}`);
  }

  blocks.push(`${siteUrl}/${clubSlug}/tournaments/${tournament.slug}`);

  return blocks.join("\n\n");
}
