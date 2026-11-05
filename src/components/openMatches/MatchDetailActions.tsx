"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Pencil, Plus, UserPlus } from "lucide-react";
import { Button, ConfirmDialog } from "@/components/ui";
import { ReservationShareActions } from "@/components/reservations/ReservationShareActions";
import { MatchForm } from "./MatchForm";
import {
  OPEN_MATCH_MAX_PLAYERS,
  buildOpenMatchWhatsappMessage,
  openMatchPath,
  type OpenMatch,
} from "@/lib/openMatches";
import {
  cancelOpenMatchAction,
  confirmOpenMatchAttendanceAction,
  joinOpenMatchAction,
  leaveOpenMatchAction,
  setOpenMatchGuestsAction,
  updateOpenMatchAction,
  type OpenMatchActionResult,
} from "@/app/(player)/partidos/actions";

interface MatchDetailActionsProps {
  match: OpenMatch;
  isAuthenticated: boolean;
  /** Recién creado: resalta el bloque de compartir. */
  justCreated?: boolean;
}

// Todas las acciones del detalle, adaptadas a quien mira: visitante,
// jugador sin cupo tomado, participante u organizador. Cada acción llama a
// un Server Action → RPC; tras el éxito se refresca la vista en el lugar
// (nunca una redirección).
export function MatchDetailActions({ match, isAuthenticated, justCreated }: MatchDetailActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const path = openMatchPath(match.id);
  const url = origin ? `${origin}${path}` : path;
  const active = match.phase === "open" || match.phase === "full";
  const isParticipant = match.viewerIsParticipant;
  const isOrganizer = match.viewerIsOrganizer;
  const activePlayers = match.taken - match.guestCount;

  async function run(key: string, action: () => Promise<OpenMatchActionResult>) {
    setPending(key);
    setError(null);
    const result = await action();
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      router.refresh();
      return false;
    }
    router.refresh();
    return true;
  }

  const share = active && (
    <div
      className={`rounded-2xl border p-4 ${justCreated ? "border-brand-primary/50 bg-brand-primary/5" : "border-white/10 bg-brand-surface"}`}
    >
      <p className="text-sm font-semibold text-white">
        {justCreated ? "¡Partido publicado! Compártelo para completar los cupos" : "Invita jugadores"}
      </p>
      <p className="mb-3 mt-0.5 text-xs text-brand-muted">
        Quien abra el enlace verá el partido y podrá unirse con su cuenta.
      </p>
      <ReservationShareActions url={url} message={buildOpenMatchWhatsappMessage(match, url)} />
    </div>
  );

  // ─── Visitante sin sesión ──────────────────────────────────────────────
  if (!isAuthenticated) {
    const next = encodeURIComponent(path);
    return (
      <div className="flex flex-col gap-3">
        {active && match.phase === "open" ? (
          <div className="rounded-2xl border border-brand-primary/30 bg-brand-primary/5 p-4">
            <p className="text-sm font-semibold text-white">¿Te sumas?</p>
            <p className="mt-0.5 text-xs text-brand-muted">Crea tu cuenta gratis o inicia sesión para tomar un cupo.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Link
                href={`/auth/signup?next=${next}`}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-brand-bg hover:brightness-110"
              >
                <UserPlus className="h-4 w-4" /> Crear cuenta y unirme
              </Link>
              <Link
                href={`/auth/login?next=${next}`}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-white/20 px-4 text-sm font-semibold text-white hover:bg-white/5"
              >
                Ya tengo cuenta
              </Link>
            </div>
          </div>
        ) : null}
        {share}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Reconfirmación tras un cambio de horario */}
      {active && isParticipant && match.viewerNeedsReconfirm && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-200">El organizador cambió el horario o la ciudad</p>
          <p className="mt-0.5 text-xs text-amber-100/80">
            Tu cupo sigue reservado. Confirma si puedes con los nuevos datos o libéralo para otro jugador.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              loading={pending === "confirm"}
              disabled={!!pending}
              onClick={() => run("confirm", () => confirmOpenMatchAttendanceAction(match.id))}
            >
              Sí, puedo
            </Button>
            <Button className="flex-1" variant="secondary" disabled={!!pending} onClick={() => setConfirmLeave(true)}>
              No puedo, liberar cupo
            </Button>
          </div>
        </div>
      )}

      {/* Unirse */}
      {active && !isParticipant && (
        match.phase === "open" ? (
          <Button
            size="lg"
            loading={pending === "join"}
            disabled={!!pending}
            onClick={() => run("join", () => joinOpenMatchAction(match.id))}
          >
            <UserPlus className="h-4 w-4" /> Unirme al partido
          </Button>
        ) : (
          <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-sm text-brand-muted">
            El partido está completo. Si alguien sale, se libera el cupo.
          </p>
        )
      )}

      {active && isParticipant && !isOrganizer && !match.viewerNeedsReconfirm && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-sm font-medium text-emerald-300">Estás dentro de este partido.</p>
          <Button variant="ghost" size="sm" disabled={!!pending} onClick={() => setConfirmLeave(true)}>
            Salir
          </Button>
        </div>
      )}

      {/* Organizador */}
      {active && isOrganizer && !editing && (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-surface p-4">
          <p className="text-sm font-semibold text-white">Administra tu partido</p>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-white">Acompañantes sin cuenta</p>
              <p className="text-xs text-brand-muted">Ocupan cupo sin datos personales. Bájalos para liberar cupos.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                aria-label="Quitar acompañante"
                disabled={!!pending || match.guestCount <= 0}
                onClick={() => run("guests", () => setOpenMatchGuestsAction(match.id, match.guestCount - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-5 text-center text-sm font-semibold text-white" aria-live="polite">
                {match.guestCount}
              </span>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Agregar acompañante"
                disabled={!!pending || match.guestCount >= 3 || activePlayers + match.guestCount >= OPEN_MATCH_MAX_PLAYERS}
                onClick={() => run("guests", () => setOpenMatchGuestsAction(match.id, match.guestCount + 1))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-white/5 pt-3 sm:flex-row">
            <Button className="flex-1" variant="secondary" disabled={!!pending} onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Editar lugar, horario o cancha
            </Button>
            <Button className="flex-1" variant="danger" disabled={!!pending} onClick={() => setConfirmCancel(true)}>
              Cancelar partido
            </Button>
          </div>
        </div>
      )}

      {active && isOrganizer && editing && (
        <div className="rounded-2xl border border-white/10 bg-brand-surface p-4">
          <p className="mb-3 text-sm font-semibold text-white">Editar partido</p>
          <MatchForm
            mode="edit"
            submitLabel="Guardar cambios"
            initial={{
              city: match.city,
              matchDate: match.matchDate,
              startTime: match.startTime,
              level: match.level,
              venueName: match.venueName ?? "",
              venueId: match.venue?.id ?? null,
              comment: match.comment ?? "",
              courtBooked: match.courtStatus === "booked",
            }}
            initialVenue={
              match.venue
                ? {
                    id: match.venue.id,
                    name: match.venue.name,
                    municipality: match.venue.municipality,
                    address: match.venue.address,
                    isPublished: match.venue.isPublished,
                  }
                : null
            }
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              const result = await updateOpenMatchAction(match.id, values, {
                clearVenue: !!match.venue && !values.venueId,
              });
              if (!result.ok) return result.error;
              setEditing(false);
              router.refresh();
              return null;
            }}
          />
        </div>
      )}

      {share}

      <ConfirmDialog
        open={confirmCancel}
        title="¿Cancelar el partido?"
        message="Los jugadores verán el partido como cancelado. Esta acción no se puede deshacer."
        confirmLabel="Sí, cancelar"
        cancelLabel="Volver"
        confirmVariant="danger"
        loading={pending === "cancel"}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={async () => {
          await run("cancel", () => cancelOpenMatchAction(match.id));
          setConfirmCancel(false);
        }}
      />
      <ConfirmDialog
        open={confirmLeave}
        title="¿Salir del partido?"
        message="Tu cupo quedará libre para otro jugador. Puedes volver a unirte si sigue habiendo cupo."
        confirmLabel="Sí, salir"
        cancelLabel="Volver"
        confirmVariant="danger"
        loading={pending === "leave"}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={async () => {
          await run("leave", () => leaveOpenMatchAction(match.id));
          setConfirmLeave(false);
        }}
      />
    </div>
  );
}
