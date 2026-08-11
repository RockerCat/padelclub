import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CalendarClock,
  CalendarRange,
  Flame,
  TrendingDown,
  TrendingUp,
  Activity,
  Home as HomeIcon,
  Clock,
  type LucideIcon,
} from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useClub } from "../contexts/ClubContext";
import {
  DEFAULT_OPERATING_HOURS,
  DAY_NAMES,
  computeAvailableMinutesForRange,
  type OperatingHour,
} from "../lib/operatingHours";
import { CourtIllustration, getSurfaceLabel } from "../components/CourtIllustration";
import { WeekdayOccupancyChart, type WeekdayPoint } from "../components/WeekdayOccupancyChart";
import { Skeleton } from "../components/Skeleton";
import { theme } from "../lib/theme";

const NEUTRAL_METRIC_COLOR = theme.colors.primary;

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}
function formatHours(minutes: number): string {
  if (minutes === 0) return "0";
  const h = minutes / 60;
  return h % 1 === 0 ? String(h) : h.toFixed(1);
}
function calcEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type Court = { id: string; name: string; surface: string | null };
type CourtProjection = {
  id: string;
  name: string;
  surface: string | null;
  pct: number;
  nextSlot: { startTime: string; endTime: string; playerName: string } | null;
};

const TABS: Array<{ key: "operacion" | "rendimiento" | "actividad" | "canchas"; label: string; icon: LucideIcon }> = [
  { key: "operacion", label: "Operación", icon: CalendarClock },
  { key: "rendimiento", label: "Rendimiento", icon: TrendingUp },
  { key: "actividad", label: "Actividad", icon: Activity },
  { key: "canchas", label: "Canchas", icon: HomeIcon },
];

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

// Equivalente RN de la vista "Operación" en src/app/(app)/[club]/dashboard/page.tsx
// (app web) — mismas cinco secciones, mismas queries/cálculos exactos:
// Hoy, Próximos 7 días, Canchas más ocupadas, Días con menor ocupación,
// Proyección por cancha. Rendimiento/Actividad/Canchas (los otros 3 tabs
// del selector) navegan a un estado de placeholder — módulos aparte, no
// implementados todavía en la app nativa (mismo patrón que el resto del
// tabbar/otros módulos).
export function OwnerDashboardScreen() {
  const { club } = useClub();
  const [activeTab, setActiveTab] = useState<"operacion" | "rendimiento" | "actividad" | "canchas">("operacion");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [todayCount, setTodayCount] = useState(0);
  const [todayReservedMin, setTodayReservedMin] = useState(0);
  const [todayFreeMin, setTodayFreeMin] = useState(0);
  const [nextUpcoming, setNextUpcoming] = useState<{ startTime: string; courtName: string } | null>(null);

  const [next7Count, setNext7Count] = useState(0);
  const [courtsCount, setCourtsCount] = useState(0);
  const [next7ReservedMin, setNext7ReservedMin] = useState(0);
  const [next7FreeMin, setNext7FreeMin] = useState(0);
  const [next7OccupancyPct, setNext7OccupancyPct] = useState(0);

  const [busiestCourts, setBusiestCourts] = useState<Array<{ id: string; name: string; pct: number }>>([]);
  const [dayHeatmap, setDayHeatmap] = useState<WeekdayPoint[]>([]);
  const [courtProjection, setCourtProjection] = useState<CourtProjection[]>([]);

  const load = useCallback(async () => {
    if (!club) return;

    const now = new Date();
    const nowTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateStr(today);
    const next7End = addDays(today, 6);
    const next7EndStr = toDateStr(next7End);

    const [courtsRes, hoursRes] = await Promise.all([
      supabase.from("courts").select("id, name, surface").eq("club_id", club.id).eq("is_active", true).order("name"),
      supabase.from("club_operating_hours").select("day_of_week, is_open, opens_at, closes_at").eq("club_id", club.id),
    ]);

    const courts = (courtsRes.data ?? []) as Court[];
    const dbHours = (hoursRes.data ?? []) as OperatingHour[];
    const effectiveHours: OperatingHour[] = DEFAULT_OPERATING_HOURS.map((def) => dbHours.find((h) => h.day_of_week === def.day_of_week) ?? def);

    const [upcomingRes, futureWeekRes] = await Promise.all([
      supabase
        .from("reservations")
        .select("id, court_id, date, start_time, duration_minutes, reservation_players(profiles(full_name))")
        .eq("club_id", club.id)
        .eq("status", "confirmed")
        .or(`date.gt.${todayStr},and(date.eq.${todayStr},start_time.gte.${nowTimeStr})`)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(50),
      supabase
        .from("reservations")
        .select("court_id, date, start_time, duration_minutes")
        .eq("club_id", club.id)
        .eq("status", "confirmed")
        .gte("date", todayStr)
        .lte("date", next7EndStr),
    ]);

    type UpcomingRow = {
      id: string;
      court_id: string;
      date: string;
      start_time: string;
      duration_minutes: number;
      reservation_players: Array<{ profiles: { full_name: string | null } | null }>;
    };
    type FutureRow = { court_id: string; date: string; start_time: string; duration_minutes: number };

    const upcomingRows = (upcomingRes.data ?? []) as unknown as UpcomingRow[];
    const nextSlotByCourtId = new Map<string, { startTime: string; endTime: string; playerName: string }>();
    for (const r of upcomingRows) {
      if (nextSlotByCourtId.has(r.court_id)) continue;
      nextSlotByCourtId.set(r.court_id, {
        startTime: r.start_time.slice(0, 5),
        endTime: calcEndTime(r.start_time.slice(0, 5), r.duration_minutes),
        playerName: r.reservation_players.map((rp) => rp.profiles?.full_name).filter(Boolean)[0] ?? "—",
      });
    }

    const futureWeekRows = (futureWeekRes.data ?? []) as FutureRow[];
    const todayRows = futureWeekRows.filter((r) => r.date === todayStr);
    const todayReserved = todayRows.reduce((sum, r) => sum + r.duration_minutes, 0);
    const todayAvailablePerCourt = computeAvailableMinutesForRange(effectiveHours, today, today);
    const todayCapacity = todayAvailablePerCourt * courts.length;
    const todayFree = Math.max(0, todayCapacity - todayReserved);

    const next7Reserved = futureWeekRows.reduce((sum, r) => sum + r.duration_minutes, 0);
    const next7AvailablePerCourt = computeAvailableMinutesForRange(effectiveHours, today, next7End);
    const next7Capacity = next7AvailablePerCourt * courts.length;
    const next7Free = Math.max(0, next7Capacity - next7Reserved);
    const occupancyPct = next7Capacity > 0 ? Math.min(100, Math.round((next7Reserved / next7Capacity) * 100)) : 0;

    const nextUp = upcomingRows[0] ?? null;
    const nextUpCourtName = nextUp ? courts.find((c) => c.id === nextUp.court_id)?.name ?? "—" : null;

    const next7ReservedByCourt = new Map<string, number>();
    for (const r of futureWeekRows) next7ReservedByCourt.set(r.court_id, (next7ReservedByCourt.get(r.court_id) ?? 0) + r.duration_minutes);

    const busiest = courts
      .map((c) => {
        const reserved = next7ReservedByCourt.get(c.id) ?? 0;
        const pct = next7AvailablePerCourt > 0 ? Math.min(100, Math.round((reserved / next7AvailablePerCourt) * 100)) : 0;
        return { id: c.id, name: c.name, pct };
      })
      .sort((a, b) => b.pct - a.pct);

    const projection: CourtProjection[] = courts.map((c) => {
      const reserved = next7ReservedByCourt.get(c.id) ?? 0;
      const pct = next7AvailablePerCourt > 0 ? Math.min(100, Math.round((reserved / next7AvailablePerCourt) * 100)) : 0;
      return { id: c.id, name: c.name, surface: c.surface, pct, nextSlot: nextSlotByCourtId.get(c.id) ?? null };
    });

    const next7ReservedByDate = new Map<string, number>();
    for (const r of futureWeekRows) next7ReservedByDate.set(r.date, (next7ReservedByDate.get(r.date) ?? 0) + r.duration_minutes);
    const heatmap: WeekdayPoint[] = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i);
      const dateStr = toDateStr(d);
      const hours = effectiveHours.find((h) => h.day_of_week === d.getDay())!;
      if (!hours.is_open) return { id: dateStr, label: DAY_NAMES[d.getDay()].slice(0, 3), pct: 0, closed: true };
      const availableMin = computeAvailableMinutesForRange(effectiveHours, d, d) * courts.length;
      const reservedMin = next7ReservedByDate.get(dateStr) ?? 0;
      const pct = availableMin > 0 ? Math.min(100, Math.round((reservedMin / availableMin) * 100)) : 0;
      return { id: dateStr, label: DAY_NAMES[d.getDay()].slice(0, 3), pct, closed: false };
    });

    setCourtsCount(courts.length);
    setTodayCount(todayRows.length);
    setTodayReservedMin(todayReserved);
    setTodayFreeMin(todayFree);
    setNextUpcoming(nextUp ? { startTime: nextUp.start_time.slice(0, 5), courtName: nextUpCourtName ?? "—" } : null);
    setNext7Count(futureWeekRows.length);
    setNext7ReservedMin(next7Reserved);
    setNext7FreeMin(next7Free);
    setNext7OccupancyPct(occupancyPct);
    setBusiestCourts(busiest);
    setDayHeatmap(heatmap);
    setCourtProjection(projection);
  }, [club]);

  useEffect(() => {
    if (!club) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [club, load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      >
        <View style={styles.tabsGrid}>
          {TABS.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <TouchableOpacity key={key} onPress={() => setActiveTab(key)} style={[styles.tabButton, isActive && styles.tabButtonActive]}>
                <Icon width={16} height={16} color={isActive ? theme.colors.primary : theme.colors.muted} />
                <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab !== "operacion" ? (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderText}>
              {activeTab === "rendimiento" ? "Rendimiento" : activeTab === "actividad" ? "Actividad reciente" : "Canchas"} disponible
              próximamente en la app nativa.
            </Text>
          </View>
        ) : loading ? (
          <View style={{ gap: 12 }}>
            <Skeleton style={{ height: 140, borderRadius: 16 }} />
            <Skeleton style={{ height: 160, borderRadius: 16 }} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {/* Hoy */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <CalendarClock width={16} height={16} color={theme.colors.primary} />
                <Text style={styles.cardTitle}>Hoy</Text>
              </View>
              <View style={styles.miniStatRow}>
                <MiniStat value={String(todayCount)} label="reservas" />
                <MiniStat value={formatHours(todayReservedMin)} label="h reservadas" />
                <MiniStat value={formatHours(todayFreeMin)} label="h libres" />
              </View>
              <View style={styles.nextReservationRow}>
                <Text style={styles.nextReservationLabel}>Próxima reserva</Text>
                {nextUpcoming ? (
                  <Text style={styles.nextReservationValue}>
                    {nextUpcoming.startTime} · {nextUpcoming.courtName}
                  </Text>
                ) : (
                  <Text style={styles.nextReservationEmpty}>Sin reservas</Text>
                )}
              </View>
            </View>

            {/* Próximos 7 días */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <CalendarRange width={16} height={16} color={theme.colors.secondary} />
                <Text style={styles.cardTitle}>Próximos 7 días</Text>
              </View>
              <View style={styles.miniStatGrid}>
                <MiniStat value={String(next7Count)} label="reservas" />
                <MiniStat value={String(courtsCount)} label="canchas" />
                <MiniStat value={formatHours(next7ReservedMin)} label="h reservadas" />
                <MiniStat value={formatHours(next7FreeMin)} label="h libres" />
              </View>
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${next7OccupancyPct}%` }]} />
                </View>
                <Text style={styles.progressPct}>{next7OccupancyPct}%</Text>
              </View>
              <Text style={styles.progressCaption}>Ocupación proyectada de la capacidad total</Text>
            </View>

            {/* Canchas más ocupadas */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Flame width={16} height={16} color={theme.colors.secondary} />
                <Text style={styles.cardTitle}>Canchas más ocupadas</Text>
                <Text style={styles.cardHeaderCaption}>próx. 7 días</Text>
              </View>
              {busiestCourts.length === 0 ? (
                <Text style={styles.emptyText}>Sin canchas activas</Text>
              ) : (
                <View style={{ gap: 12 }}>
                  {busiestCourts.map((c) => (
                    <View key={c.id}>
                      <View style={styles.busiestRow}>
                        <Text style={styles.busiestName} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text style={styles.busiestPct}>{c.pct}%</Text>
                      </View>
                      <View style={styles.busiestTrack}>
                        <View style={[styles.busiestFill, { width: `${c.pct}%` }]} />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Días con menor ocupación */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <TrendingDown width={16} height={16} color={theme.colors.primary} />
                <Text style={styles.cardTitle}>Días con menor ocupación</Text>
                <Text style={styles.cardHeaderCaption}>próx. 7 días</Text>
              </View>
              <WeekdayOccupancyChart points={dayHeatmap} />
              <Text style={styles.weekdayCaption}>Útil para promociones, clínicas o torneos en los días más flojos.</Text>
            </View>

            {/* Proyección por cancha */}
            <View style={{ gap: 12 }}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderLabel}>PROYECCIÓN POR CANCHA</Text>
                <Text style={styles.cardHeaderCaption}>próx. 7 días</Text>
              </View>
              {courtProjection.length === 0 ? (
                <Text style={styles.emptyText}>Sin canchas activas</Text>
              ) : (
                courtProjection.map((c) => (
                  <View key={c.id} style={styles.projectionCard}>
                    <Text style={styles.projectionName}>{c.name}</Text>
                    <Text style={styles.projectionSurface}>{getSurfaceLabel(c.surface)}</Text>
                    <Text style={styles.projectionPct}>{c.pct}%</Text>
                    <Text style={styles.projectionCaption}>ocupación próx. 7 días</Text>
                    <View style={styles.projectionTrack}>
                      <View style={[styles.projectionFill, { width: `${c.pct}%` }]} />
                    </View>
                    <View style={styles.projectionIllustration}>
                      <CourtIllustration surface={c.surface} width={180} height={130} />
                    </View>
                    <View style={styles.projectionNextSlot}>
                      <Text style={styles.nextReservationLabel}>Próximo turno:</Text>
                      {c.nextSlot ? (
                        <View style={styles.projectionSlotRow}>
                          <Clock width={14} height={14} color={theme.colors.primary} style={{ marginTop: 2 }} />
                          <View>
                            <Text style={styles.projectionSlotTime}>
                              {c.nextSlot.startTime} - {c.nextSlot.endTime}
                            </Text>
                            <Text style={styles.projectionSlotName}>{c.nextSlot.playerName}</Text>
                          </View>
                        </View>
                      ) : (
                        <Text style={styles.emptyText}>Sin próximas reservas</Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  tabsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, padding: 4, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  tabButton: { flexBasis: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
  tabButtonActive: { backgroundColor: `${theme.colors.primary}2E` },
  tabButtonText: { fontSize: 13, color: theme.colors.muted },
  tabButtonTextActive: { color: theme.colors.primary, fontWeight: "700" },
  placeholderCard: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: theme.colors.surface, padding: 24, alignItems: "center" },
  placeholderText: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
  card: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: theme.colors.surface, padding: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
  cardHeaderCaption: { fontSize: 11, color: theme.colors.muted, marginLeft: "auto" },
  miniStatRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  miniStatGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  miniStatValue: { fontSize: 20, fontWeight: "700", color: theme.colors.white },
  miniStatLabel: { fontSize: 11, color: theme.colors.muted },
  nextReservationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  nextReservationLabel: { fontSize: 11, color: theme.colors.muted },
  nextReservationValue: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
  nextReservationEmpty: { fontSize: 13, color: "rgba(148,163,184,0.7)" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  progressTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 5, backgroundColor: theme.colors.primary },
  progressPct: { fontSize: 22, fontWeight: "700", color: theme.colors.primary },
  progressCaption: { fontSize: 11, color: "rgba(148,163,184,0.7)", marginTop: 6 },
  emptyText: { fontSize: 13, color: theme.colors.muted },
  busiestRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 },
  busiestName: { fontSize: 14, color: "rgba(255,255,255,0.9)", fontWeight: "500", flexShrink: 1 },
  busiestPct: { fontSize: 14, fontWeight: "700", color: theme.colors.primary },
  busiestTrack: { height: 14, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  busiestFill: { height: "100%", borderRadius: 7, backgroundColor: theme.colors.primary },
  weekdayCaption: { fontSize: 11, color: "rgba(148,163,184,0.6)", marginTop: 12 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center" },
  sectionHeaderLabel: { fontSize: 11, fontWeight: "600", color: theme.colors.muted, letterSpacing: 0.5 },
  projectionCard: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: theme.colors.surface, padding: 16, gap: 4 },
  projectionName: { fontSize: 16, fontWeight: "700", color: theme.colors.white, textTransform: "uppercase", letterSpacing: 0.3 },
  projectionSurface: { fontSize: 12, color: "rgba(148,163,184,0.6)" },
  projectionPct: { fontSize: 30, fontWeight: "700", color: theme.colors.primary, marginTop: 8 },
  projectionCaption: { fontSize: 11, color: theme.colors.muted, marginBottom: 4 },
  projectionTrack: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  projectionFill: { height: "100%", borderRadius: 4, backgroundColor: theme.colors.primary },
  projectionIllustration: { alignItems: "center", marginVertical: 12 },
  projectionNextSlot: { paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  projectionSlotRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  projectionSlotTime: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
  projectionSlotName: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
});
