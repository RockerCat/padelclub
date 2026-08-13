import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import { CalendarPlus, Trophy, MapPin, Users as UsersIcon } from "lucide-react-native";
import { durationLabel } from "../lib/durations";
import { tournamentCategoryLabel, tournamentStatusLabel } from "../lib/tournaments";
import { formatShortDate } from "../lib/dateFormat";
import { isoToBogotaWallClock } from "../lib/bogotaDatetime";
import type { MyReservation } from "../lib/playerReservations";
import type { UpcomingBookingDetails, UpcomingTournamentActivity } from "../lib/playerDashboard";
import { theme } from "../lib/theme";

const RESERVATION_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente de confirmación",
  confirmed: "Confirmada",
};

const RESERVATION_TYPE_LABEL: Record<string, string> = { match: "Partido", class: "Clase" };

interface UpcomingActivityCardProps {
  booking: (MyReservation & UpcomingBookingDetails) | null;
  tournamentActivity: UpcomingTournamentActivity | null;
}

// Traducción 1:1 de UpcomingActivityCard.tsx (app web) — misma prioridad
// Reserva/Partido (una sola tarjeta destacada) por encima de Torneo (solo
// si no hay ninguna reserva próxima), mismo estado vacío con dos CTAs.
// Nunca crea nada — solo navega al módulo correspondiente, reutilizando
// las mismas stacks nativas ya usadas en el resto de la app (ver
// ReservationsStack.tsx / TournamentsStack.tsx).
export function UpcomingActivityCard({ booking, tournamentActivity }: UpcomingActivityCardProps) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  if (booking) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Próxima actividad</Text>
          <Text style={styles.typeTag}>{RESERVATION_TYPE_LABEL[booking.type] ?? "Reserva"}</Text>
        </View>

        <View style={styles.detailsRow}>
          <Text style={styles.detailsStrong}>{formatShortDate(booking.date)}</Text>
          <Text style={styles.detailsText}>
            {booking.start_time.slice(0, 5)} · {durationLabel(booking.duration_minutes)}
          </Text>
          <View style={styles.inlineIconText}>
            <MapPin width={13} height={13} color={theme.colors.muted} />
            <Text style={styles.detailsMuted}>{booking.courtName}</Text>
          </View>
        </View>

        {booking.companions.length > 0 && (
          <View style={styles.inlineIconText}>
            <UsersIcon width={13} height={13} color={theme.colors.muted} />
            <Text style={styles.companionsText}>Con {booking.companions.join(", ")}</Text>
          </View>
        )}

        <View style={styles.footerRow}>
          <Text style={styles.statusText}>{RESERVATION_STATUS_LABEL[booking.status] ?? booking.status}</Text>
          <TouchableOpacity
            style={styles.ctaButton}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("ReservasTab", { screen: "ReservationDetail", params: { id: booking.id } })}
          >
            <Text style={styles.ctaButtonText}>Ver reserva</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (tournamentActivity) {
    const t = tournamentActivity.tournament;
    const startsAtDate = t.starts_at ? isoToBogotaWallClock(t.starts_at).slice(0, 10) : null;
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Próxima actividad</Text>
          <Text style={styles.typeTag}>Torneo</Text>
        </View>

        <Text style={styles.tournamentName}>{t.name}</Text>
        <View style={styles.detailsRow}>
          {startsAtDate && <Text style={styles.detailsMuted}>{formatShortDate(startsAtDate)}</Text>}
          <Text style={styles.detailsMuted}>Categoría {tournamentCategoryLabel(t.category, t.secondary_category)}</Text>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.statusText}>
            {tournamentActivity.entryStatus === "pending" ? "Inscripción pendiente" : tournamentStatusLabel(t.status)}
          </Text>
          <TouchableOpacity
            style={styles.ctaButton}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("TournamentsTab", { screen: "TournamentDetail", params: { tournamentId: t.id } })}
          >
            <Text style={styles.ctaButtonText}>Ver torneo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Próxima actividad</Text>
      <Text style={styles.emptyText}>No tienes actividades próximas.</Text>
      <View style={styles.emptyActionsRow}>
        <TouchableOpacity
          style={styles.emptyPrimaryButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate("ReservasTab", { screen: "ReservationsList" })}
        >
          <CalendarPlus width={14} height={14} color={theme.colors.bg} />
          <Text style={styles.emptyPrimaryButtonText}>Reservar cancha</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.emptySecondaryButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate("TournamentsTab", { screen: "TournamentsList" })}
        >
          <Trophy width={14} height={14} color={theme.colors.white} />
          <Text style={styles.emptySecondaryButtonText}>Ver torneos</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    padding: 16,
    gap: 10,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { color: theme.colors.white, fontSize: 13, fontWeight: "700" },
  typeTag: { color: theme.colors.muted, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  detailsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, rowGap: 4 },
  detailsStrong: { color: theme.colors.white, fontSize: 14, fontWeight: "700", textTransform: "capitalize" },
  detailsText: { color: theme.colors.white, fontSize: 14 },
  detailsMuted: { color: theme.colors.muted, fontSize: 13 },
  inlineIconText: { flexDirection: "row", alignItems: "center", gap: 5 },
  companionsText: { color: theme.colors.muted, fontSize: 12 },
  tournamentName: { color: theme.colors.white, fontSize: 14, fontWeight: "700" },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 },
  statusText: { color: theme.colors.muted, fontSize: 12 },
  ctaButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  ctaButtonText: { color: theme.colors.bg, fontSize: 12, fontWeight: "700" },
  emptyText: { color: theme.colors.muted, fontSize: 13 },
  emptyActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  emptyPrimaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyPrimaryButtonText: { color: theme.colors.bg, fontSize: 12, fontWeight: "700" },
  emptySecondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptySecondaryButtonText: { color: theme.colors.white, fontSize: 12, fontWeight: "700" },
});
