import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { X, MessageCircle } from "lucide-react-native";
import { PlayerSportAvatar } from "./PlayerSportAvatar";
import { theme } from "../lib/theme";
import type { MemberRow, MemberSportState } from "../lib/players";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

// Detalle mínimo de jugador — MemberModal.tsx en la web (438 líneas) es un
// panel de administración completo (ajustar puntos, cambiar categoría,
// desactivar membresía, ver email/partidos) — un módulo de gestión aparte,
// fuera de alcance de esta pasada (ver reporte). Esto es solo la
// navegación mínima para que tocar una fila no quede muerta: los mismos
// datos ya visibles en la fila (avatar deportivo, categoría, ranking,
// puntos, estado, fecha de ingreso) más "Contactar por WhatsApp" — una
// acción real ya establecida en el resto de la app (Player Contact
// Principles), no una mutación nueva.
export function PlayerDetailSheet({
  member,
  sportState,
  onClose,
}: {
  member: MemberRow | null;
  sportState: MemberSportState | undefined;
  onClose: () => void;
}) {
  if (!member) return null;
  const name = member.profiles?.full_name ?? "Sin nombre";
  const phone = member.profiles?.phone;

  function handleWhatsApp() {
    if (!phone) return;
    const digits = phone.replace(/[^\d]/g, "");
    Linking.openURL(`https://wa.me/${digits}`);
  }

  return (
    <Modal visible={!!member} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Jugador</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <X width={16} height={16} color={theme.colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.identityRow}>
              <PlayerSportAvatar
                player={{ id: member.profile_id, ...member.profiles }}
                size="lg"
                sportCategory={sportState?.category ?? null}
                rankingPosition={sportState?.position ?? null}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {name}
                </Text>
                <Text style={[styles.status, { color: member.is_active ? theme.colors.success : theme.colors.muted }]}>
                  {member.is_active ? "Activo" : "Inactivo"}
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <Stat label="Categoría" value={sportState?.category ?? "—"} />
              <Stat label="Ranking" value={sportState?.position != null ? `#${sportState.position}` : "—"} />
              <Stat label="Puntos" value={String(sportState?.points ?? 0)} />
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Desde</Text>
              <Text style={styles.rowValue}>{formatDate(member.joined_at)}</Text>
            </View>

            {phone && (
              <TouchableOpacity style={styles.whatsappButton} onPress={handleWhatsApp} activeOpacity={0.85}>
                <MessageCircle width={16} height={16} color="#34D399" />
                <Text style={styles.whatsappText}>Contactar por WhatsApp</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  closeButton: { padding: 6, borderRadius: 8 },
  body: { padding: 20, gap: 16, paddingBottom: 32 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  name: { fontSize: 17, fontWeight: "700", color: theme.colors.white },
  status: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  statsRow: { flexDirection: "row", paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  statValue: { fontSize: 18, fontWeight: "700", color: theme.colors.white },
  statLabel: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  rowLabel: { fontSize: 13, color: theme.colors.muted },
  rowValue: { fontSize: 14, color: theme.colors.white, fontWeight: "500" },
  whatsappButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
  },
  whatsappText: { color: "#34D399", fontSize: 14, fontWeight: "600" },
});
