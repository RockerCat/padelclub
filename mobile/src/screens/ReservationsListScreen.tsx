import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Check, CalendarOff, Clock, ChevronLeft, ChevronRight, ChevronDown, Plus } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { getPlayerReservations, type MyReservation } from "../lib/playerReservations";
import { sortBookingsByProximity, filterVisibleRequests } from "../lib/reservationActivity";
import { useDismissedReservationIds } from "../lib/dismissedReservations";
import { usePanelSectionExpanded } from "../lib/panelSections";
import { usePlayerReservationsRealtime } from "../lib/playerReservationsRealtime";
import { computeAvailability, type RawReservation } from "../lib/courtDayAvailability";
import type { OperatingHour } from "../lib/operatingHours";
import { getClubDurations, durationOptions } from "../lib/durations";
import { timeToMins, buildDayGrid } from "../lib/time";
import { theme } from "../lib/theme";
import { Skeleton } from "../components/Skeleton";
import { ActivityCard } from "../components/ActivityCard";
import { PanelSectionHeader } from "../components/PanelSectionHeader";
import { DayRangeNav, type DayRangeDay } from "../components/DayRangeNav";
import { AvailabilityLegend } from "../components/AvailabilityLegend";
import { CourtAvailabilityCard, type OwnTone, type OccupiedTone } from "../components/CourtAvailabilityCard";
import { RequestModal, type ModalSlot } from "../components/RequestModal";
import { WeekDayTabs } from "../components/WeekDayTabs";
import { WeekReservationCard } from "../components/WeekReservationCard";
import { WeekReservationModal, type Member } from "../components/WeekReservationModal";
import { getClubMembers } from "../lib/players";
import { getWeekCalendarData, type CalendarCourt, type CalendarReservation, type WeekDay } from "../lib/weekCalendar";
import { courtColor } from "../lib/courtColors";
import { PendingRequestsSection } from "../components/PendingRequestsSection";
import { RejectedReservationsSection } from "../components/RejectedReservationsSection";
import { ReservationTicketPanel, type TicketPanelState } from "../components/ReservationTicketPanel";
import { getAdminReservationRequests, type PendingRequest, type RejectedReservation } from "../lib/reservationAdminRequests";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Court = { id: string; name: string; surface: string | null; is_indoor: boolean | null };

// ─── Date helpers — traducción 1:1 de page.tsx (app web) ──────────────────────
function getWeekMonday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const WEEKDAY = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function formatRangeLabel(start: Date, end: Date): string {
  return `${start.getDate()} ${MONTH[start.getMonth()]} – ${end.getDate()} ${MONTH[end.getMonth()]}`;
}

// filterSlotsByDuration — idéntico a PlayerAvailabilityCalendar.tsx: un
// slot libre a granularidad mínima solo cuenta como disponible para la
// duración ELEGIDA si cabe completa antes del cierre y no choca con
// ningún bloque existente.
function filterSlotsByDuration(baseSlots: string[], duration: number, closingMins: number | undefined, blocked: Array<[number, number]>): string[] {
  return baseSlots.filter((slot) => {
    const start = timeToMins(slot);
    const end = start + duration;
    if (closingMins !== undefined && end > closingMins) return false;
    return !blocked.some(([rStart, rEnd]) => start < rEnd && end > rStart);
  });
}

// Tono propio por slot — igual criterio que myBookingAt en la web: un tick
// ocupado que cae dentro de una reserva propia se pinta aprobada/pendiente
// en vez de "ocupado" genérico, y se puede tocar para ir al detalle.
function computeOwnTones(
  courtId: string,
  date: string,
  grid: string[],
  myBookings: MyReservation[],
  myPending: MyReservation[]
): { tones: Record<string, OwnTone>; idByTick: Record<string, string> } {
  const tones: Record<string, OwnTone> = {};
  const idByTick: Record<string, string> = {};
  const own = [
    ...myBookings.map((r) => ({ r, tone: "approved" as OwnTone })),
    ...myPending.map((r) => ({ r, tone: "pending" as OwnTone })),
  ].filter(({ r }) => r.court_id === courtId && r.date === date);

  for (const tick of grid) {
    const tickMins = timeToMins(tick);
    const match = own.find(({ r }) => {
      const rStart = timeToMins(r.start_time.slice(0, 5));
      return tickMins >= rStart && tickMins < rStart + r.duration_minutes;
    });
    if (match) {
      tones[tick] = match.tone;
      idByTick[tick] = match.r.id;
    }
  }
  return { tones, idByTick };
}

// Jugadores efectivos de una reserva ajena para mostrar en el tick ocupado —
// traducción 1:1 de effectivePlayersFor (AdminAvailabilityView.tsx, app
// web): jugadores reales de reservation_players primero; si no hay y la
// reserva viene de una solicitud aprobada (su creador es un PLAYER activo
// del club, nunca OWNER/ADMIN), ese creador; si no, ninguno. "block" nunca
// tiene jugadores.
function effectivePlayersForOccupied(reservation: CalendarReservation, members: Member[]): string[] {
  if (reservation.players.length > 0) return reservation.players;
  if (reservation.type === "block") return [];
  const requester = members.find((m) => m.profile_id === reservation.created_by);
  return requester?.full_name ? [requester.full_name] : [];
}

// Tono + label por tick para una reserva ajena (Agenda, OWNER/ADMIN) —
// traducción 1:1 de confirmedRangesFor/pendingRangesFor/occupiedLabelFor
// (AdminAvailabilityView.tsx, app web): un partido confirmado pinta verde,
// una clase azul, un bloqueo lila, una solicitud pendiente ámbar — nunca se
// deriva de myBookings/myPendingOnly (siempre vacíos para OWNER/ADMIN), sino
// de agendaConfirmedReservations/agendaPending, ya cargadas para el tap-to-
// view existente.
function computeOccupiedTones(
  courtId: string,
  date: string,
  grid: string[],
  confirmed: CalendarReservation[],
  pending: PendingRequest[],
  members: Member[]
): { tones: Record<string, OccupiedTone>; labels: Record<string, string | null> } {
  const tones: Record<string, OccupiedTone> = {};
  const labels: Record<string, string | null> = {};
  for (const tick of grid) {
    const tickMins = timeToMins(tick);
    const conf = confirmed.find((r) => {
      if (r.court_id !== courtId || r.date !== date) return false;
      const s = timeToMins(r.start_time.slice(0, 5));
      return tickMins >= s && tickMins < s + r.duration_minutes;
    });
    if (conf) {
      tones[tick] = conf.type === "class" ? "class" : conf.type === "block" ? "block" : "approved";
      const players = effectivePlayersForOccupied(conf, members);
      labels[tick] = players.length > 0 ? players[0] : conf.type === "block" ? null : conf.title || "Club";
      continue;
    }
    const pend = pending.find((p) => {
      if (p.court_id !== courtId || p.date !== date) return false;
      const s = timeToMins(p.start_time.slice(0, 5));
      return tickMins >= s && tickMins < s + p.duration_minutes;
    });
    if (pend) {
      tones[tick] = "pending";
      labels[tick] = pend.playerName ?? "Club";
    }
  }
  return { tones, labels };
}

// Equivalente RN de page.tsx + PlayerAvailabilityCalendar.tsx (app web) —
// misma composición vertical completa: header "Disponibilidad" + club,
// banner de éxito, DayRangeNav, selector de Duración, AvailabilityLegend +
// grid de canchas con timeline de slots (o "Club cerrado este día"), y por
// último SidePanels ("Mis solicitudes"/"Mis reservas"). El RequestModal se
// monta al tocar un slot libre. No se replica: la navegación por query
// param (?week=/?reservationId=/?edit=1 — acá todo es estado local del
// screen), el flujo "Editar reserva" desde una tarjeta (requeriría pasar
// estado entre dos pantallas del stack nativo, no implementado todavía), y
// las variantes grid de 10/14 días de DayRangeNav (solo aplican desde xl,
// que nunca se alcanza en un teléfono).
export function ReservationsListScreen() {
  const { session } = useAuth();
  const { club, role, loading: clubLoading } = useClub();
  const isOwnerOrAdmin = role === "OWNER" || role === "ADMIN";
  // RootStackParamList (no ReservationsStackParamList): ReservationDetail
  // vive en el stack raíz (ver RootNavigator.tsx) — mismo "escape hatch" que
  // AppHeader.tsx/PushNotificationNavigator.tsx usan para lo mismo.
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const viewerId = session?.user?.id ?? "";

  const [anchorStart, setAnchorStart] = useState(() => getWeekMonday(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [selectedDuration, setSelectedDuration] = useState(60);

  const [courts, setCourts] = useState<Court[]>([]);
  const [opHours, setOpHours] = useState<OperatingHour[]>([]);
  const [rangeReservations, setRangeReservations] = useState<RawReservation[]>([]);
  const [allowedDurations, setAllowedDurations] = useState<number[]>([60, 90, 120]);
  const [myReservations, setMyReservations] = useState<MyReservation[]>([]);
  const [myBookings, setMyBookings] = useState<MyReservation[]>([]);

  const [loadingStatic, setLoadingStatic] = useState(true);
  const [loadingRange, setLoadingRange] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalSlot, setModalSlot] = useState<ModalSlot | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [view, setView] = useState<"agenda" | "semana">("agenda");

  // ─── Semana (OWNER/ADMIN) — estado independiente del de Agenda: la web
  // deriva ambas vistas del mismo ?week=, pero al no haber query params acá
  // cada una mantiene su propio ancla de semana (nunca se pisan entre sí al
  // cambiar de tab).
  const [semanaAnchor, setSemanaAnchor] = useState(() => getWeekMonday(new Date()));
  const [semanaSelectedDate, setSemanaSelectedDate] = useState(() => toDateStr(new Date()));
  const [semanaCourtFilter, setSemanaCourtFilter] = useState<string>("all");
  const [semanaCourts, setSemanaCourts] = useState<CalendarCourt[]>([]);
  const [semanaReservations, setSemanaReservations] = useState<CalendarReservation[]>([]);
  const [semanaClosedDays, setSemanaClosedDays] = useState<number[]>([]);
  const [semanaMembers, setSemanaMembers] = useState<Member[]>([]);
  const [loadingSemana, setLoadingSemana] = useState(true);
  const [courtFilterMenuOpen, setCourtFilterMenuOpen] = useState(false);
  const [reservationModal, setReservationModal] = useState<
    | { mode: "create"; initialDate: string; initialCourtId: string | null; initialStartTime?: string; weekDaysForModal: WeekDay[] }
    | { mode: "edit"; reservation: CalendarReservation }
    | null
  >(null);

  // ─── Solicitudes pendientes / rechazadas / tocar slot ocupado (Agenda,
  // OWNER/ADMIN) — gaps portados de PendingRequestsSection/
  // RejectedReservationsSection/ReservationTicketPanel (app web). agendaPending
  // se usa dos veces: para la sección de arriba Y para detectar qué reserva
  // pendiente cubre un tick tocado en el grid (handleSelectOccupied), igual
  // que AdminAvailabilityView reutiliza pendingRequests para lo mismo.
  const [agendaPending, setAgendaPending] = useState<PendingRequest[]>([]);
  const [agendaRejected, setAgendaRejected] = useState<RejectedReservation[]>([]);
  const [agendaConfirmedReservations, setAgendaConfirmedReservations] = useState<CalendarReservation[]>([]);
  const [ticketPanelState, setTicketPanelState] = useState<TicketPanelState | null>(null);

  const { dismissedIds, dismiss } = useDismissedReservationIds(club?.id ?? "");
  const solicitudes = usePanelSectionExpanded(club?.id ?? "", viewerId, "solicitudes");
  const reservas = usePanelSectionExpanded(club?.id ?? "", viewerId, "reservas");

  function todayStr(): string {
    const now = new Date();
    return toDateStr(now);
  }

  const loadStaticData = useCallback(async () => {
    if (!club) return;
    const [courtsRes, hoursRes, clubRes] = await Promise.all([
      supabase.from("courts").select("id, name, surface, is_indoor").eq("club_id", club.id).eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("club_operating_hours").select("day_of_week, is_open, opens_at, closes_at").eq("club_id", club.id),
      supabase.from("clubs").select("allowed_reservation_durations").eq("id", club.id).single(),
    ]);
    setCourts((courtsRes.data ?? []) as Court[]);
    setOpHours((hoursRes.data ?? []) as OperatingHour[]);
    const durations = getClubDurations((clubRes.data as { allowed_reservation_durations?: number[] } | null)?.allowed_reservation_durations);
    setAllowedDurations(durations);
    setSelectedDuration(durations[0] ?? 60);
  }, [club]);

  const loadRangeReservations = useCallback(async () => {
    if (!club) return;
    const rangeStartStr = toDateStr(anchorStart);
    const rangeEndStr = toDateStr(addDays(anchorStart, 6));
    const { data } = await supabase
      .from("reservations")
      .select("id, court_id, date, start_time, duration_minutes")
      .eq("club_id", club.id)
      .in("status", ["confirmed", "pending"])
      .gte("date", rangeStartStr)
      .lte("date", rangeEndStr);
    setRangeReservations((data ?? []) as RawReservation[]);
  }, [club, anchorStart]);

  const loadMyReservations = useCallback(async () => {
    if (!club || !session?.user) return;
    const data = await getPlayerReservations(supabase, club.id, session.user.id, todayStr());
    setMyReservations(data.myReservations);
    setMyBookings(data.myBookings);
  }, [club, session?.user]);

  const loadSemanaData = useCallback(async () => {
    if (!club) return;
    const mondayStr = toDateStr(semanaAnchor);
    const sundayStr = toDateStr(addDays(semanaAnchor, 6));
    const data = await getWeekCalendarData(supabase, club.id, mondayStr, sundayStr);
    setSemanaCourts(data.courts);
    setSemanaReservations(data.reservations);
    setSemanaClosedDays(data.closedDays);
  }, [club, semanaAnchor]);

  // "Solicitudes pendientes" (desde hoy en adelante, sin límite superior —
  // igual que page.tsx) + "Reservas rechazadas" (últimas 100) — mismo par
  // de queries que la web, un solo fetch batcheado de perfiles.
  const loadAdminRequests = useCallback(async () => {
    if (!club || !isOwnerOrAdmin) return;
    const { pending, rejected } = await getAdminReservationRequests(supabase, club.id, todayStr());
    setAgendaPending(pending);
    setAgendaRejected(rejected);
  }, [club, isOwnerOrAdmin]);

  // Reservas confirmadas con detalle completo (id/type/title/players/
  // created_by) para el rango de días que Agenda tiene visible ahora mismo
  // — reutiliza getWeekCalendarData (ya usado por Semana) en vez de una
  // tercera implementación de la misma query; rangeReservations (arriba)
  // sigue siendo solo para el cálculo de disponibilidad (court_id/date/
  // start_time/duration_minutes, confirmadas+pendientes, todos los roles).
  const loadAgendaConfirmedReservations = useCallback(async () => {
    if (!club || !isOwnerOrAdmin) return;
    const rangeStartStr = toDateStr(anchorStart);
    const rangeEndStr = toDateStr(addDays(anchorStart, 6));
    const data = await getWeekCalendarData(supabase, club.id, rangeStartStr, rangeEndStr);
    setAgendaConfirmedReservations(data.reservations);
  }, [club, isOwnerOrAdmin, anchorStart]);

  useEffect(() => {
    if (clubLoading || !club) return;
    setLoadingStatic(true);
    loadStaticData().finally(() => setLoadingStatic(false));
    loadMyReservations();
  }, [clubLoading, club, loadStaticData, loadMyReservations]);

  // Semana (WeekCalendar) es exclusiva de OWNER/ADMIN en WEB — la ruta
  // /admin/reservations completa (con su propio switcher Agenda/Semana)
  // nunca es alcanzable por PLAYER, que solo tiene /reservations (sin
  // Semana). PLAYER nunca dispara esta carga — ni la ve, ni la consulta.
  useEffect(() => {
    if (clubLoading || !club || !isOwnerOrAdmin) return;
    setLoadingSemana(true);
    loadSemanaData().finally(() => setLoadingSemana(false));
  }, [clubLoading, club, isOwnerOrAdmin, loadSemanaData]);

  // Solicitudes pendientes/rechazadas y reservas confirmadas con detalle
  // para Agenda — OWNER/ADMIN únicamente, igual gate que Semana arriba.
  useEffect(() => {
    if (clubLoading || !club || !isOwnerOrAdmin) return;
    loadAdminRequests();
    loadAgendaConfirmedReservations();
  }, [clubLoading, club, isOwnerOrAdmin, loadAdminRequests, loadAgendaConfirmedReservations]);

  // Jugadores del club para el selector "Jugadores" de WeekReservationModal
  // — mismo alcance que members en page.tsx (PLAYER activos), reutilizando
  // getClubMembers ya portado para la pantalla Jugadores en vez de una
  // segunda query. Solo relevante para Semana (OWNER/ADMIN) — mismo gate.
  useEffect(() => {
    if (clubLoading || !club || !isOwnerOrAdmin) return;
    getClubMembers(supabase, club.id, "active").then((rows) => {
      setSemanaMembers(rows.map((m) => ({ profile_id: m.profile_id, full_name: m.profiles?.full_name ?? null })));
    });
  }, [clubLoading, club, isOwnerOrAdmin]);

  useEffect(() => {
    if (clubLoading || !club) return;
    setLoadingRange(true);
    loadRangeReservations().finally(() => setLoadingRange(false));
  }, [clubLoading, club, loadRangeReservations]);

  usePlayerReservationsRealtime(
    useCallback(() => {
      loadMyReservations();
      loadRangeReservations();
    }, [loadMyReservations, loadRangeReservations])
  );

  useEffect(() => {
    if (!successBanner) return;
    const t = setTimeout(() => setSuccessBanner(null), 5000);
    return () => clearTimeout(t);
  }, [successBanner]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      loadStaticData(),
      loadRangeReservations(),
      loadMyReservations(),
      ...(isOwnerOrAdmin ? [loadAdminRequests(), loadAgendaConfirmedReservations()] : []),
    ]);
    setRefreshing(false);
  }

  // Refresca todo lo que una acción de admin (aprobar/rechazar/cancelar)
  // puede haber cambiado: la propia lista de solicitudes, el detalle de
  // reservas confirmadas de Agenda, y la disponibilidad general.
  function refreshAgendaAdminData() {
    loadAdminRequests();
    loadAgendaConfirmedReservations();
    loadRangeReservations();
  }

  // Reserva confirmada o solicitud pendiente que cubre un tick dado — misma
  // lógica que findConfirmed/findPending en AdminAvailabilityView (app web),
  // sobre los mismos datos ya cargados arriba (agendaConfirmedReservations/
  // agendaPending), nunca una consulta nueva por tap.
  function findConfirmedAt(courtId: string, date: string, startTime: string): CalendarReservation | undefined {
    const tickMins = timeToMins(startTime);
    return agendaConfirmedReservations.find((r) => {
      if (r.court_id !== courtId || r.date !== date) return false;
      const s = timeToMins(r.start_time.slice(0, 5));
      return tickMins >= s && tickMins < s + r.duration_minutes;
    });
  }
  function findPendingAt(courtId: string, date: string, startTime: string): PendingRequest | undefined {
    const tickMins = timeToMins(startTime);
    return agendaPending.find((p) => {
      if (p.court_id !== courtId || p.date !== date) return false;
      const s = timeToMins(p.start_time.slice(0, 5));
      return tickMins >= s && tickMins < s + p.duration_minutes;
    });
  }

  // Confirmada → panel en modo "view" (editar/cancelar); pendiente (sin
  // reserva confirmada en ese tick) → panel en modo "pending" (aprobar/
  // rechazar) — nunca una pantalla de detalle nueva.
  function handleSelectOccupied(courtId: string, startTime: string) {
    const confirmed = findConfirmedAt(courtId, selectedDate, startTime);
    if (confirmed) {
      setTicketPanelState({ mode: "view", reservation: confirmed });
      return;
    }
    const pending = findPendingAt(courtId, selectedDate, startTime);
    if (pending) setTicketPanelState({ mode: "pending", pending });
  }

  const today = todayStr();
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => toDateStr(addDays(anchorStart, i))), [anchorStart]);
  const weekDays: DayRangeDay[] = useMemo(
    () =>
      weekDates.map((date, i) => {
        const d = addDays(anchorStart, i);
        const mondayIndexedDay = (d.getDay() + 6) % 7;
        return { date, dayName: WEEKDAY[mondayIndexedDay], dayNum: d.getDate(), monthName: MONTH[d.getMonth()], isPast: date < today };
      }),
    [weekDates, anchorStart, today]
  );
  const rangeLabel = formatRangeLabel(anchorStart, addDays(anchorStart, 6));

  const minDuration = Math.min(...allowedDurations);
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

  const { availability, closedDates, openingMinsByDate, closingMinsByDate, blockedByDate } = useMemo(
    () => computeAvailability(courts, weekDates, opHours, rangeReservations, today, nowMins, minDuration),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courts, weekDates, opHours, rangeReservations, today, minDuration]
  );

  const isClosed = closedDates.includes(selectedDate);
  const closingMins = closingMinsByDate[selectedDate];
  const dayGrid = buildDayGrid(openingMinsByDate[selectedDate], closingMinsByDate[selectedDate], minDuration);
  const myPendingOnly = myReservations.filter((r) => r.status === "pending");

  const visibleRequests = filterVisibleRequests(myReservations, dismissedIds);
  const visibleBookings = sortBookingsByProximity(myBookings);

  // ─── Semana — derivados, traducción 1:1 de page.tsx/WeekCalendar.tsx ──────────
  const semanaWeekDays: WeekDay[] = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(semanaAnchor, i);
        return { date: toDateStr(d), dayName: WEEKDAY[i], dayNum: d.getDate(), monthName: MONTH[d.getMonth()] };
      }),
    [semanaAnchor]
  );
  const semanaWeekLabel = formatRangeLabel(semanaAnchor, addDays(semanaAnchor, 6));
  const semanaCourtFilterOptions = [{ value: "all", label: "Todas las canchas" }, ...semanaCourts.map((c) => ({ value: c.id, label: c.name }))];
  const semanaCourtFilterLabel = semanaCourtFilterOptions.find((o) => o.value === semanaCourtFilter)?.label ?? "Todas las canchas";

  const semanaReservationsFiltered =
    semanaCourtFilter === "all" ? semanaReservations : semanaReservations.filter((r) => r.court_id === semanaCourtFilter);
  const semanaHasReservationsByDate = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const r of semanaReservationsFiltered) map[r.date] = true;
    return map;
  }, [semanaReservationsFiltered]);

  const semanaSelectedDay = semanaWeekDays.find((d) => d.date === semanaSelectedDate) ?? semanaWeekDays[0];
  const semanaSelectedDayOfWeek = semanaSelectedDay ? new Date(`${semanaSelectedDay.date}T00:00:00`).getDay() : 0;
  const semanaSelectedDayClosed = semanaClosedDays.includes(semanaSelectedDayOfWeek);
  const semanaSelectedDayPast = semanaSelectedDate < today;
  const semanaDayReservations = semanaReservationsFiltered
    .filter((r) => r.date === semanaSelectedDate)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const semanaCourtColorIndex = (courtId: string) => semanaCourts.findIndex((c) => c.id === courtId);

  function capitalize(s: string): string {
    return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
  }

  const loading = clubLoading || loadingStatic;

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.content}>
          <Skeleton style={{ height: 20, width: "50%" }} />
          <Skeleton style={{ height: 90, borderRadius: 12 }} />
          <Skeleton style={{ height: 180, borderRadius: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      >
        <Text style={styles.h1}>Reservaciones</Text>

        {/* El switcher Agenda/Semana es exclusivo de OWNER/ADMIN en WEB
            (ReservationsViewSwitcher solo existe en /admin/reservations) —
            PLAYER en /reservations nunca tiene una pestaña "Semana", así
            que aquí tampoco: sin el switcher, `view` nunca deja de ser
            "agenda" para ese rol (default de useState, nunca cambiado). */}
        {isOwnerOrAdmin && (
          <View style={styles.viewSwitcher}>
            <TouchableOpacity
              onPress={() => setView("agenda")}
              style={[styles.viewSwitcherPill, view === "agenda" && styles.viewSwitcherPillActive]}
            >
              <Text style={[styles.viewSwitcherText, view === "agenda" && styles.viewSwitcherTextActive]}>Agenda</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setView("semana")}
              style={[styles.viewSwitcherPill, view === "semana" && styles.viewSwitcherPillActive]}
            >
              <Text style={[styles.viewSwitcherText, view === "semana" && styles.viewSwitcherTextActive]}>Semana</Text>
            </TouchableOpacity>
          </View>
        )}

        {isOwnerOrAdmin && (
          <PendingRequestsSection
            requests={agendaPending}
            clubId={club?.id ?? ""}
            onChanged={refreshAgendaAdminData}
            onReview={(pending) => setTicketPanelState({ mode: "pending", pending })}
          />
        )}

        {view === "semana" && isOwnerOrAdmin ? (
          loadingSemana ? (
            <View style={{ gap: 12 }}>
              <Skeleton style={{ height: 44, borderRadius: 12 }} />
              <Skeleton style={{ height: 44, borderRadius: 12 }} />
              <Skeleton style={{ height: 100, borderRadius: 12 }} />
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              {/* Navegación de semana — implementación propia de
                  WeekCalendar.tsx (app web), NO el mismo componente que
                  DayRangeNav de Agenda. */}
              <View style={styles.weekNavRow}>
                <TouchableOpacity onPress={() => setSemanaAnchor((p) => addDays(p, -7))} style={styles.weekNavArrow}>
                  <ChevronLeft width={16} height={16} color={theme.colors.white} />
                </TouchableOpacity>
                <Text style={styles.weekNavLabel}>{semanaWeekLabel}</Text>
                <TouchableOpacity onPress={() => setSemanaAnchor((p) => addDays(p, 7))} style={styles.weekNavArrow}>
                  <ChevronRight width={16} height={16} color={theme.colors.white} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setSemanaAnchor(getWeekMonday(new Date()));
                    setSemanaSelectedDate(today);
                  }}
                  style={styles.weekNavToday}
                >
                  <Text style={styles.weekNavTodayText}>Hoy</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.newReservationButton}
                onPress={() =>
                  setReservationModal({
                    mode: "create",
                    initialDate: semanaSelectedDate,
                    initialCourtId: semanaCourtFilter !== "all" ? semanaCourtFilter : null,
                    weekDaysForModal: semanaWeekDays,
                  })
                }
                activeOpacity={0.85}
              >
                <Plus width={18} height={18} color={theme.colors.bg} />
                <Text style={styles.newReservationButtonText}>Nueva reserva</Text>
              </TouchableOpacity>

              <View style={styles.courtFilterRow}>
                <Text style={styles.courtFilterLabel}>Filtrar por cancha</Text>
                <TouchableOpacity style={styles.courtFilterPill} onPress={() => setCourtFilterMenuOpen(true)}>
                  <Text style={styles.courtFilterPillText}>{semanaCourtFilterLabel}</Text>
                  <ChevronDown width={14} height={14} color={theme.colors.white} />
                </TouchableOpacity>
              </View>

              {semanaCourts.length > 0 && (
                <View style={styles.legendRow}>
                  {semanaCourts.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.legendItem}
                      onPress={() => setSemanaCourtFilter(semanaCourtFilter === c.id ? "all" : c.id)}
                    >
                      <View style={[styles.legendDot, { backgroundColor: courtColor(c.colorIndex).accent }]} />
                      <Text style={styles.legendText}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <WeekDayTabs
                days={semanaWeekDays}
                selectedDate={semanaSelectedDate}
                hasReservationsByDate={semanaHasReservationsByDate}
                onSelectDate={setSemanaSelectedDate}
              />

              <View style={styles.dayHeaderRow}>
                <Text style={styles.dayHeaderText}>
                  {semanaSelectedDay ? `${capitalize(semanaSelectedDay.dayName)} ${semanaSelectedDay.dayNum} ${capitalize(semanaSelectedDay.monthName)}` : ""}
                </Text>
                {semanaSelectedDayClosed ? (
                  <Text style={styles.dayHeaderMuted}>Club cerrado</Text>
                ) : semanaSelectedDayPast ? (
                  <Text style={styles.dayHeaderMuted}>Pasado</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.newReservationDayButton}
                    onPress={() =>
                      setReservationModal({
                        mode: "create",
                        initialDate: semanaSelectedDate,
                        initialCourtId: semanaCourtFilter !== "all" ? semanaCourtFilter : null,
                        weekDaysForModal: semanaWeekDays,
                      })
                    }
                  >
                    <Plus width={14} height={14} color={theme.colors.white} />
                    <Text style={styles.newReservationDayButtonText}>Reserva</Text>
                  </TouchableOpacity>
                )}
              </View>

              {semanaDayReservations.length === 0 ? (
                <Text style={styles.emptyClub}>
                  {semanaSelectedDayClosed ? "Club cerrado este día" : semanaSelectedDayPast ? "Sin reservas registradas" : "Sin reservas este día"}
                </Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {semanaDayReservations.map((r) => (
                    <WeekReservationCard
                      key={r.id}
                      reservation={r}
                      colorIndex={semanaCourtColorIndex(r.court_id)}
                      onEdit={() => setReservationModal({ mode: "edit", reservation: r })}
                      onCancelled={loadSemanaData}
                    />
                  ))}
                </View>
              )}
            </View>
          )
        ) : courts.length === 0 ? (
          <Text style={styles.emptyClub}>El club aún no tiene canchas configuradas.</Text>
        ) : (
          <>
            {successBanner && (
              <View style={styles.successBanner}>
                <Check width={16} height={16} color={theme.colors.primary} />
                <Text style={styles.successBannerText}>{successBanner}</Text>
              </View>
            )}

            <DayRangeNav
              days={weekDays}
              label={rangeLabel}
              selectedDate={selectedDate}
              todayStr={today}
              closedDates={closedDates}
              courts={courts}
              availability={availability}
              openingMinsByDate={openingMinsByDate}
              closingMinsByDate={closingMinsByDate}
              onSelectDate={setSelectedDate}
              onPrev={() => setAnchorStart((prev) => addDays(prev, -7))}
              onNext={() => setAnchorStart((prev) => addDays(prev, 7))}
              onToday={() => {
                setAnchorStart(getWeekMonday(new Date()));
                setSelectedDate(today);
              }}
            />

            {/* Selector de duración pre-filtro — exclusivo de PLAYER en
                WEB (PlayerAvailabilityCalendar). AdminAvailabilityView no
                tiene un equivalente: el admin ve TODOS los slots de
                granularidad mínima sin pre-filtrar, y la duración real se
                elige recién dentro del modal "Nueva reserva" — mismo
                criterio abajo en availableSlots. */}
            {!isOwnerOrAdmin && allowedDurations.length > 1 && !isClosed && (
              <View style={styles.durationRow}>
                <Text style={styles.durationLabel}>DURACIÓN</Text>
                <View style={styles.durationPills}>
                  {durationOptions(allowedDurations).map((d) => (
                    <TouchableOpacity
                      key={d.minutes}
                      onPress={() => setSelectedDuration(d.minutes)}
                      style={[styles.durationPillBox, selectedDuration === d.minutes && styles.durationPillBoxActive]}
                    >
                      <Text style={[styles.durationPill, selectedDuration === d.minutes && styles.durationPillActive]}>{d.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {loadingRange ? (
              <Skeleton style={{ height: 180, borderRadius: 16 }} />
            ) : isClosed ? (
              <View style={styles.closedState}>
                <View style={styles.closedIconCircle}>
                  <CalendarOff width={20} height={20} color={theme.colors.muted} />
                </View>
                <Text style={styles.closedText}>Club cerrado este día</Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <AvailabilityLegend />
                {courts.map((court) => {
                  const baseAvailability = availability[selectedDate]?.[court.id] ?? [];
                  const blocked = blockedByDate[selectedDate]?.[court.id] ?? [];
                  const slotsForDuration = filterSlotsByDuration(baseAvailability, selectedDuration, closingMins, blocked);
                  const { tones, idByTick } = computeOwnTones(court.id, selectedDate, dayGrid, myBookings, myPendingOnly);
                  // OWNER/ADMIN: tono + label de reservas ajenas (partido/
                  // clase/bloqueo/pendiente) por tick — nunca derivado de
                  // myBookings/myPendingOnly (siempre vacíos para este rol),
                  // ver computeOccupiedTones arriba. PLAYER no lo usa.
                  const { tones: occupiedTones, labels: occupiedLabels } = isOwnerOrAdmin
                    ? computeOccupiedTones(court.id, selectedDate, dayGrid, agendaConfirmedReservations, agendaPending, semanaMembers)
                    : { tones: {}, labels: {} };

                  return (
                    <CourtAvailabilityCard
                      key={court.id}
                      court={court}
                      grid={dayGrid}
                      // OWNER/ADMIN: slots sin pre-filtrar por duración,
                      // igual que AdminAvailabilityView (slots={daySlots
                      // [court.id]} sin filterSlotsByDuration) — la
                      // duración se elige dentro de "Nueva reserva".
                      // PLAYER conserva el filtro previo, sin cambios.
                      availableSlots={isOwnerOrAdmin ? baseAvailability : slotsForDuration}
                      ownToneByStart={tones}
                      occupiedToneByStart={isOwnerOrAdmin ? occupiedTones : undefined}
                      occupiedLabelByStart={isOwnerOrAdmin ? occupiedLabels : undefined}
                      selectedRange={null}
                      onSelectSlot={(startTime) => {
                        // OWNER/ADMIN nunca "solicita" — misma regla que
                        // WEB (AdminAvailabilityView.handleSelectAvailable
                        // abre ReservationTicketPanel en modo "create",
                        // nunca el flujo de solicitud del jugador). Tocar
                        // un slot libre en Agenda abre el mismo modal
                        // "Nueva reserva" (create_reservation_admin) que
                        // ya usa la pestaña Semana, con el slot exacto
                        // precargado — nunca RequestModal/
                        // create_reservation_player, exclusivo de PLAYER.
                        if (isOwnerOrAdmin) {
                          setReservationModal({
                            mode: "create",
                            initialDate: selectedDate,
                            initialCourtId: court.id,
                            initialStartTime: startTime,
                            weekDaysForModal: weekDays,
                          });
                        } else {
                          setModalSlot({ courtId: court.id, courtName: court.name, date: selectedDate, startTime, duration: selectedDuration });
                        }
                      }}
                      onSelectOwn={(startTime) => {
                        const id = idByTick[startTime];
                        if (id) navigation.navigate("ReservationDetail", { id });
                      }}
                      onSelectOccupied={isOwnerOrAdmin ? (startTime) => handleSelectOccupied(court.id, startTime) : undefined}
                    />
                  );
                })}
              </View>
            )}

            {isOwnerOrAdmin && <RejectedReservationsSection reservations={agendaRejected} />}
          </>
        )}

        {/* "Mis solicitudes"/"Mis reservas" son exclusivas de PLAYER en
            WEB (SidePanels de PlayerAvailabilityCalendar, /reservations) —
            /admin/reservations no tiene ningún bloque equivalente para
            OWNER/ADMIN (su propia participación como jugador es siempre
            vacía por regla de negocio, ver CLAUDE.md). Gate por rol, no
            por `view` — nunca deben aparecer para OWNER/ADMIN aunque en
            teoría estén en la pestaña Agenda. */}
        {!isOwnerOrAdmin && (
          <>
            <View style={[styles.section, styles.sectionTopDivider]}>
              <PanelSectionHeader
                title="Mis solicitudes"
                count={visibleRequests.length}
                expanded={solicitudes.expanded}
                onToggle={solicitudes.toggle}
              />
              {solicitudes.expanded &&
                (visibleRequests.length === 0 ? (
                  <EmptyRow message="Aún no tienes solicitudes de reserva." />
                ) : (
                  <View style={styles.cardsList}>
                    {visibleRequests.map((r) => (
                      <ActivityCard
                        key={r.id}
                        reservation={r}
                        clubSlug={club!.slug}
                        clubName={club?.name}
                        viewerId={viewerId}
                        onPress={() => navigation.navigate("ReservationDetail", { id: r.id })}
                        onDismiss={dismiss}
                        onCancelled={loadMyReservations}
                      />
                    ))}
                  </View>
                ))}
            </View>

            <View style={[styles.section, styles.sectionDivider]}>
              <PanelSectionHeader
                title="Mis reservas"
                count={visibleBookings.length}
                expanded={reservas.expanded}
                onToggle={reservas.toggle}
              />
              {reservas.expanded &&
                (visibleBookings.length === 0 ? (
                  <EmptyRow message="No tienes reservas próximas." />
                ) : (
                  <View style={styles.cardsList}>
                    {visibleBookings.map((r) => (
                      <ActivityCard
                        key={r.id}
                        reservation={r}
                        clubSlug={club!.slug}
                        clubName={club?.name}
                        viewerId={viewerId}
                        onPress={() => navigation.navigate("ReservationDetail", { id: r.id })}
                        onDismiss={dismiss}
                        onCancelled={loadMyReservations}
                      />
                    ))}
                  </View>
                ))}
            </View>
          </>
        )}
      </ScrollView>

      <RequestModal
        visible={!!modalSlot}
        slot={modalSlot}
        clubId={club?.id ?? ""}
        allowedDurations={allowedDurations}
        onClose={() => setModalSlot(null)}
        onSuccess={() => {
          setModalSlot(null);
          setSuccessBanner("Tu solicitud fue enviada. El administrador la confirmará pronto.");
          loadRangeReservations();
          loadMyReservations();
        }}
      />

      <WeekReservationModal
        visible={!!reservationModal}
        mode={reservationModal?.mode ?? "create"}
        reservation={reservationModal?.mode === "edit" ? reservationModal.reservation : null}
        initialDate={reservationModal?.mode === "create" ? reservationModal.initialDate : undefined}
        initialCourtId={reservationModal?.mode === "create" ? reservationModal.initialCourtId : undefined}
        initialStartTime={reservationModal?.mode === "create" ? reservationModal.initialStartTime : undefined}
        weekDays={reservationModal?.mode === "create" ? reservationModal.weekDaysForModal : semanaWeekDays}
        courts={semanaCourts}
        members={semanaMembers}
        allowedDurations={allowedDurations}
        clubId={club?.id ?? ""}
        onClose={() => setReservationModal(null)}
        onSuccess={() => {
          setReservationModal(null);
          loadSemanaData();
          // Se puede disparar desde Agenda ahora (OWNER/ADMIN) — refresca
          // también los datos de Agenda para que su propio grid de
          // disponibilidad refleje la reserva recién creada/editada.
          loadRangeReservations();
          if (isOwnerOrAdmin) loadAgendaConfirmedReservations();
        }}
      />

      <ReservationTicketPanel
        state={ticketPanelState}
        clubId={club?.id ?? ""}
        onClose={() => setTicketPanelState(null)}
        onChanged={refreshAgendaAdminData}
        onEdit={(reservation) => {
          setTicketPanelState(null);
          setReservationModal({ mode: "edit", reservation });
        }}
      />

      <Modal visible={courtFilterMenuOpen} transparent animationType="fade" onRequestClose={() => setCourtFilterMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setCourtFilterMenuOpen(false)}>
          <View style={styles.menuCard}>
            {semanaCourtFilterOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.menuItem}
                onPress={() => {
                  setSemanaCourtFilter(opt.value);
                  setCourtFilterMenuOpen(false);
                }}
              >
                <Text style={styles.menuItemText}>{opt.label}</Text>
                {opt.value === semanaCourtFilter && <Check width={14} height={14} color={theme.colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <View style={styles.emptyRow}>
      <Clock width={16} height={16} color="rgba(148,163,184,0.6)" />
      <Text style={styles.empty}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  h1: { color: theme.colors.white, fontSize: 26, fontWeight: "800" },
  viewSwitcher: {
    flexDirection: "row",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    padding: 4,
  },
  viewSwitcherPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  viewSwitcherPillActive: { backgroundColor: theme.colors.primary },
  viewSwitcherText: { fontSize: 14, fontWeight: "600", color: theme.colors.muted },
  viewSwitcherTextActive: { color: theme.colors.bg },
  emptyClub: { color: theme.colors.muted, fontSize: 13 },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: `${theme.colors.primary}1A`,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}4D`,
  },
  successBannerText: { color: theme.colors.primary, fontSize: 13, flex: 1 },
  durationRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  durationLabel: { fontSize: 11, fontWeight: "500", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  durationPills: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  durationPillBox: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  durationPillBoxActive: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` },
  durationPill: { fontSize: 12, fontWeight: "500", color: theme.colors.muted },
  durationPillActive: { color: theme.colors.primary },
  closedState: { alignItems: "center", gap: 12, paddingVertical: 48 },
  closedIconCircle: { width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  closedText: { color: theme.colors.muted, fontSize: 14 },
  section: { gap: 12 },
  sectionTopDivider: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.border },
  sectionDivider: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.border },
  cardsList: { gap: 8 },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  empty: { color: "rgba(148,163,184,0.6)", fontSize: 12 },
  // ─── Semana ──────────────────────────────────────────────────────────────
  weekNavRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  weekNavArrow: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  weekNavLabel: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "700", color: theme.colors.white },
  weekNavToday: { paddingHorizontal: 12, height: 32, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  weekNavTodayText: { fontSize: 13, fontWeight: "600", color: theme.colors.white },
  newReservationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
  },
  newReservationButtonText: { fontSize: 15, fontWeight: "700", color: theme.colors.bg },
  courtFilterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  courtFilterLabel: { fontSize: 13, color: theme.colors.muted },
  courtFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  courtFilterPillText: { fontSize: 13, fontWeight: "600", color: theme.colors.white },
  legendRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 13, color: theme.colors.muted, textDecorationLine: "underline" },
  dayHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayHeaderText: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  dayHeaderMuted: { fontSize: 13, color: theme.colors.muted },
  newReservationDayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderStyle: "dashed",
  },
  newReservationDayButtonText: { fontSize: 13, fontWeight: "600", color: theme.colors.white },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 32 },
  menuCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#0e3347",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  menuItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  menuItemText: { fontSize: 14, color: theme.colors.white },
});
