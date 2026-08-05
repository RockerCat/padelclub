"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { X, Pencil, XCircle, Check, Clock, Timer, Lock, LockOpen } from "lucide-react";
import {
  createReservation,
  updateReservation,
  getReservationForEdit,
  approvePendingReservation,
  rejectPendingReservation,
  cancelReservation,
  addReservationExtraTime,
} from "./actions";
import type { ReservationEditData, PendingActionResult, AddExtraTimeResult } from "./actions";
import { ReservationForm } from "./ReservationForm";
import { RejectReservationModal } from "./RejectReservationModal";
import { AddExtraTimeModal } from "./AddExtraTimeModal";
import type { RejectionReasonCode } from "@/lib/reservationRejection";
import { durationLabel } from "@/lib/durations";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import type { CalendarReservation } from "./WeekCalendar";
import type { PendingRequest } from "./PendingRequestsSection";
import { getPendingReservationJoinRequests } from "@/lib/reservationJoinRequests";
import type { PendingReservationJoinRequest } from "@/lib/reservationJoinRequests";
import { buildReservationSlug } from "@/lib/reservationSlug";
import { buildReservationShareMessage } from "@/lib/reservationShare";
import { ReservationShareActions } from "@/components/reservations/ReservationShareActions";
import { PendingJoinRequestsList } from "@/components/reservations/PendingJoinRequestsList";
import { useReservationJoinManagement } from "./useReservationJoinManagement";

// Agenda's reservation detail — a centered dialog (fullscreen on mobile)
// used for the Agenda view only (WeekCalendar/Semana keeps its own
// ReservationModal instance untouched). Every action inside reuses the
// exact same Server Actions and ReservationForm the rest of the module
// already uses — this is a new container, never a new editing/approval
// system.

export type TicketPanelState =
  | { mode: "create"; initialDate: string; initialCourtId: string; initialStartTime: string }
  | { mode: "view"; reservation: CalendarReservation }
  | { mode: "pending"; pending: PendingRequest };

// Exported so AdminAvailabilityView's tooltip fallback (a reservation with
// no linked players) can show the same Spanish type label instead of a
// second translation table.
export const TYPE_LABELS: Record<string, string> = { match: "Partido", class: "Clase", block: "Bloqueo" };
const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

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

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-brand-muted/50 font-medium">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}

// Groups a handful of Rows into one visually distinct block — the two-column
// desktop layout below is built entirely out of these instead of one long
// vertical list.
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

// One compact row per participant — same PlayerAvatar (real photo, or
// initials via its own getInitials fallback) already used in the sidebar,
// players list and member selector, so the same person never looks
// different from one screen to the next. Reused as-is by both the
// confirmed reservation's "Jugadores" section and the pending request's
// solicitante — one identity row, not two. `email` is optional and only
// ever rendered when a caller actually has it loaded (none does today —
// profiles carries no email column — so this stays silent rather than
// inventing one); kept as a prop so this component doesn't need to change
// again once a caller does have it.
function ParticipantRow({
  profileId,
  fullName,
  avatarUrl,
  email,
}: {
  profileId: string;
  fullName: string | null;
  avatarUrl: string | null;
  email?: string | null;
}) {
  return (
    <div className="flex items-center gap-2.5 py-2 min-w-0">
      <PlayerAvatar player={{ id: profileId, full_name: fullName, avatar_url: avatarUrl }} size="sm" />
      <div className="min-w-0">
        <p className="text-sm text-white truncate">{fullName ?? "Jugador"}</p>
        {email && <p className="text-xs text-brand-muted truncate">{email}</p>}
      </div>
    </div>
  );
}

interface ReservationTicketPanelProps {
  panelState: TicketPanelState | null;
  clubId: string;
  clubSlug: string;
  // Solo para el mensaje del botón "WhatsApp" (ReservationShareActions).
  clubName: string;
  courts: Array<{ id: string; name: string }>;
  members: Array<{ profile_id: string; full_name: string | null; avatar_url: string | null }>;
  allowedDurations: number[];
  onClose: () => void;
  /** Confirmed create/edit/approve/reject — re-fetches the Agenda's server
   *  data without a browser reload (router.refresh() in the caller). */
  onChanged: () => void;
}

export function ReservationTicketPanel({
  panelState,
  clubId,
  clubSlug,
  clubName,
  courts,
  members,
  allowedDurations,
  onClose,
  onChanged,
}: ReservationTicketPanelProps) {
  const [editData, setEditData] = useState<ReservationEditData | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelPending, startCancelTransition] = useTransition();
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejecting, startRejectTransition] = useTransition();
  const [approving, startApproveTransition] = useTransition();
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [extraTimeModalOpen, setExtraTimeModalOpen] = useState(false);
  const [extraTimeError, setExtraTimeError] = useState<string | null>(null);
  const [addingExtraTime, startExtraTimeTransition] = useTransition();

  const panelKey =
    panelState?.mode === "view"
      ? `view-${panelState.reservation.id}`
      : panelState?.mode === "pending"
      ? `pending-${panelState.pending.id}`
      : panelState?.mode ?? null;

  // Reservas Abiertas/Cerradas — badge, toggle y solicitudes pendientes
  // (sección 11 del spec). pendingJoinRequests se recarga junto con
  // editData cada vez que se abre un ticket en modo "view". El wiring de
  // toggle/aprobar/rechazar vive en useReservationJoinManagement (compartido
  // con ReservationShareView, el detalle compartido) — este panel solo es
  // dueño de la lista en sí y de cuándo recargarla.
  const [pendingJoinRequests, setPendingJoinRequests] = useState<PendingReservationJoinRequest[]>([]);
  const {
    togglingOpen,
    toggleError: openStatusError,
    handleToggleOpen,
    resolvingRequestId,
    resolvingJoinRequest,
    joinRequestError,
    handleApprove: handleApproveJoinRequest,
    handleReject: handleRejectJoinRequest,
  } = useReservationJoinManagement({
    reservationId: panelState?.mode === "view" ? panelState.reservation.id : "",
    clubSlug,
    resetKey: panelKey ?? undefined,
    setPendingRequests: setPendingJoinRequests,
    onToggled: (nextIsOpen) => {
      setEditData((prev) => (prev ? { ...prev, is_open: nextIsOpen, closed_reason: nextIsOpen ? null : "manual" } : prev));
      onChanged();
    },
    onApproved: () => {
      if (panelState?.mode !== "view") return;
      // Una 4ta aprobación cierra la reserva automáticamente server-side —
      // re-consultar ambos en vez de adivinar el nuevo is_open/closed_reason/
      // lista de jugadores.
      getReservationForEdit(clubId, panelState.reservation.id).then(setEditData);
      getPendingReservationJoinRequests(panelState.reservation.id).then(setPendingJoinRequests);
      onChanged();
    },
  });

  // Reset the sub-view (editing/confirming-cancel/errors) and the stale
  // fetched detail the moment a different ticket opens — plain local UI
  // state, so this is adjusted during render (React's documented
  // alternative to an effect that only calls setState —
  // https://react.dev/learn/you-might-not-need-an-effect) rather than in a
  // useEffect.
  const [appliedPanelKey, setAppliedPanelKey] = useState<string | null>(null);
  if (panelKey !== appliedPanelKey) {
    setAppliedPanelKey(panelKey);
    setEditing(false);
    setConfirmingCancel(false);
    setPendingError(null);
    setRejectError(null);
    setRejectModalOpen(false);
    setExtraTimeModalOpen(false);
    setExtraTimeError(null);
    setEditData(null);
    setLoadingEdit(panelState?.mode === "view");
    setPendingJoinRequests([]);
  }

  // Fetch the rich detail (notes/price/creator) whenever a confirmed
  // reservation opens in view mode — same data source ReservationModal's
  // edit flow already uses (getReservationForEdit), so Editar below reuses
  // it directly instead of a second fetch. A real side effect (network
  // call): both its setState calls happen inside the async .then, once the
  // fetch actually resolves, never synchronously in the effect body.
  useEffect(() => {
    if (!panelState || panelState.mode !== "view") return;
    getReservationForEdit(clubId, panelState.reservation.id).then((data) => {
      setEditData(data);
      setLoadingEdit(false);
    });
    getPendingReservationJoinRequests(panelState.reservation.id).then(setPendingJoinRequests);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelKey]);

  // Escape key + body scroll lock — same pattern ReservationModal already uses.
  useEffect(() => {
    if (!panelState) return;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!panelState]);

  // Hidratación segura para el enlace de compartir (mismo patrón que
  // ShareNewsButtons.tsx): arranca null y sube a un origin real recién
  // montado, nunca leído durante el render inicial.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  if (!panelState) return null;

  // A plain local const (not the prop itself) so TypeScript's narrowing
  // survives inside the nested closures below — narrowing on a captured
  // prop doesn't persist into a nested function body.
  const state = panelState;

  // Effective JUGADORES for the confirmed-reservation summary below: real
  // reservation_players rows when any exist, otherwise the requester when
  // this reservation came from their own approved request (approving a
  // request only ever flips its status — it never touches
  // reservation_players — so that relationship lives in created_by/
  // creator_is_player, both already resolved server-side). Never combines
  // both sources, and never treats an admin/owner creator as a player.
  // CREADA POR / ORIGEN below stay their own separate rows regardless.
  const jugadoresIds = editData
    ? editData.player_ids.length > 0
      ? editData.player_ids
      : editData.creator_is_player
      ? [editData.created_by]
      : []
    : [];

  function handleApprove() {
    if (state.mode !== "pending") return;
    setPendingError(null);
    startApproveTransition(async () => {
      const result: PendingActionResult = await approvePendingReservation(clubId, state.pending.id);
      if (result.success) {
        onChanged();
        onClose();
      } else {
        setPendingError(result.error ?? "Error al confirmar.");
      }
    });
  }

  function handleRejectConfirm(reasonCode: RejectionReasonCode, comment: string) {
    if (state.mode !== "pending") return;
    setRejectError(null);
    startRejectTransition(async () => {
      const result: PendingActionResult = await rejectPendingReservation(clubId, state.pending.id, reasonCode, comment);
      if (result.success) {
        setRejectModalOpen(false);
        onChanged();
        onClose();
      } else {
        setRejectError(result.error ?? "Error al rechazar.");
      }
    });
  }

  function handleAddExtraTimeConfirm(extraMinutes: number, extraAmount: number, note: string) {
    if (state.mode !== "view") return;
    setExtraTimeError(null);
    startExtraTimeTransition(async () => {
      const result: AddExtraTimeResult = await addReservationExtraTime(
        clubId,
        state.reservation.id,
        extraMinutes,
        extraAmount,
        note
      );
      if (result.success && result.reservation) {
        // Reflects immediately without waiting for the parent's
        // router.refresh() (still triggered via onChanged so the
        // calendar/agenda blocks the extended interval right away too).
        setEditData((prev) => (prev ? { ...prev, ...result.reservation } : prev));
        setExtraTimeModalOpen(false);
        onChanged();
      } else {
        setExtraTimeError(result.error ?? "Error al agregar el tiempo extra.");
      }
    });
  }

  function handleCancelConfirm() {
    if (state.mode !== "view") return;
    // cancelReservation redirects on completion — the exact same behavior
    // Semana's cancel flow already has (a page navigation to
    // ?cancelled=1), not something new introduced by this panel.
    startCancelTransition(async () => {
      await cancelReservation(clubId, clubSlug, state.reservation.id);
    });
  }

  const title =
    panelState.mode === "create"
      ? "Nueva reserva"
      : panelState.mode === "pending"
      ? "Solicitud pendiente"
      : editing
      ? "Editar reserva"
      : "Detalle de la reserva";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-[400]" style={{ backdropFilter: "blur(4px)" }} onClick={onClose} aria-hidden />

      {/* Centered dialog on desktop (~860px, capped to the viewport height);
          fullscreen sheet on mobile — never a side drawer. */}
      <div className="fixed inset-0 z-[401] sm:flex sm:items-center sm:justify-center sm:p-6 pointer-events-none">
        <div
          className="pointer-events-auto isolate w-full h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:w-[860px] sm:max-w-[92vw] bg-[#082735] border border-white/10 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5">
            {panelState.mode === "create" && (
              <div className="mx-auto w-full max-w-lg">
                <ReservationForm
                  key={`create-${panelState.initialCourtId}-${panelState.initialDate}-${panelState.initialStartTime}`}
                  action={createReservation.bind(null, clubId, clubSlug, true)}
                  courts={courts}
                  members={members}
                  defaultDate={panelState.initialDate}
                  clubId={clubId}
                  allowedDurations={allowedDurations}
                  initialValues={{
                    court_id: panelState.initialCourtId,
                    date: panelState.initialDate,
                    start_time: panelState.initialStartTime,
                  }}
                  submitLabel="Crear reserva"
                  cancelHref={`/${clubSlug}/admin/reservations`}
                  onSuccess={() => {
                    onChanged();
                    onClose();
                  }}
                  inModal
                  clubSlug={clubSlug}
                />
              </div>
            )}

            {panelState.mode === "pending" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div className="flex flex-col gap-4">
                  <DetailCard>
                    <Row
                      label="Estado"
                      value={
                        <span className="inline-flex items-center gap-1.5 text-amber-400">
                          <Clock className="w-3.5 h-3.5" />
                          Pendiente
                        </span>
                      }
                    />
                    <Row label="Cancha" value={panelState.pending.courtName} />
                    <Row label="Fecha" value={formatDate(panelState.pending.date)} />
                    <Row
                      label="Hora"
                      value={`${fmt(panelState.pending.start_time)} – ${endTime(panelState.pending.start_time, panelState.pending.duration_minutes)}`}
                    />
                    <Row label="Duración" value={durationLabel(panelState.pending.duration_minutes)} />
                    <Row label="Tipo" value="Partido" />
                    <Row
                      label="Jugadores iniciales"
                      value={`${panelState.pending.playerCount} jugador${panelState.pending.playerCount === 1 ? "" : "es"}`}
                    />
                    <Row label="Acepta solicitudes de jugadores" value={panelState.pending.is_open ? "Sí" : "No"} />
                  </DetailCard>

                  {/* Same visual identity as a confirmed reservation's
                      participants (point 2 of the spec) — the requester is a
                      real relationship (reservations.created_by, always the
                      requesting player for a self-requested pending
                      reservation), never a manually built string. */}
                  {panelState.pending.playerId && (
                    <DetailCard title="Jugadores">
                      <ParticipantRow
                        profileId={panelState.pending.playerId}
                        fullName={
                          members.find((m) => m.profile_id === panelState.pending.playerId)?.full_name ??
                          panelState.pending.playerName
                        }
                        avatarUrl={members.find((m) => m.profile_id === panelState.pending.playerId)?.avatar_url ?? null}
                      />
                    </DetailCard>
                  )}
                </div>

                <div className="flex flex-col gap-4">
                  {panelState.pending.price_amount != null && panelState.pending.price_currency && (
                    <DetailCard title="Cobro">
                      <Row label="Precio" value={formatCurrency(panelState.pending.price_amount, panelState.pending.price_currency)} />
                    </DetailCard>
                  )}
                  <DetailCard>
                    <Row label="Origen" value="Solicitud de jugador" />
                  </DetailCard>
                </div>
              </div>
            )}

            {panelState.mode === "view" &&
              (loadingEdit ? (
                <div className="py-16 text-center text-sm text-brand-muted">Cargando reserva…</div>
              ) : editing && editData ? (
                <div className="mx-auto w-full max-w-lg">
                  <ReservationForm
                    key={`edit-${panelState.reservation.id}`}
                    action={updateReservation.bind(null, clubId, clubSlug, panelState.reservation.id, true)}
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
                    cancelHref={`/${clubSlug}/admin/reservations`}
                    onSuccess={() => {
                      onChanged();
                      onClose();
                    }}
                    inModal
                    editingReservationId={panelState.reservation.id}
                    clubSlug={clubSlug}
                  />
                </div>
              ) : editData ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    <div className="flex flex-col gap-4">
                      <DetailCard>
                        <Row
                          label="Estado"
                          value={
                            <span className="inline-flex items-center gap-1.5 text-[#00FF00]">
                              <Check className="w-3.5 h-3.5" />
                              Confirmada
                            </span>
                          }
                        />
                        <Row
                          label="Participación"
                          value={
                            <span
                              className={`inline-flex items-center gap-1.5 ${
                                editData.is_open ? "text-brand-primary" : "text-brand-muted"
                              }`}
                            >
                              {editData.is_open ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              {editData.is_open ? "Abierta" : "Cerrada"}
                            </span>
                          }
                        />
                        <Row label="Cancha" value={panelState.reservation.courtName} />
                        <Row label="Fecha" value={formatDate(panelState.reservation.date)} />
                        <Row
                          label="Hora"
                          value={`${fmt(editData.start_time)} – ${endTime(editData.start_time, editData.duration_minutes)}`}
                        />
                        <Row
                          label="Duración"
                          value={
                            editData.extra_minutes > 0
                              ? `${durationLabel(editData.duration_minutes)} (incluye ${editData.extra_minutes} min extra)`
                              : durationLabel(editData.duration_minutes)
                          }
                        />
                        <Row label="Tipo" value={TYPE_LABELS[panelState.reservation.type] ?? panelState.reservation.type} />
                        <Row label="Título" value={panelState.reservation.title} />
                      </DetailCard>

                      {/* One compact row per participant (never concatenated
                          into a single line, never hidden behind "+N" — that
                          summary is only for the Agenda's small ticks, point 7
                          of the spec) — resolved by id against `members` so
                          each row gets the real avatar, not just a name.
                          jugadoresIds already resolves the approved-request
                          fallback (see above), so this renders identically
                          either way. */}
                      {jugadoresIds.length > 0 && (
                        <DetailCard title={`Jugadores (${jugadoresIds.length})`}>
                          {jugadoresIds.map((id) => {
                            const member = members.find((m) => m.profile_id === id);
                            const fallbackName = id === editData.created_by ? editData.creator_name : null;
                            return (
                              <ParticipantRow
                                key={id}
                                profileId={id}
                                fullName={member?.full_name ?? fallbackName}
                                avatarUrl={member?.avatar_url ?? null}
                              />
                            );
                          })}
                        </DetailCard>
                      )}
                    </div>

                    <div className="flex flex-col gap-4">
                      {/* Cobro — Total always shown alongside the base price
                          (never just when extra time exists) so it always
                          has the strongest visual weight in this card; extra
                          time/amount rows stay conditional on
                          extra_minutes > 0, exactly like before. */}
                      {(editData.price_amount != null || editData.extra_minutes > 0) && (
                        <DetailCard title="Cobro">
                          <Row
                            label="Precio base"
                            value={
                              editData.price_amount != null && editData.price_currency
                                ? formatCurrency(editData.price_amount, editData.price_currency)
                                : null
                            }
                          />
                          {editData.extra_minutes > 0 && (
                            <>
                              <Row label="Tiempo extra" value={`${editData.extra_minutes} min`} />
                              <Row
                                label="Valor extra"
                                value={formatCurrency(editData.extra_amount, editData.extra_currency ?? "COP")}
                              />
                            </>
                          )}
                          {editData.price_amount != null && (
                            <div className="flex items-center justify-between pt-3 pb-2">
                              <span className="text-xs uppercase tracking-wider text-brand-muted/60 font-semibold">
                                Total
                              </span>
                              <span className="text-xl font-bold text-brand-primary">
                                {formatCurrency(
                                  (editData.price_amount ?? 0) + editData.extra_amount,
                                  editData.price_currency ?? editData.extra_currency ?? "COP"
                                )}
                              </span>
                            </div>
                          )}
                        </DetailCard>
                      )}

                      <DetailCard>
                        <Row label="Creada por" value={editData.creator_name} />
                        <Row label="Origen" value={editData.creator_is_player ? "Solicitud aprobada" : "Creada por el club"} />
                      </DetailCard>
                    </div>
                  </div>

                  {editData.notes && (
                    <DetailCard title="Notas">
                      <p className="text-sm text-white whitespace-pre-line py-2.5">{editData.notes}</p>
                    </DetailCard>
                  )}

                  {/* Solicitudes pendientes — creador/OWNER/ADMIN (sección 3
                      del spec). El panel es siempre OWNER/ADMIN (solo se
                      abre desde la Agenda), así que no hace falta un
                      chequeo extra de "can_manage" aquí — la RPC igual
                      re-valida todo server-side. */}
                  {pendingJoinRequests.length > 0 && (
                    <DetailCard title={`Solicitudes pendientes (${pendingJoinRequests.length})`}>
                      <PendingJoinRequestsList
                        requests={pendingJoinRequests}
                        resolving={resolvingJoinRequest}
                        resolvingRequestId={resolvingRequestId}
                        onApprove={handleApproveJoinRequest}
                        onReject={handleRejectJoinRequest}
                        error={joinRequestError}
                      />
                    </DetailCard>
                  )}
                </div>
              ) : (
                <p className="text-sm text-brand-muted py-8 text-center">No se pudo cargar la reserva.</p>
              ))}
          </div>

          {/* Footer — actions live here instead of inline in the scrollable
              body, so they stay reachable regardless of content height. */}
          {panelState.mode === "pending" && (
            <div className="shrink-0 border-t border-white/10 px-5 py-4">
              {pendingError && <p className="mb-3 text-xs text-red-400">{pendingError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(true)}
                  disabled={approving || rejecting}
                  className="flex-1 h-10 rounded-xl border border-white/20 text-sm font-medium text-brand-muted hover:text-white hover:border-white/40 transition-colors disabled:opacity-40"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={approving || rejecting}
                  className="flex-1 h-10 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {approving ? "Confirmando…" : "Confirmar"}
                </button>
              </div>
            </div>
          )}

          {panelState.mode === "view" && !loadingEdit && !editing && editData && (() => {
            // Mismo slug corto/mensaje que ReservationShareView y
            // PlayerActivity — una sola función para el texto (@/lib/
            // reservationShare), un solo componente para las acciones
            // (@/components/reservations/ReservationShareActions).
            const sharePath = `/${clubSlug}/reservations/${buildReservationSlug({
              creatorName: editData.creator_name,
              date: panelState.reservation.date,
              startTime: editData.start_time,
            })}`;
            const shareUrl = origin ? `${origin}${sharePath}` : sharePath;
            const shareMessage = buildReservationShareMessage({
              clubName,
              creatorName: editData.creator_name,
              date: panelState.reservation.date,
              startTime: editData.start_time,
              durationMinutes: editData.duration_minutes,
              courtName: panelState.reservation.courtName,
              isOpen: editData.is_open,
              playerCount: editData.player_count,
              url: shareUrl,
            });

            return (
              <div className="shrink-0 border-t border-white/10 px-5 py-4 flex flex-col gap-2">
                {openStatusError && <p className="text-xs text-red-400">{openStatusError}</p>}
                <ReservationShareActions url={shareUrl} message={shareMessage} />
                <button
                  type="button"
                  onClick={() => handleToggleOpen(!editData.is_open)}
                  disabled={togglingOpen}
                  className="flex items-center justify-center gap-1.5 h-10 rounded-xl border border-white/15 text-sm font-medium text-white/90 hover:border-white/30 hover:bg-white/5 transition-colors disabled:opacity-40"
                >
                  {editData.is_open ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                  {togglingOpen ? "Guardando…" : editData.is_open ? "Cerrar reserva" : "Abrir reserva"}
                </button>

                <button
                  type="button"
                  onClick={() => setExtraTimeModalOpen(true)}
                  className="flex items-center justify-center gap-1.5 h-10 rounded-xl border border-white/15 text-sm font-medium text-white/90 hover:border-white/30 hover:bg-white/5 transition-colors"
                >
                  <Timer className="w-3.5 h-3.5" />
                  Agregar tiempo extra
              </button>

              {confirmingCancel ? (
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
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(true)}
                    className="flex-1 h-10 rounded-xl border border-red-500/20 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancelar
                  </button>
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
      </div>

      {panelState.mode === "pending" && rejectModalOpen && (
        <RejectReservationModal
          pending={rejecting}
          error={rejectError}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectModalOpen(false)}
        />
      )}

      {panelState.mode === "view" && extraTimeModalOpen && editData && (
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
    </>
  );
}
