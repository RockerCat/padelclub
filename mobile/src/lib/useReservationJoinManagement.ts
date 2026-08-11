import { useState } from "react";
import { supabase } from "./supabase";
import {
  setReservationOpenStatus,
  approveReservationJoinRequest,
  rejectReservationJoinRequest,
  type PendingReservationJoinRequest,
} from "./reservationJoinRequests";

// Portado de useReservationJoinManagement.ts (app web) — único lugar donde
// vive el estado/manejo de "Abrir/Cerrar reserva" + "Solicitudes pendientes
// para unirse" (aprobar/rechazar), para que ReservationTicketPanel no
// reimplemente este wiring. La web lo comparte además con
// ReservationShareView (detalle compartido, PLAYER incluido) — ese caller
// no existe todavía en mobile (fuera de alcance, ver
// ReservationDetailScreen.tsx), así que hoy solo lo usa el panel
// OWNER/ADMIN, pero se porta 1:1 para que un futuro caller PLAYER-side lo
// reutilice sin divergir.
export function useReservationJoinManagement({
  reservationId,
  setPendingRequests,
  onToggled,
  onApproved,
  resetKey,
}: {
  reservationId: string;
  setPendingRequests: (updater: (prev: PendingReservationJoinRequest[]) => PendingReservationJoinRequest[]) => void;
  /** Llamado tras un cambio de is_open exitoso, con el nuevo valor. */
  onToggled?: (nextIsOpen: boolean) => void;
  /** Llamado tras una aprobación exitosa — una 4ta aprobación cierra la
   *  reserva automáticamente server-side, así que un caller con estado
   *  local más rico puede querer re-consultarlo. */
  onApproved?: () => void;
  /** Limpia errores/estado de "resolviendo" cuando este valor cambia, para
   *  que un error de la reserva anterior nunca aparezca sobre la nueva. */
  resetKey?: string;
}) {
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
  const [resolvingJoinRequest, setResolvingJoinRequest] = useState(false);
  const [joinRequestError, setJoinRequestError] = useState<string | null>(null);

  const [appliedResetKey, setAppliedResetKey] = useState(resetKey);
  if (resetKey !== undefined && resetKey !== appliedResetKey) {
    setAppliedResetKey(resetKey);
    setToggleError(null);
    setJoinRequestError(null);
    setResolvingRequestId(null);
  }

  async function handleToggleOpen(nextIsOpen: boolean) {
    setToggleError(null);
    setTogglingOpen(true);
    const result = await setReservationOpenStatus(supabase, reservationId, nextIsOpen);
    setTogglingOpen(false);
    if (result.success) {
      // Cerrar manualmente resuelve toda solicitud pendiente server-side —
      // reflejarlo de inmediato en vez de esperar un refetch.
      if (!nextIsOpen) setPendingRequests(() => []);
      onToggled?.(nextIsOpen);
    } else {
      setToggleError(result.error ?? "Error al cambiar el estado de la reserva.");
    }
  }

  async function handleApprove(requestId: string) {
    setJoinRequestError(null);
    setResolvingRequestId(requestId);
    setResolvingJoinRequest(true);
    const result = await approveReservationJoinRequest(supabase, requestId);
    setResolvingJoinRequest(false);
    if (result.success) {
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      onApproved?.();
    } else {
      setJoinRequestError(result.error ?? "Error al aprobar la solicitud.");
    }
    setResolvingRequestId(null);
  }

  async function handleReject(requestId: string) {
    setJoinRequestError(null);
    setResolvingRequestId(requestId);
    setResolvingJoinRequest(true);
    const result = await rejectReservationJoinRequest(supabase, requestId);
    setResolvingJoinRequest(false);
    if (result.success) {
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    } else {
      setJoinRequestError(result.error ?? "Error al rechazar la solicitud.");
    }
    setResolvingRequestId(null);
  }

  return {
    togglingOpen,
    toggleError,
    handleToggleOpen,
    resolvingRequestId,
    resolvingJoinRequest,
    joinRequestError,
    handleApprove,
    handleReject,
  };
}
