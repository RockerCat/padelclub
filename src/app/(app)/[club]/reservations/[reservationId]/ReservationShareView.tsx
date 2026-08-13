"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, LockOpen, AlertTriangle, Check, Clock, X as XIcon, Ban, Pencil, XCircle, Timer, Hourglass } from "lucide-react";
import { Switch } from "@/components/ui";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { ReservationShareActions } from "@/components/reservations/ReservationShareActions";
import { PendingJoinRequestsList } from "@/components/reservations/PendingJoinRequestsList";
import { durationLabel } from "@/lib/durations";
import { buildReservationSlug } from "@/lib/reservationSlug";
import { buildReservationShareMessage } from "@/lib/reservationShare";
import { requestToJoinReservation, getPendingReservationJoinRequests } from "@/lib/reservationJoinRequests";
import type { ReservationShareDetail, PendingReservationJoinRequest } from "@/lib/reservationJoinRequests";
import { cancelMyReservation } from "@/app/(app)/[club]/reservations/actions";
import { canPlayerCancelReservation, activityHref } from "@/components/reservations/PlayerActivity";
import { useReservationJoinManagement } from "@/app/(app)/[club]/admin/reservations/useReservationJoinManagement";
import { ReservationForm } from "@/app/(app)/[club]/admin/reservations/ReservationForm";
import { RejectReservationModal } from "@/app/(app)/[club]/admin/reservations/RejectReservationModal";
import { AddExtraTimeModal } from "@/app/(app)/[club]/admin/reservations/AddExtraTimeModal";
import {
  getReservationForEdit,
  updateReservation,
  cancelReservation,
  addReservationExtraTime,
  approvePendingReservation,
  rejectPendingReservation,
} from "@/app/(app)/[club]/admin/reservations/actions";
import type { ReservationEditData } from "@/app/(app)/[club]/admin/reservations/actions";
import type { RejectionReasonCode } from "@/lib/reservationRejection";
import { getReservationAdminEditPolicyNow } from "../../../../../../shared/reservations/editPolicy";

// Página sencilla de detalle para la URL compartible (sección 5/6 del
// spec) — reutiliza request_to_join_reservation/set_reservation_open_status/
// approve_.../reject_... vía @/lib/reservationJoinRequests, y — para
// OWNER/ADMIN — las MISMAS Server Actions y componentes que
// ReservationTicketPanel.tsx (el modal de la Agenda): getReservationForEdit/
// updateReservation/cancelReservation/addReservationExtraTime/
// approvePendingReservation/rejectPendingReservation, ReservationForm,
// RejectReservationModal, AddExtraTimeModal. El wiring de "Abrir/Cerrar" +
// solicitudes para unirse vive en useReservationJoinManagement, compartido
// con el mismo panel — nunca una segunda implementación de ninguna de estas
// reglas. Toda la autorización real sigue resolviéndose server-side
// (get_reservation_share_detail para el contenido, requireAdminRole dentro
// de cada Server Action de administración) — este componente solo decide
// QUÉ mostrar según el rol/relación del visitante con la reserva.
//
// Misma familia visual que ReservationTicketPanel.tsx: Row/DetailCard, grid
// de 2 columnas en desktop. Sigue siendo una página independiente (nunca un
// modal) — el layout de la vista de solo lectura no cambia; lo único que se
// adapta es el conjunto de acciones disponibles.

const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const TYPE_LABELS: Record<string, string> = { match: "Partido", class: "Clase", block: "Bloqueo" };

const STATUS_LABEL: Record<string, { label: string; icon: typeof Check; className: string }> = {
  confirmed: { label: "Confirmada", icon: Check, className: "text-[#00FF00]" },
  pending: { label: "Pendiente de aprobación", icon: Clock, className: "text-amber-400" },
  rejected: { label: "Rechazada", icon: XIcon, className: "text-red-400" },
  cancelled: { label: "Cancelada", icon: Ban, className: "text-brand-muted" },
  // Nunca resuelta a tiempo por el club — badge propio (naranja), distinto
  // de Rechazada (roja, una decisión real del club) y de Cancelada (gris,
  // una reserva que sí llegó a existir).
  expired: { label: "Expirada", icon: Hourglass, className: "text-orange-400" },
};

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAY[dt.getDay()]} ${dt.getDate()} ${MONTH[dt.getMonth()]}`;
}

function fmt(t: string): string {
  return t.slice(0, 5);
}

function endTime(start: string, mins: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Idéntico a formatCurrency en ReservationTicketPanel.tsx.
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

// Idéntico a Row en ReservationTicketPanel.tsx — misma tipografía,
// espaciado y separador, para que ambas pantallas se sientan la misma
// familia visual.
function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-brand-muted/50 font-medium">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}

// Idéntico a DetailCard en ReservationTicketPanel.tsx.
function DetailCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-1">
      {title && (
        <h3 className="text-[11px] uppercase tracking-wider text-brand-muted/50 font-medium pt-3 pb-1">{title}</h3>
      )}
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

interface Court {
  id: string;
  name: string;
}
interface Member {
  profile_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export function ReservationShareView({
  detail,
  pendingRequests: initialPendingRequests,
  clubSlug,
  clubId,
  isOwnerOrAdmin,
  courts,
  members,
  allowedDurations,
}: {
  detail: ReservationShareDetail;
  pendingRequests: PendingReservationJoinRequest[];
  clubSlug: string;
  clubId: string;
  // El creador PLAYER también puede administrar la reserva (can_manage, ver
  // más abajo) pero NUNCA obtiene Editar/Cancelar/Agregar tiempo extra ni
  // aprobar/rechazar una solicitud original pendiente — esas Server Actions
  // (admin/reservations/actions.ts) exigen OWNER/ADMIN real vía
  // requireAdminRole. Esta bandera, resuelta server-side en page.tsx con el
  // mismo resolveClubAccess que ya usan esas acciones, es la única forma de
  // saberlo desde el cliente.
  isOwnerOrAdmin: boolean;
  courts: Court[];
  members: Member[];
  allowedDurations: number[];
}) {
  const router = useRouter();
  const { reservation, club, players, my_request, am_participant, can_manage, has_schedule_conflict, player_count } =
    detail;

  const [requestPending, startRequestTransition] = useTransition();
  const [requestError, setRequestError] = useState<string | null>(null);
  const [confirmingDespiteConflict, setConfirmingDespiteConflict] = useState(false);
  const [justRequested, setJustRequested] = useState(false);

  const [pendingRequests, setPendingRequests] = useState(initialPendingRequests);

  // Abrir/Cerrar + solicitudes para unirse — mismo hook que
  // ReservationTicketPanel (el modal OWNER/ADMIN de la Agenda) usa, nunca
  // una segunda implementación de este wiring.
  const {
    togglingOpen,
    toggleError,
    handleToggleOpen,
    resolvingRequestId,
    resolvingJoinRequest,
    joinRequestError,
    handleApprove,
    handleReject,
  } = useReservationJoinManagement({
    reservationId: reservation.id,
    clubSlug,
    setPendingRequests,
    onToggled: (nextIsOpen) => {
      setEditData((prev) => (prev ? { ...prev, is_open: nextIsOpen, closed_reason: nextIsOpen ? null : "manual" } : prev));
      router.refresh();
    },
    onApproved: () => {
      if (isOwnerOrAdmin) {
        getReservationForEdit(clubId, reservation.id).then(setEditData);
        getPendingReservationJoinRequests(reservation.id).then(setPendingRequests);
      }
      router.refresh();
    },
  });

  // ─── Acciones administrativas (OWNER/ADMIN) ────────────────────────────────
  // editData es la misma fuente (getReservationForEdit) que
  // ReservationTicketPanel usa para Editar/Cancelar/Agregar tiempo extra —
  // se busca solo para OWNER/ADMIN real y solo mientras la reserva está
  // confirmada (idéntico alcance al del panel).
  const [editData, setEditData] = useState<ReservationEditData | null>(null);
  const [loadingAdminDetail, setLoadingAdminDetail] = useState(isOwnerOrAdmin && reservation.status === "confirmed");
  const [editing, setEditing] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelPending, startCancelTransition] = useTransition();
  const [extraTimeModalOpen, setExtraTimeModalOpen] = useState(false);
  const [extraTimeError, setExtraTimeError] = useState<string | null>(null);
  const [addingExtraTime, startExtraTimeTransition] = useTransition();

  useEffect(() => {
    if (!isOwnerOrAdmin || reservation.status !== "confirmed") return;
    getReservationForEdit(clubId, reservation.id).then((data) => {
      setEditData(data);
      setLoadingAdminDetail(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation.id]);

  function handleAddExtraTimeConfirm(extraMinutes: number, extraAmount: number, note: string) {
    setExtraTimeError(null);
    startExtraTimeTransition(async () => {
      const result = await addReservationExtraTime(clubId, reservation.id, extraMinutes, extraAmount, note);
      if (result.success && result.reservation) {
        setEditData((prev) => (prev ? { ...prev, ...result.reservation } : prev));
        setExtraTimeModalOpen(false);
        router.refresh();
      } else {
        setExtraTimeError(result.error ?? "Error al agregar el tiempo extra.");
      }
    });
  }

  function handleCancelConfirm() {
    // cancelReservation redirige al terminar — el mismo comportamiento
    // exacto que ya tiene ReservationTicketPanel, reutilizado tal cual.
    startCancelTransition(async () => {
      await cancelReservation(clubId, clubSlug, reservation.id);
    });
  }

  // ─── Solicitud original pendiente (aprobar/rechazar) — OWNER/ADMIN ────────
  const [approvingPending, startApprovePendingTransition] = useTransition();
  const [pendingApproveError, setPendingApproveError] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingPending, startRejectPendingTransition] = useTransition();
  const [rejectPendingError, setRejectPendingError] = useState<string | null>(null);

  function handleApprovePending() {
    setPendingApproveError(null);
    startApprovePendingTransition(async () => {
      const result = await approvePendingReservation(clubId, reservation.id);
      if (result.success) {
        router.refresh();
      } else {
        setPendingApproveError(result.error ?? "Error al confirmar.");
      }
    });
  }

  function handleRejectPendingConfirm(reasonCode: RejectionReasonCode, comment: string) {
    setRejectPendingError(null);
    startRejectPendingTransition(async () => {
      const result = await rejectPendingReservation(clubId, reservation.id, reasonCode, comment);
      if (result.success) {
        setRejectModalOpen(false);
        router.refresh();
      } else {
        setRejectPendingError(result.error ?? "Error al rechazar.");
      }
    });
  }

  // ─── Cancelar/Editar — creador PLAYER (nunca OWNER/ADMIN, que ya tiene su
  // propio conjunto de acciones arriba) ───────────────────────────────────
  // Mismas Server Actions y misma regla de 2 horas que ya usan las
  // tarjetas de "Mis solicitudes"/"Mis reservas" (PlayerActivity) y el
  // flujo de edición del calendario — nunca una segunda implementación.
  // Editar reutiliza el mismo punto de entrada que esas tarjetas ya usan
  // (activityHref + &edit=1), en vez de un formulario nuevo en esta página.
  const [confirmingMyCancel, setConfirmingMyCancel] = useState(false);
  const [cancelMyPending, startCancelMyTransition] = useTransition();
  const [cancelMyError, setCancelMyError] = useState<string | null>(null);

  function handleCancelMyReservation() {
    setCancelMyError(null);
    startCancelMyTransition(async () => {
      const result = await cancelMyReservation(reservation.id, clubSlug);
      if (result.success) {
        router.refresh();
      } else {
        setCancelMyError(result.error ?? "Error al cancelar la reserva.");
      }
    });
  }

  // Mismo patrón "hidratación segura" que ShareNewsButtons.tsx: arranca con
  // la ruta relativa (coincide con el SSR) y sube a una URL absoluta recién
  // montado, para que WhatsApp/portapapeles siempre reciban un enlace real.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  function handleRequestJoin() {
    setRequestError(null);
    startRequestTransition(async () => {
      const result = await requestToJoinReservation(reservation.id, clubSlug);
      if (result.success) {
        setJustRequested(true);
        setConfirmingDespiteConflict(false);
        router.refresh();
      } else {
        setRequestError(result.error ?? "Error al enviar la solicitud.");
      }
    });
  }

  // Política de edición por estado temporal (shared/reservations/editPolicy.ts)
  // — misma regla que ReservationTicketPanel ya aplica, para que un
  // OWNER/ADMIN vea exactamente el mismo conjunto de acciones sin importar
  // si llegó por la Agenda o por este enlace compartible. Solo se calcula
  // (y solo se aplica) cuando isOwnerOrAdmin es real: el creador PLAYER
  // también puede llegar a can_manage/showManage más abajo, y ese flujo no
  // se toca — null acá hace que cada `!isOwnerOrAdmin || editPolicy?.…`
  // de abajo se resuelva siempre a "mostrar" para él, sin excepción.
  const editPolicy = isOwnerOrAdmin
    ? getReservationAdminEditPolicyNow(reservation.date, reservation.start_time, reservation.duration_minutes)
    : null;

  const dateLabel = formatDate(reservation.date);
  const timeRange = `${fmt(reservation.start_time)} – ${endTime(reservation.start_time, reservation.duration_minutes)}`;
  const statusCfg = STATUS_LABEL[reservation.status] ?? STATUS_LABEL.pending;
  const StatusIcon = statusCfg.icon;
  // Antes solo se mostraba el valor real de is_open cuando la reserva ya
  // estaba confirmada (forzando "Cerrada" para cualquier otro estado,
  // incluso cuando is_open era true) — pendiente necesita mostrar el valor
  // real ("si acepta solicitudes de jugadores"), así que ahora también
  // cuenta. Cancelada/rechazada quedan igual que antes (siempre "Cerrada"),
  // fuera del alcance de este ajuste.
  const isOpenBadgeActive = (reservation.status === "confirmed" || reservation.status === "pending") && reservation.is_open;

  // Mismo slug corto que ya muestra la barra de direcciones (page.tsx ya
  // canonizó la URL antes de montar este componente) — reconstruido acá
  // solo para no depender de leer la URL actual del navegador.
  const sharePath = `/${clubSlug}/reservations/${buildReservationSlug({
    creatorName: reservation.creator_name,
    date: reservation.date,
    startTime: reservation.start_time,
    id: reservation.id,
  })}`;
  const shareUrl = origin ? `${origin}${sharePath}` : sharePath;
  // Categoría del creador — ya viene en `players` (get_reservation_share_detail
  // incluye al creador ahí cuando es PLAYER), sin necesitar una consulta
  // aparte. Se omite sola cuando no existe (creador OWNER/ADMIN, o sin
  // categoría asignada aún).
  const creatorCategory = players.find((p) => p.profile_id === reservation.created_by)?.category ?? null;
  const shareMessage = buildReservationShareMessage({
    clubName: club.name,
    creatorName: reservation.creator_name,
    date: reservation.date,
    startTime: reservation.start_time,
    durationMinutes: reservation.duration_minutes,
    courtName: reservation.court_name,
    isOpen: reservation.is_open,
    playerCount: player_count,
    category: creatorCategory,
    url: shareUrl,
  });

  // Resuelve UNA acción/mensaje primario, en el mismo orden de prioridad
  // que la sección 6 del spec — nunca se muestran dos a la vez.
  let primary: { kind: "info" | "success" | "warning" | "action"; text: string } | null = null;
  if (reservation.status === "cancelled") {
    primary = { kind: "warning", text: "Reserva cancelada." };
  } else if (reservation.status === "rejected") {
    primary = { kind: "warning", text: "Esta solicitud de reserva fue rechazada por el club." };
  } else if (reservation.status === "expired") {
    primary = { kind: "warning", text: "Esta solicitud expiró porque el club no la aprobó antes del horario programado." };
  } else if (reservation.status === "pending") {
    primary = { kind: "info", text: "Esta reserva está pendiente de aprobación por el club." };
  } else if (can_manage) {
    // Quien puede administrar la reserva (el creador, o cualquier OWNER/
    // ADMIN del club, participe o no) nunca puede ni necesita "Solicitar
    // unirme" — antes esto solo se evaluaba con is_creator, dejando pasar a
    // OWNER/ADMIN no-creadores por las ramas de abajo. primary se queda en
    // null a propósito (nunca un placeholder): el espacio lo ocupan las
    // acciones administrativas reales (switch / solicitudes pendientes, ya
    // mostradas más abajo vía showManage, que usa el mismo can_manage).
  } else if (am_participant) {
    primary = { kind: "success", text: "Ya haces parte de esta reserva." };
  } else if (my_request?.status === "pending") {
    primary = { kind: "info", text: "Solicitud pendiente." };
  } else if (!reservation.is_open) {
    primary = { kind: "warning", text: "Reserva cerrada." };
  }
  // Si no hay ningún estado terminal, y la reserva está abierta, el botón
  // "Solicitar unirme" se muestra más abajo (con o sin el aviso de rechazo
  // previo — un rechazo nunca bloquea un nuevo intento).

  const showJoinCta =
    !primary && !can_manage && reservation.status === "confirmed" && reservation.is_open && !justRequested;
  const showManage = can_manage && reservation.status === "confirmed";
  // El switch "Aceptar solicitudes" vive dentro del bloque de la columna
  // derecha — lo único que sigue gatillando la sección de acciones de abajo
  // por este lado es la lista de solicitudes pendientes en sí. Mismo gate
  // que el switch de arriba: para OWNER/ADMIN, una reserva ya pasada oculta
  // la gestión de solicitudes; el creador PLAYER nunca se ve afectado.
  const showPendingRequests = showManage && pendingRequests.length > 0 && (!isOwnerOrAdmin || editPolicy?.actions.manageJoinRequests);

  // Acciones exclusivas de OWNER/ADMIN real (nunca del creador PLAYER) —
  // mismo alcance que requireAdminRole en admin/reservations/actions.ts.
  const showPendingApproval = isOwnerOrAdmin && reservation.status === "pending";
  const showConfirmedAdminActions = isOwnerOrAdmin && reservation.status === "confirmed" && !!editData;

  // Cancelar/Editar — creador PLAYER de una solicitud aún pendiente (nunca
  // OWNER/ADMIN, que ya tiene showPendingApproval arriba). Antes esta
  // página nunca era alcanzable para una reserva pendiente, así que estas
  // acciones nunca tenían dónde vivir — canPlayerCancelReservation es la
  // misma regla de 2 horas que ya rige "Mis solicitudes"/"Mis reservas".
  const showPlayerPendingActions = reservation.status === "pending" && reservation.is_creator && !isOwnerOrAdmin;
  // Cancelar — creador PLAYER de una reserva ya CONFIRMED (nunca
  // OWNER/ADMIN, que ya tiene showConfirmedAdminActions arriba). Misma
  // Server Action y misma regla de 2 horas (canPlayerCancelReservation,
  // shared/reservations/eligibility.ts) que ya usa "Mis reservas"
  // (PlayerActivity) y el bloque de solicitud pendiente de arriba — antes
  // esta página nunca ofrecía cancelar una reserva ya confirmada, aunque
  // cancel_reservation ya lo permitía server-side. Solo Cancelar (no
  // Editar): ese flujo para una reserva confirmada del propio jugador vive
  // en el calendario, fuera de alcance de este ajuste puntual.
  const showPlayerConfirmedCancelAction = reservation.status === "confirmed" && reservation.is_creator && !isOwnerOrAdmin;
  const canPlayerActNow = canPlayerCancelReservation({
    status: reservation.status as "pending" | "confirmed" | "cancelled" | "rejected",
    date: reservation.date,
    start_time: reservation.start_time,
  });

  // Divisor de acciones (criterio de aceptación: acciones separadas del
  // contenido) — solo aparece si hay algo que mostrar debajo.
  const hasActionsSection =
    !!primary ||
    showJoinCta ||
    justRequested ||
    showPendingRequests ||
    showPendingApproval ||
    showConfirmedAdminActions ||
    showPlayerPendingActions ||
    showPlayerConfirmedCancelAction;

  // Regla "no repetir al creador" — players ya incluye al creador cuando es
  // PLAYER (ver get_reservation_share_detail), así que un array de longitud
  // 1 siempre es exactamente el creador solo: mostrar la sección Jugadores
  // solo cuando exista alguien más allá de él (las dos condiciones del spec
  // colapsan en una sola dado que profile_id es único por fila).
  const showPlayersSection = players.some((p) => p.profile_id !== reservation.created_by);

  // Editando — reemplaza TODO el contenido por el mismo ReservationForm que
  // ReservationTicketPanel usa para editar (mismo action, mismo alcance de
  // campos), nunca un formulario paralelo. inModal oculta el "Cancelar" de
  // enlace propio del form (que navegaría fuera de esta página) — el link
  // de abajo lo reemplaza por un simple "volver a ver" local.
  if (editing && editData) {
    return (
      <div className="min-h-screen bg-brand-bg">
        <div className="border-b border-white/8 bg-brand-bg/90 backdrop-blur-sm sticky top-0 z-20">
          <div className="max-w-lg mx-auto px-5 h-14 flex items-center">
            <Link
              href={`/${clubSlug}`}
              className="flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {club.name}
            </Link>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-5 py-8 flex flex-col gap-4">
          <h1 className="text-xl font-bold text-white">Editar reserva</h1>
          <ReservationForm
            key={`edit-${reservation.id}`}
            action={updateReservation.bind(null, clubId, clubSlug, reservation.id, true)}
            courts={courts}
            members={members}
            defaultDate={editData.date}
            clubId={clubId}
            allowedDurations={allowedDurations}
            initialValues={{
              court_id: editData.court_id,
              date: editData.date,
              start_time: editData.start_time.slice(0, 5),
              duration_minutes: editData.duration_minutes,
              type: editData.type,
              title: editData.title ?? undefined,
              notes: editData.notes ?? undefined,
              player_ids: editData.player_ids,
            }}
            submitLabel="Guardar cambios"
            cancelHref={sharePath}
            onSuccess={() => {
              setEditing(false);
              router.refresh();
            }}
            inModal
            editingReservationId={reservation.id}
            clubSlug={clubSlug}
          />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm text-brand-muted hover:text-white transition-colors self-start"
          >
            Volver al detalle sin guardar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="border-b border-white/8 bg-brand-bg/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center">
          <Link
            href={`/${clubSlug}`}
            className="flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {club.name}
          </Link>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-8 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Detalle de la reserva</h1>
          <p className="text-sm text-brand-muted mt-1">{club.name}</p>
        </div>

        {/* Contenido — dos columnas equilibradas: izquierda el horario
            completo, derecha un único bloque (creador, jugadores, cupo,
            control de solicitudes y acciones de compartir) en vez de varias
            tarjetas pequeñas desconectadas. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <DetailCard>
            <Row
              label="Estado"
              value={
                <span className={`inline-flex items-center gap-1.5 ${statusCfg.className}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {statusCfg.label}
                </span>
              }
            />
            <Row
              label="Participación"
              value={
                <span className={`inline-flex items-center gap-1.5 ${isOpenBadgeActive ? "text-brand-primary" : "text-brand-muted"}`}>
                  {isOpenBadgeActive ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  {isOpenBadgeActive ? "Abierta" : "Cerrada"}
                </span>
              }
            />
            <Row label="Cancha" value={reservation.court_name} />
            <Row label="Fecha" value={dateLabel} />
            <Row label="Hora" value={timeRange} />
            <Row label="Duración" value={durationLabel(reservation.duration_minutes)} />
            <Row label="Tipo" value={TYPE_LABELS[reservation.type] ?? reservation.type} />
            <Row
              label="Valor"
              value={
                reservation.price_amount != null
                  ? formatCurrency(reservation.price_amount, reservation.price_currency ?? "COP")
                  : null
              }
            />
          </DetailCard>

          <DetailCard>
            <Row label="Creador" value={reservation.creator_name} />

            {/* Jugadores — solo cuando hay alguien más allá del creador
                (showPlayersSection), para no duplicar su tarjeta cuando es
                el único participante. Mismo PlayerSportAvatar de siempre. */}
            {showPlayersSection && (
              <div className="flex flex-col gap-1.5 py-2.5 border-b border-white/5 last:border-0">
                <span className="text-[11px] uppercase tracking-wider text-brand-muted/50 font-medium">
                  Jugadores ({players.length})
                </span>
                <div className="flex flex-col gap-1.5 pt-0.5">
                  {players.map((p) => (
                    <div key={p.profile_id} className="flex items-center gap-2.5">
                      <PlayerSportAvatar player={p} size="sm" sportCategory={p.category} />
                      <span className="text-sm text-white truncate">{p.full_name ?? "Jugador"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Row label="Cupo" value={`Jugadores ${player_count} / 4`} />

            {/* Control de solicitudes — mismo switch/handler que antes,
                reubicado dentro del bloque de la columna derecha. Para
                OWNER/ADMIN, una reserva ya pasada oculta el switch (mismo
                criterio que ReservationTicketPanel); el creador PLAYER
                nunca se ve afectado por esta condición adicional. */}
            {showManage && (!isOwnerOrAdmin || editPolicy?.actions.toggleOpen) && (
              <div className="flex flex-col gap-2 py-3 border-b border-white/5 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col pr-2">
                    <span className="text-sm text-white font-medium">Aceptar solicitudes de jugadores</span>
                    <span className="text-xs text-brand-muted">
                      {togglingOpen
                        ? "Guardando…"
                        : reservation.is_open
                        ? "Otros jugadores del club podrán solicitar unirse hasta completar los 4 cupos."
                        : "Esta reserva ya no acepta solicitudes de nuevos jugadores."}
                    </span>
                  </div>
                  <Switch
                    checked={reservation.is_open}
                    onChange={(next) => handleToggleOpen(next)}
                    disabled={togglingOpen}
                    label="Aceptar solicitudes de jugadores"
                  />
                </div>
                {toggleError && <p className="text-xs text-red-400">{toggleError}</p>}
              </div>
            )}

            {/* Compartir — WhatsApp + copiar enlace, siempre al final del
                bloque. */}
            <div className="py-3">
              <ReservationShareActions url={shareUrl} message={shareMessage} />
            </div>
          </DetailCard>
        </div>

        {/* Acciones — separadas del contenido por un divisor, igual que el
            footer de ReservationTicketPanel (nunca mezcladas con las
            tarjetas de información de arriba). */}
        {hasActionsSection && (
          <div className="flex flex-col gap-4 pt-4 mt-1 border-t border-white/10">
            {primary && (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  primary.kind === "success"
                    ? "border-[#00FF00]/20 bg-[#00FF00]/5 text-[#00FF00]"
                    : primary.kind === "warning"
                    ? "border-red-500/20 bg-red-500/5 text-red-400"
                    : "border-white/10 bg-white/[0.03] text-brand-muted"
                }`}
              >
                {primary.text}
              </div>
            )}

            {/* Aprobar/Rechazar la solicitud original — OWNER/ADMIN, mismas
                Server Actions y mismo modal de rechazo que
                ReservationTicketPanel en modo "pending". */}
            {showPendingApproval && (
              <div className="flex flex-col gap-2">
                {pendingApproveError && <p className="text-xs text-red-400">{pendingApproveError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRejectModalOpen(true)}
                    disabled={approvingPending || rejectingPending}
                    className="flex-1 h-10 rounded-xl border border-white/20 text-sm font-medium text-brand-muted hover:text-white hover:border-white/40 transition-colors disabled:opacity-40"
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    onClick={handleApprovePending}
                    disabled={approvingPending || rejectingPending}
                    className="flex-1 h-10 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    {approvingPending ? "Confirmando…" : "Confirmar"}
                  </button>
                </div>
              </div>
            )}

            {/* Cancelar/Editar — creador PLAYER de una solicitud pendiente, o
                solo Cancelar para una reserva ya CONFIRMED (misma Server
                Action/estado compartido, cancelMyReservation/
                confirmingMyCancel — nunca una segunda copia por estado).
                Editar reutiliza ese mismo punto de entrada en vez de un
                formulario nuevo acá, y solo aplica a la solicitud pendiente
                (editar una reserva confirmada del propio jugador vive en el
                calendario, fuera de alcance acá). */}
            {(showPlayerPendingActions || showPlayerConfirmedCancelAction) && (
              <div className="flex flex-col gap-2">
                {cancelMyError && <p className="text-xs text-red-400">{cancelMyError}</p>}
                {confirmingMyCancel ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                    <p className="text-sm text-white font-medium mb-1">
                      {showPlayerPendingActions ? "¿Cancelar esta solicitud?" : "¿Cancelar esta reserva?"}
                    </p>
                    <p className="text-xs text-brand-muted mb-3">Esta acción no se puede deshacer.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingMyCancel(false)}
                        disabled={cancelMyPending}
                        className="flex-1 h-9 rounded-lg border border-white/15 text-xs text-brand-muted hover:text-white transition-colors disabled:opacity-40"
                      >
                        Volver
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelMyReservation}
                        disabled={cancelMyPending}
                        className="flex-1 h-9 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                      >
                        {cancelMyPending ? "Cancelando…" : "Confirmar"}
                      </button>
                    </div>
                  </div>
                ) : canPlayerActNow ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingMyCancel(true)}
                      className="flex-1 h-10 rounded-xl border border-red-500/20 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {showPlayerPendingActions ? "Cancelar" : "Cancelar reserva"}
                    </button>
                    {showPlayerPendingActions && (
                      <Link
                        href={`${activityHref(clubSlug, reservation.id)}&edit=1`}
                        className="flex-1 h-10 rounded-xl bg-brand-primary text-brand-bg text-sm font-semibold hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar
                      </Link>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-brand-muted/60">
                    {showPlayerPendingActions
                      ? "Ya no se puede editar ni cancelar (faltan menos de 2 horas)"
                      : "Ya no se puede cancelar (faltan menos de 2 horas)"}
                  </p>
                )}
              </div>
            )}

            {/* Solicitar unirme — solo cuando ningún estado terminal ya aplica */}
            {showJoinCta && (
              <div className="flex flex-col gap-2">
                {my_request?.status === "rejected" && (
                  <p className="text-xs text-red-400/90">
                    Tu solicitud anterior fue rechazada. Puedes volver a intentarlo.
                  </p>
                )}

                {/* Conflicto de horario — sección 7: advierte, nunca bloquea. */}
                {has_schedule_conflict && !confirmingDespiteConflict && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <p className="flex items-center gap-1.5 text-sm text-amber-400 font-medium mb-1">
                      <AlertTriangle className="w-4 h-4" />
                      Ya tienes otra reserva en este horario
                    </p>
                    <p className="text-xs text-brand-muted mb-3">
                      Este horario se cruza con otra reserva o participación tuya. Puedes solicitar unirte de todas formas.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingDespiteConflict(false)}
                        className="flex-1 h-9 rounded-lg border border-white/15 text-xs text-brand-muted hover:text-white transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDespiteConflict(true)}
                        className="flex-1 h-9 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
                      >
                        Solicitar de todas formas
                      </button>
                    </div>
                  </div>
                )}

                {(!has_schedule_conflict || confirmingDespiteConflict) && (
                  <button
                    type="button"
                    onClick={handleRequestJoin}
                    disabled={requestPending}
                    className="w-full h-11 rounded-xl bg-brand-primary text-brand-bg text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {requestPending ? "Enviando…" : "Solicitar unirme"}
                  </button>
                )}

                {requestError && <p className="text-xs text-red-400">{requestError}</p>}
              </div>
            )}

            {justRequested && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-brand-muted">
                Solicitud pendiente.
              </div>
            )}

            {/* Solicitudes pendientes — creador, OWNER o ADMIN. El switch
                "Aceptar solicitudes" en sí vive ahora en el bloque de la
                columna derecha (mismo handler, sin cambios de lógica). */}
            {showPendingRequests && (
              <div className="flex flex-col gap-3">
                <DetailCard title={`Solicitudes pendientes (${pendingRequests.length})`}>
                  <PendingJoinRequestsList
                    requests={pendingRequests}
                    resolving={resolvingJoinRequest}
                    resolvingRequestId={resolvingRequestId}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    error={joinRequestError}
                  />
                </DetailCard>
              </div>
            )}

            {/* Acciones administrativas — OWNER/ADMIN real, reserva
                confirmada. Mismas Server Actions/componentes que
                ReservationTicketPanel: addReservationExtraTime +
                AddExtraTimeModal, cancelReservation, y el modo "editing" de
                arriba para Editar (mismo ReservationForm/updateReservation). */}
            {showConfirmedAdminActions && editData && (() => {
              const actions = editPolicy?.actions;
              return (
                <div className="flex flex-col gap-2">
                  {actions?.addExtraTime && (
                    <button
                      type="button"
                      onClick={() => setExtraTimeModalOpen(true)}
                      className="flex items-center justify-center gap-1.5 h-10 rounded-xl border border-white/15 text-sm font-medium text-white/90 hover:border-white/30 hover:bg-white/5 transition-colors"
                    >
                      <Timer className="w-3.5 h-3.5" />
                      Agregar tiempo extra
                    </button>
                  )}

                  {confirmingCancel && actions?.cancel ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                      <p className="text-sm text-white font-medium mb-1">¿Cancelar esta reserva?</p>
                      <p className="text-xs text-brand-muted mb-3">Esta acción liberará el horario de la cancha.</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingCancel(false)}
                          disabled={cancelPending}
                          className="flex-1 h-9 rounded-lg border border-white/15 text-xs text-brand-muted hover:text-white transition-colors disabled:opacity-40"
                        >
                          Volver
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelConfirm}
                          disabled={cancelPending}
                          className="flex-1 h-9 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                        >
                          {cancelPending ? "Cancelando…" : "Confirmar"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {actions?.cancel && (
                        <button
                          type="button"
                          onClick={() => setConfirmingCancel(true)}
                          className="flex-1 h-10 rounded-xl border border-red-500/20 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancelar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="flex-1 h-10 rounded-xl bg-brand-primary text-brand-bg text-sm font-semibold hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {isOwnerOrAdmin && loadingAdminDetail && reservation.status === "confirmed" && (
          <p className="text-xs text-brand-muted/60 text-center">Cargando acciones administrativas…</p>
        )}
      </div>

      {showPendingApproval && rejectModalOpen && (
        <RejectReservationModal
          pending={rejectingPending}
          error={rejectPendingError}
          onConfirm={handleRejectPendingConfirm}
          onCancel={() => setRejectModalOpen(false)}
        />
      )}

      {showConfirmedAdminActions && extraTimeModalOpen && editData && (
        <AddExtraTimeModal
          pending={addingExtraTime}
          error={extraTimeError}
          startTime={fmt(editData.start_time)}
          currentDurationMinutes={editData.duration_minutes}
          currentEndTime={endTime(editData.start_time, editData.duration_minutes)}
          priceAmount={editData.price_amount}
          existingExtraAmount={editData.extra_amount}
          currency={editData.price_currency ?? editData.extra_currency ?? "COP"}
          onConfirm={handleAddExtraTimeConfirm}
          onCancel={() => setExtraTimeModalOpen(false)}
        />
      )}
    </div>
  );
}
