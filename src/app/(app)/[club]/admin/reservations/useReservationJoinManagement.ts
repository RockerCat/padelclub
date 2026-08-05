"use client";

import { useState, useTransition } from "react";
import {
  setReservationOpenStatus,
  approveReservationJoinRequest,
  rejectReservationJoinRequest,
} from "@/lib/reservationJoinRequests";
import type { PendingReservationJoinRequest } from "@/lib/reservationJoinRequests";

// Único lugar donde vive el estado/manejo de "Abrir/Cerrar reserva" +
// "Solicitudes pendientes para unirse" (aprobar/rechazar) — antes duplicado
// casi al carácter entre ReservationTicketPanel (modal OWNER/ADMIN) y
// ReservationShareView (detalle compartido), ambos llamando exactamente a
// las mismas Server Actions (@/lib/reservationJoinRequests). Este hook no
// decide NADA de negocio — solo centraliza el wiring de useTransition/error
// que cada caller repetía por separado. Cada caller sigue siendo dueño de
// `pendingRequests` (y de cómo/cuándo lo carga — server-side en la página
// compartida, client-side en el modal) para no forzar una única estrategia
// de fetch sobre ambos.
export function useReservationJoinManagement({
  reservationId,
  clubSlug,
  setPendingRequests,
  onToggled,
  onApproved,
  resetKey,
}: {
  reservationId: string;
  clubSlug: string;
  setPendingRequests: (updater: (prev: PendingReservationJoinRequest[]) => PendingReservationJoinRequest[]) => void;
  /** Se llama tras un cambio de is_open exitoso, con el nuevo valor —
   *  para que el caller lo refleje localmente (editData.is_open, etc.). */
  onToggled?: (nextIsOpen: boolean) => void;
  /** Se llama tras una aprobación exitosa — una 4ta aprobación cierra la
   *  reserva automáticamente server-side, así que un caller con estado
   *  local más rico (editData) puede querer re-consultarlo. */
  onApproved?: () => void;
  /** Opcional — para un caller que reutiliza la misma instancia entre
   *  distintas reservas (ReservationTicketPanel, un modal que cambia de
   *  ticket sin desmontarse): limpia los errores/estado de "resolviendo"
   *  cuando este valor cambia, para que un error de la reserva anterior
   *  nunca aparezca sobre la nueva. Ajustado durante el render (mismo
   *  patrón que appliedPanelKey en ReservationTicketPanel), no en un
   *  useEffect. Un caller de una sola reserva por instancia (ReservationShareView) puede omitirlo. */
  resetKey?: string;
}) {
  const [togglingOpen, startToggleTransition] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
  const [resolvingJoinRequest, startJoinRequestTransition] = useTransition();
  const [joinRequestError, setJoinRequestError] = useState<string | null>(null);

  const [appliedResetKey, setAppliedResetKey] = useState(resetKey);
  if (resetKey !== undefined && resetKey !== appliedResetKey) {
    setAppliedResetKey(resetKey);
    setToggleError(null);
    setJoinRequestError(null);
    setResolvingRequestId(null);
  }

  function handleToggleOpen(nextIsOpen: boolean) {
    setToggleError(null);
    startToggleTransition(async () => {
      const result = await setReservationOpenStatus(reservationId, clubSlug, nextIsOpen);
      if (result.success) {
        // Cerrar manualmente resuelve toda solicitud pendiente server-side
        // — reflejarlo de inmediato en vez de esperar un refetch.
        if (!nextIsOpen) setPendingRequests(() => []);
        onToggled?.(nextIsOpen);
      } else {
        setToggleError(result.error ?? "Error al cambiar el estado de la reserva.");
      }
    });
  }

  function handleApprove(requestId: string) {
    setJoinRequestError(null);
    setResolvingRequestId(requestId);
    startJoinRequestTransition(async () => {
      const result = await approveReservationJoinRequest(requestId, clubSlug, reservationId);
      if (result.success) {
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
        onApproved?.();
      } else {
        setJoinRequestError(result.error ?? "Error al aprobar la solicitud.");
      }
      setResolvingRequestId(null);
    });
  }

  function handleReject(requestId: string) {
    setJoinRequestError(null);
    setResolvingRequestId(requestId);
    startJoinRequestTransition(async () => {
      const result = await rejectReservationJoinRequest(requestId, clubSlug, reservationId);
      if (result.success) {
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      } else {
        setJoinRequestError(result.error ?? "Error al rechazar la solicitud.");
      }
      setResolvingRequestId(null);
    });
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
