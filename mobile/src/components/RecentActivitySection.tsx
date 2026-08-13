import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import {
  CalendarPlus,
  CalendarCheck,
  Trophy,
  FlagOff,
  Star,
  ArrowUpDown,
  ChevronDown,
  type LucideIcon,
} from "lucide-react-native";
import type { PlayerActivityEvent } from "../lib/playerDashboard";
import { theme } from "../lib/theme";

const EVENT_ICON: Record<PlayerActivityEvent["type"], LucideIcon> = {
  reservation_created: CalendarPlus,
  reservation_confirmed: CalendarCheck,
  tournament_entry_created: Trophy,
  tournament_completed: FlagOff,
  points_movement: Star,
  category_change: ArrowUpDown,
};

// Misma fecha absoluta (día/mes/año) que la web, mismo huso fijo
// (America/Bogota) — ver RecentActivitySection.tsx (app web) y su
// comentario sobre por qué se mantiene explícito aunque en mobile no haya
// hidratación server/cliente.
function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" });
}

// Traducción 1:1 de RecentActivitySection.tsx (app web) — acordeón cerrado
// por defecto, mismo contador, mismos ítems/orden ya resueltos por
// getPlayerRecentActivity (playerDashboard.ts); abrir/cerrar es solo
// estado visual local, nunca dispara una consulta nueva. Navegación al
// tocar un ítem: reserva → listado de Reservas (igual que la web, que
// tampoco enlaza a una reserva puntual); torneo → detalle del torneo real
// vía targetTournamentId (mismo destino que el href de la web, resuelto
// por id en vez de por slug — ver ese campo en playerDashboard.ts).
// points_movement/category_change no son tocables en mobile: la web los
// enlaza a /ranking, una pantalla que en mobile sigue siendo un
// PlaceholderScreen (módulo aparte, no implementado) — dependencia externa
// real, no un recorte de esta tarea.
export function RecentActivitySection({ items }: { items: PlayerActivityEvent[] }) {
  const [open, setOpen] = useState(false);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  if (items.length === 0) return null;

  function handlePress(item: PlayerActivityEvent) {
    if (item.type === "reservation_created" || item.type === "reservation_confirmed") {
      navigation.navigate("ReservasTab", { screen: "ReservationsList" });
      return;
    }
    if (item.targetTournamentId) {
      navigation.navigate("TournamentsTab", { screen: "TournamentDetail", params: { tournamentId: item.targetTournamentId } });
    }
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.headerRow} activeOpacity={0.8} onPress={() => setOpen((v) => !v)}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Actividad reciente</Text>
          <Text style={styles.count}>({items.length})</Text>
        </View>
        <ChevronDown
          width={16}
          height={16}
          color={theme.colors.muted}
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </TouchableOpacity>

      {open && (
        <View style={styles.list}>
          {items.map((item) => {
            const Icon = EVENT_ICON[item.type];
            const isPressable = item.type === "reservation_created" || item.type === "reservation_confirmed" || !!item.targetTournamentId;
            const row = (
              <View style={styles.itemRow}>
                <View style={styles.itemIcon}>
                  <Icon width={14} height={14} color={theme.colors.muted} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                  <Text style={styles.itemDate}>{formatAbsoluteDate(item.at)}</Text>
                </View>
              </View>
            );
            return isPressable ? (
              <TouchableOpacity key={item.id} activeOpacity={0.7} onPress={() => handlePress(item)}>
                {row}
              </TouchableOpacity>
            ) : (
              <View key={item.id}>{row}</View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    overflow: "hidden",
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: theme.colors.white, fontSize: 13, fontWeight: "700" },
  count: { color: theme.colors.muted, fontSize: 12 },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 12,
  },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  itemIcon: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.sm,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  itemLabel: { color: theme.colors.white, fontSize: 13 },
  itemDate: { color: theme.colors.muted, fontSize: 11, marginTop: 2, opacity: 0.8 },
});
