// Comercial v2 / Fase 6 — badge de estado comercial para Platform Superadmin
// (/platform/clubs, /platform/subscriptions, /platform/clubs/[clubId]).
//
// Reutiliza deriveCommercialPhase (lifecycle.ts) — nunca reimplementa la
// regla de trial/gracia/past_due/suspended. Esto SOLO agrega copy/tono
// pensado para la audiencia SUPERADMIN, que es deliberadamente distinta de
// la copy OWNER-facing (PHASE_LABEL en src/app/(app)/[club]/subscription/
// page.tsx): un OWNER solo necesita saber "¿tengo acceso?" (por eso
// no_subscription se muestra como "Activo" ahí — ver ese archivo), pero
// SUPERADMIN necesita distinguir explícitamente un club legacy (nunca pagó,
// nunca tuvo trial) de uno con una suscripción real — por eso acá
// no_subscription es su propio estado visual, "Legacy".

import { deriveCommercialPhase, type CommercialPhase, type CommercialPhaseInput } from "./lifecycle";

export type PlatformBadgeVariant = "default" | "primary" | "secondary" | "success" | "warning" | "danger" | "outline";

export interface PlatformCommercialBadge {
  phase: CommercialPhase;
  label: string;
  variant: PlatformBadgeVariant;
}

const PLATFORM_PHASE_META: Record<CommercialPhase, { label: string; variant: PlatformBadgeVariant }> = {
  no_subscription: { label: "Legacy", variant: "default" },
  trial: { label: "Trial", variant: "primary" },
  trial_grace: { label: "Gracia trial", variant: "warning" },
  active: { label: "Activo", variant: "success" },
  past_due: { label: "Past due", variant: "warning" },
  suspended: { label: "Suspendido", variant: "danger" },
  // 'cancelled' u otro valor sin decisión de producto (ver CLAUDE.md) —
  // nunca se inventa un estado, se muestra de forma neutra y defensiva.
  unrecognized: { label: "Sin definir", variant: "default" },
};

export function getPlatformCommercialBadge(input: CommercialPhaseInput): PlatformCommercialBadge {
  const { phase } = deriveCommercialPhase(input);
  return { phase, ...PLATFORM_PHASE_META[phase] };
}

export const PLATFORM_COMMERCIAL_FILTER_OPTIONS: { value: "all" | CommercialPhase; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "no_subscription", label: "Legacy" },
  { value: "trial", label: "Trial" },
  { value: "trial_grace", label: "Gracia trial" },
  { value: "active", label: "Activo" },
  { value: "past_due", label: "Past due" },
  { value: "suspended", label: "Suspendido" },
];
