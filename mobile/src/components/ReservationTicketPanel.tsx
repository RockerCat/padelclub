import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { X, Pencil, XCircle, Check, Clock, Lock, LockOpen, Timer } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { durationLabel } from "../lib/durations";
import { addMinutes } from "../lib/time";
import { formatShortDate } from "../lib/dateFormat";
import { RESERVATION_TYPE_LABELS } from "../lib/courtColors";
import { getReservationTicketDetail, type ReservationTicketDetail } from "../lib/reservationEdit";
import { cancelReservation } from "../lib/cancelReservation";
import {
  approvePendingReservation,
  rejectPendingReservation,
  type PendingRequest,
  type PendingActionResult,
} from "../lib/reservationAdminRequests";
import { addReservationExtraTime, type AddExtraTimeResult } from "../lib/reservationExtraTime";
import { getPendingReservationJoinRequests, type PendingReservationJoinRequest } from "../lib/reservationJoinRequests";
import { useReservationJoinManagement } from "../lib/useReservationJoinManagement";
import type { RejectionReasonCode } from "../lib/reservationRejection";
import { RejectReservationModal } from "./RejectReservationModal";
import { AddExtraTimeModal } from "./AddExtraTimeModal";
import { PendingJoinRequestsList } from "./PendingJoinRequestsList";
import { getReservationAdminEditPolicyNow } from "../../../shared/reservations/editPolicy";
import type { CalendarReservation } from "../lib/weekCalendar";

// Equivalente RN de ReservationTicketPanel.tsx (app web) para Agenda —
// abierto al tocar cualquier slot ocupado (CourtAvailabilityCard.
// onSelectOccupied). Reutiliza exactamente las mismas acciones que el
// resto del módulo ya tiene en mobile: cancelReservation (WeekReservationCard),
// approvePendingReservation/rejectPendingReservation (PendingRequestCard),
// addReservationExtraTime, useReservationJoinManagement (abrir/cerrar +
// solicitudes de unión) — y delega "Editar" al mismo WeekReservationModal
// que Semana ya usa (vía onEdit) en vez de reimplementar un formulario de
// edición acá. No porta "Solicitar unirme" (PLAYER) ni el botón de
// compartir por WhatsApp del panel — fuera de los 3 gaps de esta ronda.
export type TicketPanelState = { mode: "view"; reservation: CalendarReservation } | { mode: "pending"; pending: PendingRequest };

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === "string" ? <Text style={styles.rowValue}>{value}</Text> : value}
    </View>
  );
}

function DetailCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      {title && <Text style={styles.cardTitle}>{title}</Text>}
      <View>{children}</View>
    </View>
  );
}

export function ReservationTicketPanel({
  state,
  clubId,
  onClose,
  onChanged,
  onEdit,
}: {
  state: TicketPanelState | null;
  clubId: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (reservation: CalendarReservation) => void;
}) {
  const [ticketDetail, setTicketDetail] = useState<ReservationTicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [extraTimeModalOpen, setExtraTimeModalOpen] = useState(false);
  const [extraTimeError, setExtraTimeError] = useState<string | null>(null);
  const [addingExtraTime, setAddingExtraTime] = useState(false);

  // Coordina el cierre de este panel (Modal exterior) con el cierre real
  // de RejectReservationModal (Modal interior anidado dentro de él) tras
  // un rechazo exitoso — nunca un timeout arbitrario. En iOS, RN confirma
  // el cierre nativo del modal interior vía su propio onDismiss (ver
  // handleRejectModalDismiss abajo); esta ref solo marca que ESE dismiss,
  // cuando llegue, debe además cerrar el panel exterior (nunca lo hace por
  // un cancel/cierre manual del modal de rechazo). En Android, onDismiss
  // de <Modal> no existe (no implementado por RN — ver Modal.js: "OnDismiss
  // is implemented on iOS only"), pero tampoco hace falta: el Modal de
  // Android se respalda en un Dialog simple, sin el stack de
  // UIViewController anidados que produce el freeze en iOS, así que cerrar
  // el panel exterior de inmediato ahí es seguro (ver handleRejectConfirm).
  const pendingCloseAfterRejectRef = useRef(false);

  function handleRejectModalDismiss() {
    if (pendingCloseAfterRejectRef.current) {
      pendingCloseAfterRejectRef.current = false;
      onClose();
    }
  }

  // Solicitudes pendientes para unirse (sección 3) — se recarga junto con
  // ticketDetail cada vez que se abre el panel en modo "view". El wiring de
  // toggle/aprobar/rechazar vive en useReservationJoinManagement (mismo hook
  // que la web), este componente solo es dueño de la lista y de cuándo
  // recargarla.
  const [pendingJoinRequests, setPendingJoinRequests] = useState<PendingReservationJoinRequest[]>([]);

  const stateKey = state?.mode === "view" ? `view-${state.reservation.id}` : state?.mode === "pending" ? `pending-${state.pending.id}` : null;

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
    reservationId: state?.mode === "view" ? state.reservation.id : "",
    resetKey: stateKey ?? undefined,
    setPendingRequests: setPendingJoinRequests,
    onToggled: (nextIsOpen) => {
      setTicketDetail((prev) => (prev ? { ...prev, is_open: nextIsOpen, closed_reason: nextIsOpen ? null : "manual" } : prev));
      onChanged();
    },
    onApproved: () => {
      if (state?.mode !== "view") return;
      // Una 4ta aprobación cierra la reserva automáticamente server-side —
      // re-consultar ambos en vez de adivinar el nuevo is_open/closed_reason/
      // lista de jugadores, igual que la web.
      getReservationTicketDetail(supabase, clubId, state.reservation.id).then(setTicketDetail);
      getPendingReservationJoinRequests(supabase, state.reservation.id).then(setPendingJoinRequests);
      onChanged();
    },
  });

  useEffect(() => {
    setConfirmingCancel(false);
    setPendingError(null);
    setRejectError(null);
    setRejectModalOpen(false);
    setExtraTimeModalOpen(false);
    setExtraTimeError(null);
    setTicketDetail(null);
    setPendingJoinRequests([]);

    if (state?.mode === "view") {
      setLoadingDetail(true);
      getReservationTicketDetail(supabase, clubId, state.reservation.id).then((data) => {
        setTicketDetail(data);
        setLoadingDetail(false);
      });
      getPendingReservationJoinRequests(supabase, state.reservation.id).then(setPendingJoinRequests);
    } else {
      setLoadingDetail(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  async function handleApprove() {
    if (state?.mode !== "pending") return;
    setPendingError(null);
    setApproving(true);
    const result: PendingActionResult = await approvePendingReservation(supabase, state.pending.id);
    setApproving(false);
    if (result.success) {
      onChanged();
      onClose();
    } else {
      setPendingError(result.error ?? "Error al confirmar.");
    }
  }

  async function handleRejectConfirm(reasonCode: RejectionReasonCode, comment: string) {
    if (state?.mode !== "pending") return;
    setRejectError(null);
    setRejecting(true);
    const result: PendingActionResult = await rejectPendingReservation(supabase, clubId, state.pending.id, reasonCode, comment);
    setRejecting(false);
    if (result.success) {
      // RejectReservationModal es un <Modal> de RN anidado DENTRO del
      // <Modal> propio de este panel (ver el JSX más abajo: se renderiza
      // como hijo del <Modal visible={!!state}> exterior). RN no soporta
      // bien cerrar dos Modal anidados en el mismo tick: cerrar
      // rejectModalOpen y, en el mismo batch, llamar onClose() (que pone
      // state=null y desmonta TODO, incluido el Modal exterior) deja un
      // overlay nativo huérfano que sigue interceptando touches — la app
      // completa queda congelada (confirmado: freeze real reportado tras
      // rechazar). handleApprove (arriba) nunca tuvo este problema porque
      // nunca hay un modal anidado abierto durante su propio cierre.
      //
      // Cierre determinista, sin timeout: se pide cerrar el modal interior
      // (setRejectModalOpen(false)) y se marca la intención de cerrar
      // también el exterior; ese cierre real solo ocurre cuando
      // handleRejectModalDismiss confirma (vía el onDismiss nativo de RN,
      // iOS) que la presentación del modal interior ya terminó. En Android
      // (sin onDismiss, y sin el riesgo de stack anidado que tiene iOS) se
      // cierra de inmediato — ver comentario de pendingCloseAfterRejectRef.
      setRejectModalOpen(false);
      onChanged();
      if (Platform.OS === "android") {
        onClose();
      } else {
        pendingCloseAfterRejectRef.current = true;
      }
    } else {
      setRejectError(result.error ?? "Error al rechazar.");
    }
  }

  function handleCancelPress() {
    if (state?.mode !== "view") return;
    const reservation = state.reservation;
    Alert.alert("¿Cancelar esta reserva?", "Esta acción liberará el horario de la cancha.", [
      { text: "Volver", style: "cancel" },
      {
        text: "Confirmar",
        style: "destructive",
        onPress: async () => {
          setCancelling(true);
          const result = await cancelReservation(supabase, reservation.id);
          setCancelling(false);
          if (result.error) {
            Alert.alert("No se pudo cancelar", result.error);
            return;
          }
          onChanged();
          onClose();
        },
      },
    ]);
  }

  async function handleAddExtraTimeConfirm(extraMinutes: number, extraAmount: number, note: string) {
    if (state?.mode !== "view") return;
    setExtraTimeError(null);
    setAddingExtraTime(true);
    const result: AddExtraTimeResult = await addReservationExtraTime(supabase, state.reservation.id, extraMinutes, extraAmount, note);
    setAddingExtraTime(false);
    if (result.success && result.reservation) {
      // Refleja de inmediato sin esperar a onChanged (igual que la web) —
      // onChanged también se dispara para que Agenda recalcule ocupación.
      setTicketDetail((prev) => (prev ? { ...prev, ...result.reservation } : prev));
      setExtraTimeModalOpen(false);
      onChanged();
    } else {
      setExtraTimeError(result.error ?? "Error al agregar el tiempo extra.");
    }
  }

  const title = state?.mode === "pending" ? "Solicitud pendiente" : "Detalle de la reserva";

  // Jugadores efectivos: reservation.players (nombres ya resueltos por
  // getWeekCalendarData) cuando hay participantes reales; si no los hay y
  // el creador es PLAYER (reserva nacida de una solicitud aprobada), su
  // propio nombre — mismo criterio que jugadoresIds en la web, sin volver a
  // resolver ids por perfil.
  const effectivePlayers =
    state?.mode === "view"
      ? ticketDetail && ticketDetail.player_ids.length > 0
        ? state.reservation.players
        : ticketDetail?.creator_is_player && ticketDetail.creator_name
        ? [ticketDetail.creator_name]
        : []
      : [];

  // Política de edición por estado temporal (shared/reservations/editPolicy.ts)
  // — misma regla que WEB, decide qué acciones operativas (Abrir/Cerrar,
  // Cancelar, tiempo extra, solicitudes de unión) siguen teniendo sentido.
  const editPolicy =
    state?.mode === "view" && ticketDetail
      ? getReservationAdminEditPolicyNow(state.reservation.date, ticketDetail.start_time, ticketDetail.duration_minutes)
      : null;

  return (
    <Modal visible={!!state} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <X width={16} height={16} color={theme.colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {state?.mode === "pending" && (
              <>
                <DetailCard>
                  <Row
                    label="Estado"
                    value={
                      <View style={styles.iconRow}>
                        <Clock width={14} height={14} color={theme.colors.warning} />
                        <Text style={[styles.rowValue, { color: theme.colors.warning }]}>Pendiente</Text>
                      </View>
                    }
                  />
                  <Row label="Cancha" value={state.pending.courtName} />
                  <Row label="Fecha" value={formatShortDate(state.pending.date)} />
                  <Row label="Hora" value={`${state.pending.start_time.slice(0, 5)} – ${addMinutes(state.pending.start_time.slice(0, 5), state.pending.duration_minutes)}`} />
                  <Row label="Duración" value={durationLabel(state.pending.duration_minutes)} />
                  <Row label="Tipo" value="Partido" />
                  <Row label="Jugadores iniciales" value={`${state.pending.playerCount} jugador${state.pending.playerCount === 1 ? "" : "es"}`} />
                  <Row label="Acepta solicitudes de jugadores" value={state.pending.is_open ? "Sí" : "No"} />
                </DetailCard>

                {state.pending.playerName && (
                  <DetailCard title="Jugadores">
                    <Text style={styles.playerLine}>{state.pending.playerName}</Text>
                  </DetailCard>
                )}

                {state.pending.price_amount != null && state.pending.price_currency && (
                  <DetailCard title="Cobro">
                    <Row label="Precio" value={formatCurrency(state.pending.price_amount, state.pending.price_currency)} />
                  </DetailCard>
                )}

                <DetailCard>
                  <Row label="Origen" value="Solicitud de jugador" />
                </DetailCard>

                {pendingError && <Text style={styles.errorText}>{pendingError}</Text>}

                <View style={styles.actionsRow}>
                  <TouchableOpacity onPress={() => setRejectModalOpen(true)} disabled={approving || rejecting} style={[styles.button, styles.buttonSecondary]}>
                    <Text style={styles.buttonSecondaryText}>Rechazar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleApprove} disabled={approving || rejecting} style={[styles.button, styles.buttonApprove]}>
                    {approving ? <ActivityIndicator color={theme.colors.bg} /> : <Text style={styles.buttonApproveText}>Confirmar</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {state?.mode === "view" &&
              (loadingDetail ? (
                <View style={styles.loadingBody}>
                  <ActivityIndicator color={theme.colors.primary} />
                </View>
              ) : ticketDetail ? (
                <>
                  <DetailCard>
                    <Row
                      label="Estado"
                      value={
                        <View style={styles.iconRow}>
                          <Check width={14} height={14} color={theme.colors.success} />
                          <Text style={[styles.rowValue, { color: theme.colors.success }]}>Confirmada</Text>
                        </View>
                      }
                    />
                    <Row
                      label="Participación"
                      value={
                        <View style={styles.iconRow}>
                          {ticketDetail.is_open ? (
                            <LockOpen width={14} height={14} color={theme.colors.primary} />
                          ) : (
                            <Lock width={14} height={14} color={theme.colors.muted} />
                          )}
                          <Text style={[styles.rowValue, { color: ticketDetail.is_open ? theme.colors.primary : theme.colors.muted }]}>
                            {ticketDetail.is_open ? "Abierta" : "Cerrada"}
                          </Text>
                        </View>
                      }
                    />
                    <Row label="Cancha" value={state.reservation.courtName} />
                    <Row label="Fecha" value={formatShortDate(state.reservation.date)} />
                    <Row label="Hora" value={`${ticketDetail.start_time.slice(0, 5)} – ${addMinutes(ticketDetail.start_time.slice(0, 5), ticketDetail.duration_minutes)}`} />
                    <Row
                      label="Duración"
                      value={
                        ticketDetail.extra_minutes > 0
                          ? `${durationLabel(ticketDetail.duration_minutes)} (incluye ${ticketDetail.extra_minutes} min extra)`
                          : durationLabel(ticketDetail.duration_minutes)
                      }
                    />
                    <Row label="Tipo" value={RESERVATION_TYPE_LABELS[state.reservation.type] ?? state.reservation.type} />
                    <Row label="Título" value={state.reservation.title} />
                  </DetailCard>

                  {effectivePlayers.length > 0 && (
                    <DetailCard title={`Jugadores (${effectivePlayers.length})`}>
                      {effectivePlayers.map((name, i) => (
                        <Text key={i} style={styles.playerLine}>
                          {name}
                        </Text>
                      ))}
                    </DetailCard>
                  )}

                  {(ticketDetail.price_amount != null || ticketDetail.extra_minutes > 0) && (
                    <DetailCard title="Cobro">
                      {ticketDetail.price_amount != null && ticketDetail.price_currency && (
                        <Row label="Precio base" value={formatCurrency(ticketDetail.price_amount, ticketDetail.price_currency)} />
                      )}
                      {ticketDetail.extra_minutes > 0 && (
                        <>
                          <Row label="Tiempo extra" value={`${ticketDetail.extra_minutes} min`} />
                          <Row label="Valor extra" value={formatCurrency(ticketDetail.extra_amount, ticketDetail.extra_currency ?? "COP")} />
                        </>
                      )}
                      {ticketDetail.price_amount != null && (
                        <View style={styles.totalRow}>
                          <Text style={styles.totalLabel}>Total</Text>
                          <Text style={styles.totalValue}>
                            {formatCurrency((ticketDetail.price_amount ?? 0) + ticketDetail.extra_amount, ticketDetail.price_currency ?? ticketDetail.extra_currency ?? "COP")}
                          </Text>
                        </View>
                      )}
                    </DetailCard>
                  )}

                  <DetailCard>
                    <Row label="Creada por" value={ticketDetail.creator_name} />
                    <Row label="Origen" value={ticketDetail.creator_is_player ? "Solicitud aprobada" : "Creada por el club"} />
                  </DetailCard>

                  {ticketDetail.notes && (
                    <DetailCard title="Notas">
                      <Text style={styles.notes}>{ticketDetail.notes}</Text>
                    </DetailCard>
                  )}

                  {/* Solicitudes pendientes para unirse — creador/OWNER/ADMIN
                      (sección 3). El panel siempre es OWNER/ADMIN (solo se
                      abre desde Agenda), así que no hace falta un chequeo
                      extra de "can_manage" acá — la RPC igual re-valida todo
                      server-side, igual que la web. */}
                  {pendingJoinRequests.length > 0 && editPolicy?.actions.manageJoinRequests && (
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

                  {openStatusError && <Text style={styles.errorText}>{openStatusError}</Text>}

                  {editPolicy?.actions.toggleOpen && (
                    <TouchableOpacity
                      onPress={() => handleToggleOpen(!ticketDetail.is_open)}
                      disabled={togglingOpen}
                      style={[styles.button, styles.buttonSecondary, styles.buttonFullWidth]}
                    >
                      {togglingOpen ? (
                        <ActivityIndicator color={theme.colors.white} />
                      ) : (
                        <>
                          {ticketDetail.is_open ? <Lock width={14} height={14} color={theme.colors.white} /> : <LockOpen width={14} height={14} color={theme.colors.white} />}
                          <Text style={styles.buttonSecondaryTextStrong}>{ticketDetail.is_open ? "Cerrar reserva" : "Abrir reserva"}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {editPolicy?.actions.addExtraTime && (
                    <TouchableOpacity onPress={() => setExtraTimeModalOpen(true)} style={[styles.button, styles.buttonSecondary, styles.buttonFullWidth]}>
                      <Timer width={14} height={14} color={theme.colors.white} />
                      <Text style={styles.buttonSecondaryTextStrong}>Agregar tiempo extra</Text>
                    </TouchableOpacity>
                  )}

                  {/* "¿Cancelar esta reserva?" — solo puede aparecer cuando
                      cancelar sigue siendo una acción válida (nunca para una
                      reserva pasada, ver editPolicy.actions.cancel). */}
                  {confirmingCancel && editPolicy?.actions.cancel && (
                    <View style={styles.cancelConfirmBox}>
                      <Text style={styles.cancelConfirmTitle}>¿Cancelar esta reserva?</Text>
                      <Text style={styles.cancelConfirmSubtitle}>Esta acción liberará el horario de la cancha.</Text>
                      <View style={styles.actionsRow}>
                        <TouchableOpacity onPress={() => setConfirmingCancel(false)} disabled={cancelling} style={[styles.button, styles.buttonSecondary]}>
                          <Text style={styles.buttonSecondaryText}>Volver</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleCancelPress} disabled={cancelling} style={[styles.button, styles.buttonDangerOutline]}>
                          {cancelling ? <ActivityIndicator color={theme.colors.danger} /> : <Text style={styles.buttonDangerOutlineText}>Confirmar</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Cancelar/Editar — Editar siempre visible (una reserva
                      pasada solo restringe QUÉ campos edita, nunca oculta la
                      acción en sí; WeekReservationModal aplica la misma
                      política). Cancelar solo cuando la política lo permite,
                      y nunca junto con el cuadro de confirmación de arriba. */}
                  {!(confirmingCancel && editPolicy?.actions.cancel) && (
                    <View style={styles.actionsRow}>
                      {editPolicy?.actions.cancel && (
                        <TouchableOpacity onPress={() => setConfirmingCancel(true)} style={[styles.button, styles.buttonDangerOutline]}>
                          <XCircle width={14} height={14} color={theme.colors.danger} />
                          <Text style={styles.buttonDangerOutlineText}>Cancelar</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => onEdit(state.reservation)} style={[styles.button, styles.buttonPrimary]}>
                        <Pencil width={14} height={14} color={theme.colors.bg} />
                        <Text style={styles.buttonPrimaryText}>Editar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.notFound}>No se pudo cargar la reserva.</Text>
              ))}
          </ScrollView>
        </View>
      </View>

      {state?.mode === "pending" && (
        <RejectReservationModal
          visible={rejectModalOpen}
          pending={rejecting}
          error={rejectError}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectModalOpen(false)}
          onDismiss={handleRejectModalDismiss}
        />
      )}

      {state?.mode === "view" && ticketDetail && (
        <AddExtraTimeModal
          visible={extraTimeModalOpen}
          pending={addingExtraTime}
          error={extraTimeError}
          startTime={ticketDetail.start_time.slice(0, 5)}
          currentDurationMinutes={ticketDetail.duration_minutes}
          currentEndTime={addMinutes(ticketDetail.start_time.slice(0, 5), ticketDetail.duration_minutes)}
          priceAmount={ticketDetail.price_amount}
          existingExtraAmount={ticketDetail.extra_amount}
          currency={ticketDetail.price_currency ?? ticketDetail.extra_currency ?? "COP"}
          onConfirm={handleAddExtraTimeConfirm}
          onCancel={() => setExtraTimeModalOpen(false)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderBottomWidth: 0,
    maxHeight: "90%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  closeButton: { padding: 6, borderRadius: 8 },
  loadingBody: { paddingVertical: 60, alignItems: "center" },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 12 },
  card: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 16, paddingVertical: 6 },
  cardTitle: { fontSize: 11, fontWeight: "600", color: "rgba(148,163,184,0.5)", textTransform: "uppercase", letterSpacing: 0.5, paddingTop: 10, paddingBottom: 4 },
  row: { paddingVertical: 8, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.05)" },
  rowLabel: { fontSize: 11, letterSpacing: 0.5, color: "rgba(148,163,184,0.5)", fontWeight: "500", textTransform: "uppercase" },
  rowValue: { fontSize: 14, color: theme.colors.white },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  playerLine: { fontSize: 14, color: theme.colors.white, paddingVertical: 6 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, paddingBottom: 8 },
  totalLabel: { fontSize: 11, fontWeight: "700", color: "rgba(148,163,184,0.6)", textTransform: "uppercase", letterSpacing: 0.5 },
  totalValue: { fontSize: 18, fontWeight: "700", color: theme.colors.primary },
  notes: { fontSize: 14, color: theme.colors.white, paddingVertical: 8 },
  errorText: { fontSize: 12, color: theme.colors.danger },
  actionsRow: { flexDirection: "row", gap: 10 },
  button: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 12 },
  buttonSecondary: { borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  buttonSecondaryText: { fontSize: 14, fontWeight: "600", color: theme.colors.muted },
  buttonSecondaryTextStrong: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
  buttonFullWidth: { flex: undefined, width: "100%" },
  buttonApprove: { backgroundColor: theme.colors.success },
  buttonApproveText: { fontSize: 14, fontWeight: "700", color: theme.colors.bg },
  buttonPrimary: { backgroundColor: theme.colors.primary },
  buttonPrimaryText: { fontSize: 14, fontWeight: "700", color: theme.colors.bg },
  buttonDangerOutline: { borderWidth: 1, borderColor: "rgba(248,113,113,0.3)" },
  buttonDangerOutlineText: { fontSize: 14, fontWeight: "600", color: theme.colors.danger },
  cancelConfirmBox: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(248,113,113,0.3)", backgroundColor: "rgba(248,113,113,0.05)", padding: 16, gap: 10 },
  cancelConfirmTitle: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
  cancelConfirmSubtitle: { fontSize: 12, color: theme.colors.muted },
  notFound: { fontSize: 14, color: theme.colors.muted, textAlign: "center", paddingVertical: 32 },
});
