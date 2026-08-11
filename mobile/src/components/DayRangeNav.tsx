import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { theme } from "../lib/theme";
import { timeToMins } from "../lib/time";

// Traducción 1:1 de DayRangeNav.tsx (app web), variant="scroll" (7 días —
// la única variante relevante en mobile: las variantes grid de 10/14 días
// solo aparecen desde el breakpoint xl, que nunca aplica en un teléfono).
// La web navega por query param (?week=...); acá es estado local del
// screen (onPrev/onNext/onToday), sin equivalente de URL.
export type DayRangeDay = { date: string; dayName: string; dayNum: number; monthName: string; isPast: boolean };

const DAY_INDICATOR_SEGMENTS = 5;
type DaySegmentState = "available" | "occupied" | "closed";

function buildDayIndicator(
  date: string,
  courts: Array<{ id: string }>,
  availability: Record<string, Record<string, string[]>>,
  closedDates: string[],
  openingMinsByDate: Record<string, number>,
  closingMinsByDate: Record<string, number>
): DaySegmentState[] {
  const openMins = openingMinsByDate[date];
  const closeMins = closingMinsByDate[date];
  if (closedDates.includes(date) || openMins === undefined || closeMins === undefined || closeMins <= openMins) {
    return Array<DaySegmentState>(DAY_INDICATOR_SEGMENTS).fill("closed");
  }

  const dayAvailability = availability[date] ?? {};
  const bucketSize = (closeMins - openMins) / DAY_INDICATOR_SEGMENTS;

  return Array.from({ length: DAY_INDICATOR_SEGMENTS }, (_, i) => {
    const bucketStart = openMins + i * bucketSize;
    const bucketEnd = bucketStart + bucketSize;
    const hasFreeSlot = courts.some((court) =>
      (dayAvailability[court.id] ?? []).some((slot) => {
        const m = timeToMins(slot);
        return m >= bucketStart && m < bucketEnd;
      })
    );
    return hasFreeSlot ? "available" : "occupied";
  });
}

export function DayRangeNav({
  days,
  label,
  selectedDate,
  todayStr,
  closedDates,
  courts,
  availability,
  openingMinsByDate,
  closingMinsByDate,
  onSelectDate,
  onPrev,
  onNext,
  onToday,
}: {
  days: DayRangeDay[];
  label: string;
  selectedDate: string;
  todayStr: string;
  closedDates: string[];
  courts: Array<{ id: string }>;
  availability: Record<string, Record<string, string[]>>;
  openingMinsByDate: Record<string, number>;
  closingMinsByDate: Record<string, number>;
  onSelectDate: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.navRow}>
        <TouchableOpacity onPress={onPrev} style={styles.arrowButton} hitSlop={6}>
          <ChevronLeft width={16} height={16} color={theme.colors.muted} />
        </TouchableOpacity>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity onPress={onNext} style={styles.arrowButton} hitSlop={6}>
          <ChevronRight width={16} height={16} color={theme.colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onToday} style={styles.todayButton} hitSlop={6}>
          <Text style={styles.todayButtonText}>Hoy</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {days.map((day) => {
          const isSelected = day.date === selectedDate;
          const isClosedDay = closedDates.includes(day.date);
          const segments = buildDayIndicator(day.date, courts, availability, closedDates, openingMinsByDate, closingMinsByDate);
          return (
            <TouchableOpacity
              key={day.date}
              onPress={() => onSelectDate(day.date)}
              style={[
                styles.dayButton,
                isSelected
                  ? styles.dayButtonSelected
                  : day.isPast
                  ? styles.dayButtonPast
                  : isClosedDay
                  ? styles.dayButtonClosed
                  : styles.dayButtonDefault,
              ]}
            >
              <Text style={[styles.dayWeekday, isSelected && { color: theme.colors.primary }]}>{day.dayName}</Text>
              <View style={styles.dayNumRow}>
                <Text style={[styles.dayNum, isSelected && { color: theme.colors.primary }]}>{day.dayNum}</Text>
                {day.date === todayStr && (
                  <View style={[styles.todayDot, { backgroundColor: isSelected ? theme.colors.primary : "rgba(148,163,184,0.6)" }]} />
                )}
              </View>
              <View style={styles.segmentsRow}>
                {segments.map((seg, i) => (
                  <View
                    key={i}
                    style={[
                      styles.segmentBar,
                      seg === "available" && { backgroundColor: isSelected ? theme.colors.primary : `${theme.colors.primary}B3` },
                      seg === "occupied" && { backgroundColor: "rgba(255,255,255,0.2)" },
                      seg === "closed" && styles.segmentBarClosed,
                    ]}
                  />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  navRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  arrowButton: { padding: 8, borderRadius: 12 },
  label: { flex: 1, fontSize: 14, fontWeight: "500", color: theme.colors.white, textAlign: "center" },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  todayButtonText: { fontSize: 12, fontWeight: "600", color: theme.colors.muted },
  tabsRow: { gap: 6, paddingBottom: 4 },
  dayButton: { minWidth: 56, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12, borderWidth: 1, alignItems: "center", gap: 4 },
  dayButtonDefault: { borderColor: "rgba(255,255,255,0.1)" },
  dayButtonSelected: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` },
  dayButtonPast: { borderColor: "rgba(255,255,255,0.05)" },
  dayButtonClosed: { borderColor: "rgba(255,255,255,0.05)" },
  dayWeekday: { fontSize: 10, fontWeight: "500", color: theme.colors.muted, textTransform: "uppercase" },
  dayNumRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  dayNum: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  todayDot: { width: 4, height: 4, borderRadius: 2 },
  segmentsRow: { flexDirection: "row", gap: 2, marginTop: 2 },
  segmentBar: { width: 6, height: 8, borderRadius: 1 },
  segmentBarClosed: { borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed" },
});
