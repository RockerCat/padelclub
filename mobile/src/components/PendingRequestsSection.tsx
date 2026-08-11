import { StyleSheet, Text, View } from "react-native";
import { Clock } from "lucide-react-native";
import { theme } from "../lib/theme";
import type { PendingRequest } from "../lib/reservationAdminRequests";
import { PendingRequestCard } from "./PendingRequestCard";

// Traducción 1:1 de PendingRequestsSection.tsx (app web) — mismo header
// (ícono + título + badge de conteo), misma condición de visibilidad
// (nunca se monta con 0 solicitudes), mismo refresh posterior a una acción
// (onChanged, equivalente a router.refresh()).
export function PendingRequestsSection({
  requests,
  clubId,
  onChanged,
  onReview,
}: {
  requests: PendingRequest[];
  clubId: string;
  onChanged: () => void;
  onReview: (request: PendingRequest) => void;
}) {
  if (requests.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Clock width={16} height={16} color={theme.colors.warning} />
        <Text style={styles.title}>Solicitudes pendientes</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{requests.length}</Text>
        </View>
      </View>
      <View style={{ gap: 10 }}>
        {requests.map((req) => (
          <PendingRequestCard key={req.id} request={req} clubId={clubId} onDone={onChanged} onReview={onReview} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 15, fontWeight: "700", color: theme.colors.white },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(251,191,36,0.2)" },
  badgeText: { fontSize: 12, fontWeight: "600", color: theme.colors.warning },
});
