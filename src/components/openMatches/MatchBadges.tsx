import { CheckCircle2, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui";
import {
  openMatchCourtLabel,
  openMatchPhaseLabel,
  type OpenMatchCourtStatus,
  type OpenMatchPhase,
} from "@/lib/openMatches";

// Dos estados distintos, siempre mostrados por separado: conformación de
// jugadores (fase) y confirmación de cancha (declarada por el organizador,
// nunca una disponibilidad que la plataforma afirme).

const PHASE_VARIANT: Record<OpenMatchPhase, "primary" | "success" | "default" | "danger"> = {
  open: "primary",
  full: "success",
  finished: "default",
  cancelled: "danger",
};

export function MatchPhaseBadge({ phase }: { phase: OpenMatchPhase }) {
  return (
    <Badge variant={PHASE_VARIANT[phase]} size="sm">
      {openMatchPhaseLabel(phase)}
    </Badge>
  );
}

export function MatchCourtBadge({ status }: { status: OpenMatchCourtStatus }) {
  const Icon = status === "booked" ? CheckCircle2 : CircleDashed;
  return (
    <Badge variant={status === "booked" ? "success" : "outline"} size="sm">
      <Icon className="h-3 w-3" />
      {openMatchCourtLabel(status)}
    </Badge>
  );
}

/** 4 puntos: ocupados (jugadores + invitados) vs. libres. */
export function SpotsDots({ taken, max }: { taken: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${taken} de ${max} jugadores`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={i < taken ? "h-2.5 w-2.5 rounded-full bg-brand-primary" : "h-2.5 w-2.5 rounded-full border border-white/30"}
        />
      ))}
    </span>
  );
}
