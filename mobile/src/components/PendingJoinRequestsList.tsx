import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";
import type { PendingReservationJoinRequest } from "../lib/reservationJoinRequests";

function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Traducción 1:1 de PendingJoinRequestsList.tsx (app web) — misma fila por
// solicitud (avatar/iniciales + nombre + Rechazar/Aprobar), puramente
// presentacional: el caller (ReservationTicketPanel, vía
// useReservationJoinManagement) sigue siendo dueño de la lista y los
// handlers. El avatar usa el mismo patrón foto-o-iniciales que
// ReservationDetailScreen ya tiene — no el PlayerSportAvatar real (que no
// existe en mobile todavía), consistente con esa misma pantalla.
export function PendingJoinRequestsList({
  requests,
  resolving,
  resolvingRequestId,
  onApprove,
  onReject,
  error,
}: {
  requests: PendingReservationJoinRequest[];
  resolving: boolean;
  resolvingRequestId: string | null;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
  error: string | null;
}) {
  if (requests.length === 0) return null;

  return (
    <View>
      {requests.map((req, i) => (
        <View key={req.id} style={[styles.row, i < requests.length - 1 && styles.rowBorder]}>
          <View style={styles.identity}>
            {req.avatar_url ? (
              <Image source={{ uri: req.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{getInitials(req.full_name ?? "?")}</Text>
              </View>
            )}
            <Text style={styles.name} numberOfLines={1}>
              {req.full_name ?? "Jugador"}
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => onReject(req.id)} disabled={resolving} style={styles.rejectButton}>
              <Text style={styles.rejectButtonText}>Rechazar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onApprove(req.id)} disabled={resolving} style={styles.approveButton}>
              {resolving && resolvingRequestId === req.id ? (
                <ActivityIndicator size="small" color={theme.colors.bg} />
              ) : (
                <Text style={styles.approveButtonText}>Aprobar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.05)" },
  identity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarFallback: { backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 10, fontWeight: "700", color: theme.colors.white },
  name: { fontSize: 14, color: theme.colors.white, flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  rejectButton: { height: 32, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  rejectButtonText: { fontSize: 12, fontWeight: "600", color: theme.colors.muted },
  approveButton: { height: 32, paddingHorizontal: 12, borderRadius: 8, backgroundColor: theme.colors.success, alignItems: "center", justifyContent: "center" },
  approveButtonText: { fontSize: 12, fontWeight: "700", color: theme.colors.bg },
  errorText: { fontSize: 12, color: theme.colors.danger, paddingTop: 8, paddingBottom: 4 },
});
