// Comercial v2 / Fase 3 — derivación PURAMENTE de visualización del "momento
// comercial" de un club, para decidir qué banner mostrarle al OWNER.
//
// Esto NUNCA es la autoridad — la autoridad real sigue siendo
// `club_subscriptions.status` en sí (server-side) más el entitlement ya
// existente de Fase 2 (`_require_commercial_access`/
// `get_club_commercial_access`), que esta función no reimplementa ni
// reemplaza. Esta función solo decide COPY, nunca ACCESO: durante
// `trial_grace` y `past_due` el entitlement ya permite crear (status es
// 'trialing'/'past_due', ninguno de los dos bloquea — ver CLAUDE.md →
// Commercial Subscription Principles); esta función solo ayuda a elegir
// qué banner mostrar mientras eso sigue permitido.
//
// Los plazos (gracia post-trial 14 días, gracia de past_due 30 días) se
// derivan de columnas que YA existen (`trial_ends_at`, `current_period_end`)
// — deliberadamente sin ninguna columna nueva de "grace_ends_at": el
// deadline siempre es una función pura de una fecha que ya no cambia una
// vez fijada (ver la migración de esta fase para la razón completa).

export type CommercialPhase =
  | "no_subscription" // club legacy, sin fila — nunca bloquea, nunca banner
  | "trial" // trial real, dentro de los 30 días — nunca banner
  | "trial_grace" // trial vencido, dentro de los 14 días de gracia — banner sin CTA de pago... con CTA "Pagar suscripción"
  | "active" // pagado y vigente — nunca banner
  | "past_due" // período pagado vencido, dentro de los 30 días de gracia — banner con CTA
  | "suspended" // bloqueado — banner con CTA "Reactivar suscripción"
  | "unrecognized"; // cancelled u otro valor sin comportamiento decidido todavía — nunca banner (ver CLAUDE.md, "cancelled" sin decisión de producto)

const TRIAL_GRACE_DAYS = 14;
const PAST_DUE_GRACE_DAYS = 30;

export interface CommercialPhaseInput {
  status: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  now?: Date;
}

export interface CommercialPhaseResult {
  phase: CommercialPhase;
  // Fecha límite a mostrar en el banner (fin de gracia), null cuando no aplica.
  graceDeadline: Date | null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function deriveCommercialPhase(input: CommercialPhaseInput): CommercialPhaseResult {
  const now = input.now ?? new Date();

  if (!input.status) {
    return { phase: "no_subscription", graceDeadline: null };
  }

  if (input.status === "suspended") {
    return { phase: "suspended", graceDeadline: null };
  }

  if (input.status === "trialing") {
    if (!input.trialEndsAt) return { phase: "trial", graceDeadline: null };
    const trialEndsAt = new Date(input.trialEndsAt);
    if (now <= trialEndsAt) return { phase: "trial", graceDeadline: null };
    // Vencido el trial real — gracia de 14 días, sin importar si ya pasó
    // (el cron diario es quien eventualmente pasa esto a 'suspended'; hasta
    // que lo haga, status sigue siendo 'trialing' y el entitlement sigue
    // permitiendo, así que el banner sigue siendo el de gracia, nunca el de
    // suspendido — nunca inventamos un séptimo estado para ese rezago).
    return { phase: "trial_grace", graceDeadline: addDays(trialEndsAt, TRIAL_GRACE_DAYS) };
  }

  if (input.status === "active") {
    return { phase: "active", graceDeadline: null };
  }

  if (input.status === "past_due") {
    const graceDeadline = input.currentPeriodEnd ? addDays(new Date(input.currentPeriodEnd), PAST_DUE_GRACE_DAYS) : null;
    return { phase: "past_due", graceDeadline };
  }

  // 'cancelled' u otro valor no contemplado — sin decisión de producto,
  // nunca inventar un banner acá.
  return { phase: "unrecognized", graceDeadline: null };
}

// ─── Pill de suscripción (sidebar OWNER) ───────────────────────────────────
// Reutiliza deriveCommercialPhase — nunca reimplementa la regla de
// trial/gracia/past_due/suspended. Esto solo agrega el COPY del pill sobre
// la misma fase ya derivada; la visibilidad (OWNER real, nunca ADMIN/
// PLAYER/SUPERADMIN con acceso elevado) la decide el caller (ver
// src/app/(app)/[club]/layout.tsx), no esta función.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ceil, nunca floor — con 25 horas restantes, floor mostraría "1 día"
// (un día menos de lo que realmente queda); ceil muestra "2 días", que es
// lo correcto mientras todavía queden horas de ese segundo día.
export function getTrialDaysRemaining(trialEndsAt: string, now: Date = new Date()): number {
  const diffMs = new Date(trialEndsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / MS_PER_DAY));
}

// Mismos nombres que las variantes del Badge compartido
// (src/components/ui/Badge.tsx) y la misma asignación fase→variante que ya
// usa /[club]/subscription/page.tsx (PHASE_LABEL) — el pill nunca inventa un
// segundo lenguaje visual para el mismo estado comercial. No se importa el
// tipo real de Badge acá porque este módulo es TS puro (sin React) — son
// los mismos 4 strings, verificados contra ese archivo.
export type CommercialPillTone = "default" | "warning" | "success" | "danger";

export interface CommercialPillContent {
  label: string;
  tone: CommercialPillTone;
}

// Copy + tono exacto del pill por fase. `null` = no mostrar ningún pill
// (club legacy sin suscripción, o 'cancelled'/valor sin decisión de
// producto).
export function getCommercialPillContent(input: CommercialPhaseInput): CommercialPillContent | null {
  const { phase } = deriveCommercialPhase(input);

  switch (phase) {
    case "trial": {
      if (!input.trialEndsAt) return null;
      const days = getTrialDaysRemaining(input.trialEndsAt, input.now ?? new Date());
      // días >= 2 → "N días de prueba". días <= 1 (0 a 24 horas restantes,
      // el mismo rango que "menos de 24 horas") → "Último día de prueba":
      // la copy final y más específica gana sobre "1 día de prueba" para
      // ese mismo rango — nunca se muestran ambas para el mismo momento.
      return { label: days >= 2 ? `${days} días de prueba` : "Último día de prueba", tone: "warning" };
    }
    case "trial_grace":
      return { label: "Prueba vencida", tone: "warning" };
    case "active":
      return { label: "Suscripción activa", tone: "success" };
    case "past_due":
      return { label: "Pago pendiente", tone: "warning" };
    case "suspended":
      return { label: "Suspendida", tone: "danger" };
    default:
      return null; // no_subscription / unrecognized (cancelled)
  }
}
