import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronLeft, Lock, LockOpen, Pencil } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useClub } from "../contexts/ClubContext";
import { getReservationShareDetail, type ReservationShareDetail } from "../lib/reservationShareDetail";
import { DETAIL_STATUS } from "../lib/reservationStatus";
import { theme } from "../lib/theme";
import { Skeleton } from "../components/Skeleton";
import { ShareActions } from "../components/ShareActions";
import { addMinutes } from "../lib/time";
import { formatShortDate, WEEKDAY, MONTH } from "../lib/dateFormat";
import { durationLabel, getClubDurations } from "../lib/durations";
import { canPlayerCancelReservation } from "../lib/reservationActivity";
import { buildReservationSlug } from "../lib/reservationSlug";
import { buildReservationShareMessage, SITE_URL } from "../lib/reservationShare";
import { cancelReservation } from "../lib/cancelReservation";
import { getClubMembers } from "../lib/players";
import { WeekReservationModal, type Member } from "../components/WeekReservationModal";
import type { CalendarCourt, CalendarReservation, WeekDay } from "../lib/weekCalendar";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { navigateIntoApp } from "../navigation/navigateIntoApp";

// Screen del stack RAÍZ (RootNavigator.tsx), no de ReservationsStack — así
// una reserva abierta desde Notifications/push/Reservaciones queda en el
// MISMO historial real de RootStack: navigation acá YA es
// NativeStackNavigationProp<RootStackParamList>, sin necesitar un segundo
// "escape hatch" (rootNavigation) como antes.
type Props = NativeStackScreenProps<RootStackParamList, "ReservationDetail">;

// Idéntico a TYPE_LABELS en ReservationShareView.tsx (app web).
const TYPE_LABELS: Record<string, string> = { match: "Partido", class: "Clase", block: "Bloqueo" };

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Equivalente RN de ReservationShareView.tsx (app web) — misma fuente de
// datos exacta (get_reservation_share_detail, ver reservationShareDetail.ts),
// mismas dos DetailCard (Estado/Participación/Cancha/Fecha/Hora/Duración/
// Tipo/Valor — luego Creador/Jugadores/Cupo/Compartir), mismo banner
// primario por prioridad. Cancelar/Editar para el creador PLAYER: par
// completo (Cancelar + Editar) mientras la solicitud sigue pending; solo
// Cancelar una vez confirmed (mismo alcance que ReservationShareView.tsx —
// editar una reserva confirmada del propio jugador vive en el calendario,
// fuera de este ajuste). Ambos casos comparten exactamente la misma Server
// Action/regla de 2 horas (cancelReservation → cancel_reservation RPC,
// canPlayerCancelReservation) que ya usa la tarjeta de "Mis reservas" —
// nunca una segunda implementación. "Aceptar solicitudes de jugadores"/
// "Solicitar unirme" (el switch y el flujo de join-request) siguen sin
// replicarse — otro módulo. El avatar de "Jugadores" es una versión
// simplificada (foto o iniciales) — no el PlayerSportAvatar real con
// anillo de categoría/corona, que es infraestructura del módulo
// Sport/Ranking.
//
// "Editar" para OWNER/ADMIN sí se agrega acá (a diferencia del comentario
// original de este archivo) — esta pantalla es un punto de entrada real
// (deep link/notificación/"Copiar enlace" propio) distinto de
// ReservationTicketPanel (Agenda), y antes de este cambio un OWNER/ADMIN
// que llegaba por acá para una reserva confirmada — pasada o no — no tenía
// ninguna acción administrativa, solo WhatsApp/Copiar enlace. Reutiliza el
// mismo WeekReservationModal (mode="edit") que Agenda ya usa, que aplica
// getReservationAdminEditPolicy internamente sin que esta pantalla
// necesite duplicar esa regla. Cancelar/Abrir-Cerrar/tiempo extra para
// OWNER/ADMIN siguen sin agregarse acá — fuera de alcance de este ajuste.
export function ReservationDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  // currentClub: el club activo del viewer (useClub) — deliberadamente
  // distinto de `club` más abajo (detail.club, el club DUEÑO de la
  // reserva). Casi siempre el mismo club, pero son dos fuentes distintas
  // — nunca renombrar detail.club para "simplificar" este alias.
  const { club: currentClub, role } = useClub();
  const isOwnerOrAdmin = role === "OWNER" || role === "ADMIN";

  // Mismo patrón de "volver" que NotificationsScreen.tsx → handleBack:
  // goBack() si hay historial real en el stack raíz (Notifications,
  // Reservaciones, o lo que estuviera debajo) — siempre lo hay salvo
  // entrada directa por push en cold start; si no, cae al Dashboard.
  // navigation ya es NativeStackNavigationProp<RootStackParamList> (Props),
  // así que navigateIntoApp lo usa directo, sin un segundo escape hatch.
  // Esta screen vive en el stack raíz (no dentro de ReservationsStack), así
  // que cubre toda la pantalla igual que cualquier otra screen del stack —
  // el tab bar de "App" queda tapado automáticamente, sin necesidad de
  // ocultarlo a mano.
  function handleBack() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigateIntoApp(navigation);
    }
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.backButton} accessibilityLabel="Volver">
          <ChevronLeft width={24} height={24} color={theme.colors.white} />
        </TouchableOpacity>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  const [detail, setDetail] = useState<ReservationShareDetail | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Datos de apoyo para WeekReservationModal (mode="edit") — mismas
  // queries que ReservationsListScreen ya usa para su propio modal de
  // Semana/Agenda, cargadas solo para OWNER/ADMIN. allowedDurations tiene
  // el mismo fallback [60,90,120] que getClubDurations ya define.
  const [editCourts, setEditCourts] = useState<CalendarCourt[]>([]);
  const [editMembers, setEditMembers] = useState<Member[]>([]);
  const [editAllowedDurations, setEditAllowedDurations] = useState<number[]>([60, 90, 120]);
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    if (!isOwnerOrAdmin || !currentClub) return;
    supabase
      .from("courts")
      .select("id, name, sort_order")
      .eq("club_id", currentClub.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setEditCourts((data ?? []).map((c, i) => ({ id: c.id, name: c.name, colorIndex: i })));
      });
    supabase
      .from("clubs")
      .select("allowed_reservation_durations")
      .eq("id", currentClub.id)
      .single()
      .then(({ data }) => {
        setEditAllowedDurations(getClubDurations((data as { allowed_reservation_durations?: number[] } | null)?.allowed_reservation_durations));
      });
    getClubMembers(supabase, currentClub.id, "active").then((rows) => {
      setEditMembers(rows.map((m) => ({ profile_id: m.profile_id, full_name: m.profiles?.full_name ?? null })));
    });
  }, [isOwnerOrAdmin, currentClub?.id]);

  const load = useCallback(async () => {
    const result = await getReservationShareDetail(supabase, id);
    if (result.error) {
      setDetail(null);
      setLoadError(
        result.error === "not_found"
          ? "No encontramos esta reserva."
          : result.error === "not_authorized"
          ? "No tienes acceso a esta reserva."
          : "Error al cargar la reserva."
      );
      return;
    }
    setDetail(result.data);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (detail === undefined) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.content}>
          <Skeleton style={{ height: 20, width: "60%" }} />
          <Skeleton style={{ height: 200, borderRadius: 12 }} />
          <Skeleton style={{ height: 140, borderRadius: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (detail === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.content}>
          <Text style={styles.notFound}>{loadError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { reservation, club, can_manage, player_count, players, am_participant } = detail;
  const reservationId = reservation.id;
  const statusCfg = DETAIL_STATUS[reservation.status];
  const StatusIcon = statusCfg.icon;
  const start = reservation.start_time.slice(0, 5);
  const end = addMinutes(start, reservation.duration_minutes);
  const dateLabel = formatShortDate(reservation.date);
  // Idéntico a isOpenBadgeActive en ReservationShareView.tsx.
  const isOpenBadgeActive = (reservation.status === "confirmed" || reservation.status === "pending") && reservation.is_open;
  // players ya incluye al creador cuando es PLAYER — mostrar la sección
  // solo cuando hay alguien más allá de él (showPlayersSection en la web).
  const showPlayersSection = players.some((p) => p.profile_id !== reservation.created_by);

  const shareSlug = buildReservationSlug({
    creatorName: reservation.creator_name,
    date: reservation.date,
    startTime: reservation.start_time,
    id: reservation.id,
  });
  const shareUrl = `${SITE_URL}/${club.slug}/reservations/${shareSlug}`;
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

  // Mismo orden de prioridad que ReservationShareView.tsx — nunca dos
  // banners a la vez. "Solicitar unirme" (showJoinCta) no se replica: ese
  // flujo completo (reservation_join_requests) es otro módulo.
  let primary: { kind: "success" | "warning" | "info"; text: string } | null = null;
  if (reservation.status === "cancelled") {
    primary = { kind: "warning", text: "Reserva cancelada." };
  } else if (reservation.status === "rejected") {
    primary = { kind: "warning", text: "Esta solicitud de reserva fue rechazada por el club." };
  } else if (reservation.status === "expired") {
    primary = { kind: "warning", text: "Esta solicitud expiró porque el club no la aprobó antes del horario programado." };
  } else if (reservation.status === "pending") {
    primary = { kind: "info", text: "Esta reserva está pendiente de aprobación por el club." };
  } else if (can_manage) {
    // Igual que la web: quien administra la reserva (creador u OWNER/
    // ADMIN) no ve ningún banner primario acá.
  } else if (am_participant) {
    primary = { kind: "success", text: "Ya haces parte de esta reserva." };
  } else if (!reservation.is_open) {
    primary = { kind: "warning", text: "Reserva cerrada." };
  }

  const showPlayerPendingActions = reservation.status === "pending" && reservation.is_creator;
  // Cancelar — creador PLAYER de una reserva ya CONFIRMED (nunca
  // OWNER/ADMIN). Misma Server Action/regla de 2 horas
  // (canPlayerCancelReservation, shared/reservations/eligibility.ts) que ya
  // usa el bloque de solicitud pendiente de arriba — antes esta pantalla
  // nunca ofrecía cancelar una reserva ya confirmada, aunque
  // cancel_reservation ya lo permitía server-side (paridad con
  // ReservationShareView.tsx, app web). Solo Cancelar, nunca Editar (eso
  // sigue siendo exclusivo de OWNER/ADMIN acá, ver showEditAction).
  const showPlayerConfirmedCancelAction = reservation.status === "confirmed" && reservation.is_creator && !isOwnerOrAdmin;
  const canPlayerActNow = canPlayerCancelReservation(reservation);

  // Editar — OWNER/ADMIN, reserva confirmada (mismo alcance que
  // showConfirmedAdminActions en ReservationShareView.tsx, app web).
  // Nunca para PLAYER, y nunca para otro estado: pending tiene su propio
  // flujo de aprobar/rechazar (fuera de esta pantalla), cancelada/
  // rechazada/expirada no se editan.
  const showEditAction = isOwnerOrAdmin && reservation.status === "confirmed";

  // Solo lo que WeekReservationModal realmente lee de este objeto es
  // `.id` — el resto se recarga fresco adentro vía
  // getReservationForEditAdmin(reservation.id), igual que cuando se abre
  // desde ReservationTicketPanel (Agenda). Placeholders type-safe para los
  // campos que este objeto nunca usa.
  const reservationForEdit: CalendarReservation = {
    id: reservation.id,
    date: reservation.date,
    start_time: reservation.start_time,
    duration_minutes: reservation.duration_minutes,
    type: reservation.type,
    title: null,
    court_id: "",
    courtName: reservation.court_name ?? "",
    players: [],
    created_by: reservation.created_by,
  };
  // dayName/dayNum/monthName reales (nunca placeholders) — mismo parseo
  // local-safe y mismos arreglos WEEKDAY/MONTH que formatShortDate ya usa
  // arriba para dateLabel, así el pill de Fecha dentro de
  // WeekReservationModal ({d.dayName} {d.dayNum}) muestra "mar 11" en vez
  // de "0" (placeholder dayNum:0 con dayName:"" que tenía antes). Un solo
  // día basta acá — este entry point nunca ofreció un rango de días
  // seleccionable, ver comentario de reservationForEdit arriba.
  const [editYear, editMonth, editDay] = reservation.date.split("-").map(Number);
  const editDateObj = new Date(editYear, editMonth - 1, editDay);
  const editWeekDays: WeekDay[] = [
    {
      date: reservation.date,
      dayName: WEEKDAY[editDateObj.getDay()],
      dayNum: editDateObj.getDate(),
      monthName: MONTH[editDateObj.getMonth()],
    },
  ];

  function handleCancelPress() {
    const title = showPlayerPendingActions ? "¿Cancelar esta solicitud?" : "¿Cancelar esta reserva?";
    Alert.alert(title, "Esta acción no se puede deshacer.", [
      { text: "Volver", style: "cancel" },
      {
        text: "Confirmar",
        style: "destructive",
        onPress: async () => {
          setCancelling(true);
          const result = await cancelReservation(supabase, reservationId);
          setCancelling(false);
          if (result.error) {
            Alert.alert("No se pudo cancelar", result.error);
            return;
          }
          load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.h1}>Detalle de la reserva</Text>
          <Text style={styles.subtitle}>{club.name}</Text>
        </View>

        <DetailCard>
          <Row
            label="Estado"
            value={
              <View style={styles.iconRow}>
                <StatusIcon width={14} height={14} color={statusCfg.color} />
                <Text style={[styles.rowValue, { color: statusCfg.color }]}>{statusCfg.label}</Text>
              </View>
            }
          />
          <Row
            label="Participación"
            value={
              <View style={styles.iconRow}>
                {isOpenBadgeActive ? (
                  <LockOpen width={14} height={14} color={theme.colors.primary} />
                ) : (
                  <Lock width={14} height={14} color={theme.colors.muted} />
                )}
                <Text style={[styles.rowValue, { color: isOpenBadgeActive ? theme.colors.primary : theme.colors.muted }]}>
                  {isOpenBadgeActive ? "Abierta" : "Cerrada"}
                </Text>
              </View>
            }
          />
          <Row label="Cancha" value={<Text style={styles.rowValue}>{reservation.court_name ?? "—"}</Text>} />
          <Row label="Fecha" value={<Text style={styles.rowValue}>{dateLabel}</Text>} />
          <Row label="Hora" value={<Text style={styles.rowValue}>{`${start} – ${end}`}</Text>} />
          <Row label="Duración" value={<Text style={styles.rowValue}>{durationLabel(reservation.duration_minutes)}</Text>} />
          <Row label="Tipo" value={<Text style={styles.rowValue}>{TYPE_LABELS[reservation.type] ?? reservation.type}</Text>} />
          {reservation.price_amount != null && (
            <Row
              label="Valor"
              value={<Text style={styles.rowValue}>{formatCurrency(reservation.price_amount, reservation.price_currency ?? "COP")}</Text>}
              last
            />
          )}
        </DetailCard>

        <DetailCard>
          {reservation.creator_name && <Row label="Creador" value={<Text style={styles.rowValue}>{reservation.creator_name}</Text>} />}

          {showPlayersSection && (
            <View style={styles.playersBlock}>
              <Text style={styles.rowLabel}>Jugadores ({players.length})</Text>
              <View style={styles.playersList}>
                {players.map((p) => (
                  <View key={p.profile_id} style={styles.playerRow}>
                    {p.avatar_url ? (
                      <Image source={{ uri: p.avatar_url }} style={styles.playerAvatar} />
                    ) : (
                      <View style={[styles.playerAvatar, styles.playerAvatarFallback]}>
                        <Text style={styles.playerAvatarText}>{getInitials(p.full_name ?? "?")}</Text>
                      </View>
                    )}
                    <Text style={styles.playerName} numberOfLines={1}>
                      {p.full_name ?? "Jugador"}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Row label="Cupo" value={<Text style={styles.rowValue}>{`Jugadores ${player_count} / 4`}</Text>} last />

          <View style={styles.shareBlock}>
            <ShareActions url={shareUrl} message={shareMessage} />
          </View>
        </DetailCard>

        {(primary || showPlayerPendingActions || showPlayerConfirmedCancelAction || showEditAction) && (
          <View style={styles.actionsSection}>
            {primary && (
              <View
                style={[
                  styles.banner,
                  primary.kind === "success" && styles.bannerSuccess,
                  primary.kind === "warning" && styles.bannerWarning,
                  primary.kind === "info" && styles.bannerInfo,
                ]}
              >
                <Text
                  style={[
                    styles.bannerText,
                    primary.kind === "success" && { color: theme.colors.success },
                    primary.kind === "warning" && { color: theme.colors.danger },
                    primary.kind === "info" && { color: theme.colors.muted },
                  ]}
                >
                  {primary.text}
                </Text>
              </View>
            )}

            {(showPlayerPendingActions || showPlayerConfirmedCancelAction) &&
              (cancelling ? (
                <ActivityIndicator color={theme.colors.danger} />
              ) : canPlayerActNow ? (
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancelPress} activeOpacity={0.85}>
                  <Text style={styles.cancelButtonText}>{showPlayerPendingActions ? "Cancelar" : "Cancelar reserva"}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.windowClosed}>
                  {showPlayerPendingActions
                    ? "Ya no se puede editar ni cancelar (faltan menos de 2 horas)"
                    : "Ya no se puede cancelar (faltan menos de 2 horas)"}
                </Text>
              ))}

            {showEditAction && (
              <TouchableOpacity style={styles.editButton} onPress={() => setEditModalOpen(true)} activeOpacity={0.85}>
                <Pencil width={14} height={14} color={theme.colors.bg} />
                <Text style={styles.editButtonText}>Editar</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {showEditAction && (
        <WeekReservationModal
          visible={editModalOpen}
          mode="edit"
          reservation={reservationForEdit}
          weekDays={editWeekDays}
          courts={editCourts}
          members={editMembers}
          allowedDurations={editAllowedDurations}
          clubId={currentClub?.id ?? ""}
          onClose={() => setEditModalOpen(false)}
          onSuccess={() => {
            setEditModalOpen(false);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}

// Traducción 1:1 de DetailCard en ReservationShareView.tsx: rounded-xl(12)
// border border-white/10 bg-white/[0.03] px-4(16) py-1(4).
function DetailCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

// Traducción 1:1 de Row: flex-col gap-0.5(2) py-2.5(10) border-b
// border-white/5, sin borde en el último elemento visible de la tarjeta
// (`last` prop, ya que en RN no existe `last:border-0`). label
// text-[11px](11) uppercase tracking-wider text-brand-muted/50
// font-medium; value text-sm(14) text-white sin negrita.
function Row({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  backButton: { paddingHorizontal: 8, paddingVertical: 4 },
  content: { padding: 20, paddingTop: 24, gap: 16, maxWidth: 512, width: "100%", alignSelf: "center" },
  h1: { color: theme.colors.white, fontSize: 20, fontWeight: "700" },
  subtitle: { color: theme.colors.muted, fontSize: 13, marginTop: 4 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: { paddingVertical: 10, gap: 2 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  rowLabel: { fontSize: 11, letterSpacing: 0.5, color: "rgba(148,163,184,0.5)", fontWeight: "500", textTransform: "uppercase" },
  rowValue: { fontSize: 14, color: theme.colors.white, fontWeight: "400" },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  playersBlock: { paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  playersList: { gap: 6, paddingTop: 2 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  playerAvatar: { width: 24, height: 24, borderRadius: 12 },
  playerAvatarFallback: { backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  playerAvatarText: { fontSize: 9, fontWeight: "700", color: theme.colors.white },
  playerName: { fontSize: 14, color: theme.colors.white, flexShrink: 1 },
  shareBlock: { paddingVertical: 12 },
  actionsSection: { gap: 16, paddingTop: 16, marginTop: 4, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  banner: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  bannerSuccess: { borderColor: "rgba(0,255,0,0.2)", backgroundColor: "rgba(0,255,0,0.05)" },
  bannerWarning: { borderColor: "rgba(239,68,68,0.2)", backgroundColor: "rgba(239,68,68,0.05)" },
  bannerInfo: { borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)" },
  bannerText: { fontSize: 14 },
  cancelButton: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: { color: theme.colors.danger, fontSize: 14, fontWeight: "500" },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  editButtonText: { color: theme.colors.bg, fontSize: 14, fontWeight: "700" },
  windowClosed: { fontSize: 12, color: "rgba(148,163,184,0.6)" },
  notFound: { color: theme.colors.muted, fontSize: 14, textAlign: "center", marginTop: 40 },
});
