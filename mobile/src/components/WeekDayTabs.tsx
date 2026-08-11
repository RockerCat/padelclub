import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";
import type { WeekDay } from "../lib/weekCalendar";

// Traducción 1:1 de los day-tabs mobile de WeekCalendar.tsx (app web,
// específico de Semana — no el mismo componente que DayRangeNav de
// Agenda): botones de ancho fijo, un solo punto debajo (no 5 barras de
// disponibilidad) que indica "este día tiene alguna reserva confirmada",
// no disponibilidad.
export function WeekDayTabs({
  days,
  selectedDate,
  hasReservationsByDate,
  onSelectDate,
}: {
  days: WeekDay[];
  selectedDate: string;
  hasReservationsByDate: Record<string, boolean>;
  onSelectDate: (date: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {days.map((day) => {
        const isSelected = day.date === selectedDate;
        const hasReservations = !!hasReservationsByDate[day.date];
        return (
          <TouchableOpacity
            key={day.date}
            onPress={() => onSelectDate(day.date)}
            style={[styles.day, isSelected ? styles.daySelected : styles.dayDefault]}
          >
            <Text style={[styles.dayName, isSelected && { color: theme.colors.primary }]}>{day.dayName}</Text>
            <Text style={[styles.dayNum, isSelected && { color: theme.colors.primary }]}>{day.dayNum}</Text>
            <View
              style={[
                styles.dot,
                { backgroundColor: hasReservations ? (isSelected ? theme.colors.primary : "rgba(148,163,184,0.6)") : "transparent" },
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingBottom: 4 },
  day: { width: 48, paddingVertical: 8, borderRadius: 12, borderWidth: 1, alignItems: "center", gap: 4 },
  dayDefault: { borderColor: "rgba(255,255,255,0.1)" },
  daySelected: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` },
  dayName: { fontSize: 10, fontWeight: "500", color: theme.colors.muted, textTransform: "uppercase" },
  dayNum: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
