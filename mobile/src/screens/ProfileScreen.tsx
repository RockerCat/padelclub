import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Camera, X } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { getMyProfileActivity, type ProfileActivity } from "../lib/profileActivity";
import { updateOwnPhone, updateProfileAvatar } from "../lib/profileMutations";
import { pickAndUploadProfileAvatar, deleteOwnedAvatarObject } from "../lib/profileAvatarUpload";
import { clubRoleLabel } from "../lib/roleLabels";
import { durationLabel } from "../lib/durations";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { Skeleton } from "../components/Skeleton";
import { Toast } from "../components/Toast";
import { theme } from "../lib/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH[m - 1]} ${String(y).slice(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${MONTH[d.getMonth()]}`;
}

function endTime(start: string, durationMinutes: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const RESERVATION_STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  confirmed: { label: "Confirmada", dot: theme.colors.success, text: theme.colors.success },
  pending: { label: "Pendiente", dot: theme.colors.warning, text: theme.colors.warning },
  cancelled: { label: "Cancelada", dot: "rgba(248,113,113,0.6)", text: theme.colors.muted },
  rejected: { label: "Rechazada", dot: theme.colors.danger, text: theme.colors.danger },
};
const FALLBACK_STATUS = { label: "Estado desconocido", dot: "rgba(255,255,255,0.3)", text: theme.colors.muted };
const RESERVATION_TYPE_LABELS: Record<string, string> = { match: "Partido", class: "Clase" };

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
      <View style={subtitle ? styles.cardBodyWithSubtitle : styles.cardBody}>{children}</View>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Puerto RN de /profile (app web) — ver PersonalInfoCard/ProfileAvatarUpload/
// PhoneEditField/MembershipsList/ProfileSummaryGrid/MonthlyActivityChart/
// TypeDistributionChart/RecentActivityList. Una sola pantalla con un único
// ScrollView vertical (nunca un FlatList anidado — las listas aquí son
// pequeñas y acotadas: membresías, 12 puntos mensuales, 2 tipos, reservas
// recientes — mismo criterio ya usado por MembershipsList/RecentActivityList
// en WEB, que tampoco son listas virtualizadas). get_my_profile_activity
// (getMyProfileActivity) es la misma RPC que WEB, vía
// shared/players/profileActivity.ts — nunca una segunda fuente de verdad.
export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session } = useAuth();
  const { identity, reload: reloadClub } = useClub();
  const userId = session?.user.id ?? null;

  const [activity, setActivity] = useState<ProfileActivity | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [activityResult, phoneRow] = await Promise.all([
      getMyProfileActivity(supabase),
      supabase.from("profiles").select("phone, avatar_url").eq("id", userId).single(),
    ]);
    if (activityResult.error) setError(activityResult.error);
    else setActivity(activityResult.data);
    setPhone(phoneRow.data?.phone ?? null);
    setAvatarUrl(phoneRow.data?.avatar_url ?? null);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handlePickAvatar() {
    if (!userId) return;
    setUploadingAvatar(true);
    try {
      const picked = await pickAndUploadProfileAvatar(supabase, userId);
      if (picked.cancelled) return;
      if (picked.error || !picked.url) {
        Alert.alert("No se pudo actualizar la foto", picked.error ?? "Intenta de nuevo.");
        return;
      }
      const result = await updateProfileAvatar(supabase, userId, picked.url);
      if (!result.success) {
        Alert.alert("No se pudo actualizar la foto", result.error);
        return;
      }
      if (avatarUrl) await deleteOwnedAvatarObject(supabase, userId, avatarUrl);
      setAvatarUrl(picked.url);
      setToastMessage("Foto de perfil actualizada");
      // ClubContext.identity.avatarUrl se cargó una sola vez al montar la
      // sesión — sin este reload quedaría apuntando a la foto anterior en
      // cualquier otra pantalla que lo consuma, aunque esta ya muestre la
      // nueva (leída de su propio estado local, no de ClubContext).
      reloadClub();
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleConfirmDeleteAvatar() {
    if (!userId) return;
    setDeletingAvatar(true);
    try {
      const result = await updateProfileAvatar(supabase, userId, null);
      if (!result.success) {
        Alert.alert("No se pudo eliminar la foto", result.error);
        return;
      }
      if (avatarUrl) await deleteOwnedAvatarObject(supabase, userId, avatarUrl);
      setAvatarUrl(null);
      setToastMessage("Foto de perfil eliminada");
      reloadClub();
    } finally {
      setDeletingAvatar(false);
      setConfirmDeleteOpen(false);
    }
  }

  async function handleSavePhone() {
    if (!userId) return;
    setSavingPhone(true);
    setPhoneError(null);
    const result = await updateOwnPhone(supabase, userId, phoneValue);
    setSavingPhone(false);
    if (!result.success) {
      setPhoneError(result.error);
      return;
    }
    setPhone(result.phone);
    setEditingPhone(false);
    setToastMessage("Número guardado");
  }

  const hasMemberships = !!activity && activity.activeMemberships.length > 0;
  const hasActivity = !!activity && activity.summary.totalReservations > 0;
  const name = identity?.name ?? "Usuario";
  const email = identity?.email ?? session?.user.email ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mi Perfil</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.closeButton}>
          <X width={20} height={20} color={theme.colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <>
            <Skeleton style={{ height: 96, borderRadius: theme.radius.lg }} />
            <Skeleton style={{ height: 140, borderRadius: theme.radius.lg, marginTop: 12 }} />
          </>
        ) : (
          <>
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Información personal — avatar editable + nombre/correo/WhatsApp. */}
            <View style={styles.personalCard}>
              <TouchableOpacity
                onPress={handlePickAvatar}
                disabled={uploadingAvatar}
                style={styles.avatarButton}
                accessibilityLabel={avatarUrl ? "Cambiar foto de perfil" : "Subir foto de perfil"}
              >
                <PlayerAvatar player={{ full_name: name, avatar_url: avatarUrl }} size="2xl" />
                <View style={styles.avatarOverlay}>
                  {uploadingAvatar ? (
                    <ActivityIndicator color={theme.colors.white} size="small" />
                  ) : (
                    <Camera width={18} height={18} color={theme.colors.white} />
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.personalInfo}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                {!!email && (
                  <Text style={styles.email} numberOfLines={1}>
                    {email}
                  </Text>
                )}

                {!editingPhone ? (
                  <View style={styles.phoneRow}>
                    <Text style={styles.phoneLabel}>WhatsApp:</Text>
                    <Text style={styles.phoneValue}>{phone ?? "—"}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setPhoneValue(phone ?? "");
                        setPhoneError(null);
                        setEditingPhone(true);
                      }}
                    >
                      <Text style={styles.linkText}>{phone ? "Editar" : "Agregar"}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.phoneEdit}>
                    <TextInput
                      value={phoneValue}
                      onChangeText={setPhoneValue}
                      placeholder="+57 317 367 2033"
                      placeholderTextColor={theme.colors.muted}
                      keyboardType="phone-pad"
                      autoFocus
                      style={styles.phoneInput}
                    />
                    {!!phoneError && <Text style={styles.errorText}>{phoneError}</Text>}
                    <View style={styles.phoneEditActions}>
                      <TouchableOpacity onPress={handleSavePhone} disabled={savingPhone} style={styles.saveButton}>
                        {savingPhone ? (
                          <ActivityIndicator color={theme.colors.bg} size="small" />
                        ) : (
                          <Text style={styles.saveButtonText}>Guardar</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingPhone(false)} disabled={savingPhone}>
                        <Text style={styles.linkText}>Cancelar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {avatarUrl && !uploadingAvatar && (
                  <TouchableOpacity onPress={() => setConfirmDeleteOpen(true)} style={{ marginTop: 8 }}>
                    <Text style={styles.dangerLink}>Eliminar foto</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {activity && (
              <SectionCard title="Membresías actuales">
                {hasMemberships ? (
                  <View style={{ gap: 0 }}>
                    {activity.activeMemberships.map((m, i) => (
                      <View
                        key={`${m.clubName}-${i}`}
                        style={[styles.membershipRow, i === activity.activeMemberships.length - 1 && { borderBottomWidth: 0 }]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.membershipName} numberOfLines={1}>
                            {m.clubName}
                          </Text>
                          <Text style={styles.membershipRole}>{clubRoleLabel(m.role)} · Activa</Text>
                        </View>
                        {m.archived && (
                          <View style={styles.archivedBadge}>
                            <Text style={styles.archivedBadgeText}>Archivado</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>No tienes membresías activas en ningún club.</Text>
                )}
              </SectionCard>
            )}

            {activity && hasActivity && (
              <>
                <SectionCard title="Resumen personal">
                  <View style={styles.statsGrid}>
                    <StatTile label="Reservas totales" value={String(activity.summary.totalReservations)} />
                    <StatTile label="Confirmadas" value={String(activity.summary.confirmed)} />
                    <StatTile label="Pendientes" value={String(activity.summary.pending)} />
                    <StatTile label="Canceladas" value={String(activity.summary.cancelled)} />
                    <StatTile label="Rechazadas" value={String(activity.summary.rejected)} />
                    <StatTile label="Partidos" value={String(activity.summary.matches)} />
                    <StatTile label="Clases" value={String(activity.summary.classes)} />
                    <StatTile label="Horas confirmadas" value={`${activity.summary.confirmedHours}h`} />
                  </View>
                </SectionCard>

                <SectionCard
                  title="Evolución mensual"
                  subtitle="Reservas por fecha reservada de los últimos 12 meses (todos los estados)."
                >
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.monthlyChart}>
                      {activity.monthlyActivity.map((p) => {
                        const maxValue = Math.max(1, ...activity.monthlyActivity.map((x) => x.count));
                        const heightPx = p.count === 0 ? 0 : Math.max(3, Math.round((p.count / maxValue) * 100));
                        return (
                          <View key={p.month} style={styles.monthlyBarWrap}>
                            <Text style={styles.monthlyBarCount}>{p.count}</Text>
                            <View style={styles.monthlyBarTrack}>
                              <View style={[styles.monthlyBar, { height: heightPx }]} />
                            </View>
                            <Text style={styles.monthlyBarLabel}>{formatMonthLabel(p.month)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </SectionCard>

                <SectionCard title="Distribución por tipo">
                  <View style={{ gap: 10 }}>
                    {activity.typeDistribution.map((p) => {
                      const maxValue = Math.max(1, ...activity.typeDistribution.map((x) => x.count));
                      const pct = Math.round((p.count / maxValue) * 100);
                      return (
                        <View key={p.type} style={styles.typeRow}>
                          <Text style={styles.typeLabel}>{p.label}</Text>
                          <View style={styles.typeTrack}>
                            <View style={[styles.typeBar, { width: `${pct}%` }]} />
                          </View>
                          <Text style={styles.typeCount}>{p.count}</Text>
                        </View>
                      );
                    })}
                  </View>
                </SectionCard>

                <SectionCard title="Actividad reciente">
                  <View>
                    {activity.recentReservations.map((r, i) => {
                      const status = RESERVATION_STATUS_CONFIG[r.status] ?? FALLBACK_STATUS;
                      const typeLabel = RESERVATION_TYPE_LABELS[r.type] ?? r.type;
                      return (
                        <View
                          key={r.id}
                          style={[styles.activityRow, i === activity.recentReservations.length - 1 && { borderBottomWidth: 0 }]}
                        >
                          <View style={styles.activityTopRow}>
                            <Text style={styles.activityClub} numberOfLines={1}>
                              {r.clubName}
                            </Text>
                            <View style={styles.statusPill}>
                              <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
                              <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                            </View>
                          </View>
                          <Text style={styles.activityDetail} numberOfLines={1}>
                            {formatDate(r.date)} · {r.courtName} · {r.startTime}–{endTime(r.startTime, r.durationMinutes)} ·{" "}
                            {durationLabel(r.durationMinutes)} · {typeLabel}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </SectionCard>
              </>
            )}

            {activity && !hasActivity && (
              <View style={styles.emptyActivity}>
                <Text style={styles.emptyActivityTitle}>Aún no tienes actividad personal registrada</Text>
                <Text style={styles.emptyActivityBody}>
                  Las reservas creadas para administrar el club no se cuentan como participación personal.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={confirmDeleteOpen} transparent animationType="fade" onRequestClose={() => setConfirmDeleteOpen(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Eliminar foto de perfil</Text>
            <Text style={styles.confirmBody}>¿Seguro que quieres eliminar tu foto de perfil? Volverás a mostrar tus iniciales.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity onPress={() => setConfirmDeleteOpen(false)} disabled={deletingAvatar} style={styles.confirmCancel}>
                <Text style={styles.confirmCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirmDeleteAvatar} disabled={deletingAvatar} style={styles.confirmDelete}>
                {deletingAvatar ? <ActivityIndicator color={theme.colors.white} size="small" /> : <Text style={styles.confirmDeleteText}>Eliminar foto</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { color: theme.colors.white, fontSize: 18, fontWeight: "700" },
  closeButton: { padding: 4 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  errorBanner: {
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.2)",
    backgroundColor: "rgba(248,113,113,0.05)",
    borderRadius: theme.radius.md,
    padding: 12,
  },
  errorText: { color: theme.colors.danger, fontSize: 12 },
  personalCard: {
    flexDirection: "row",
    gap: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 16,
    alignItems: "flex-start",
  },
  avatarButton: { position: "relative" },
  avatarOverlay: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  personalInfo: { flex: 1, minWidth: 0 },
  name: { color: theme.colors.white, fontSize: 16, fontWeight: "700" },
  email: { color: theme.colors.muted, fontSize: 13, marginTop: 2 },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" },
  phoneLabel: { color: theme.colors.muted, fontSize: 13 },
  phoneValue: { color: theme.colors.white, fontSize: 13 },
  linkText: { color: theme.colors.primary, fontSize: 12, fontWeight: "600" },
  dangerLink: { color: theme.colors.danger, fontSize: 12, fontWeight: "600" },
  phoneEdit: { marginTop: 8, gap: 8 },
  phoneInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme.colors.white,
    fontSize: 14,
    backgroundColor: theme.colors.surfaceAlt,
  },
  phoneEditActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  saveButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 6 },
  saveButtonText: { color: theme.colors.bg, fontSize: 12, fontWeight: "700" },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 16,
  },
  cardTitle: { color: theme.colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  cardSubtitle: { color: "rgba(148,163,184,0.7)", fontSize: 11, marginTop: 4 },
  cardBody: { marginTop: 16 },
  cardBodyWithSubtitle: { marginTop: 12 },
  emptyText: { color: "rgba(148,163,184,0.7)", fontSize: 13 },
  membershipRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  membershipName: { color: theme.colors.white, fontSize: 14, fontWeight: "600" },
  membershipRole: { color: theme.colors.muted, fontSize: 12, marginTop: 1 },
  archivedBadge: {
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.2)",
    backgroundColor: "rgba(251,191,36,0.1)",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  archivedBadgeText: { color: theme.colors.warning, fontSize: 10, fontWeight: "600" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statTile: {
    width: "47%",
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 10,
  },
  statValue: { color: theme.colors.white, fontSize: 17, fontWeight: "700" },
  statLabel: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  monthlyChart: { flexDirection: "row", alignItems: "flex-end", gap: 10, height: 150, paddingHorizontal: 2 },
  monthlyBarWrap: { alignItems: "center", justifyContent: "flex-end", height: "100%", width: 32 },
  monthlyBarCount: { color: theme.colors.muted, fontSize: 10, marginBottom: 4 },
  monthlyBarTrack: { justifyContent: "flex-end", height: 100, width: "100%" },
  monthlyBar: { width: "100%", borderRadius: 6, backgroundColor: theme.colors.primary, opacity: 0.85 },
  monthlyBarLabel: { color: "rgba(148,163,184,0.7)", fontSize: 9, marginTop: 6 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  typeLabel: { color: theme.colors.muted, fontSize: 12, width: 56 },
  typeTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  typeBar: { height: "100%", borderRadius: 4, backgroundColor: theme.colors.primary },
  typeCount: { color: theme.colors.white, fontSize: 12, fontWeight: "700", width: 24, textAlign: "right" },
  activityRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  activityTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  activityClub: { color: theme.colors.muted, fontSize: 11, flex: 1, minWidth: 0 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "600" },
  activityDetail: { color: theme.colors.white, fontSize: 13, fontWeight: "500" },
  emptyActivity: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: theme.radius.lg,
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyActivityTitle: { color: theme.colors.white, fontWeight: "700", marginBottom: 4, textAlign: "center" },
  emptyActivityBody: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
  confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 20,
    gap: 12,
  },
  confirmTitle: { color: theme.colors.white, fontSize: 16, fontWeight: "700" },
  confirmBody: { color: theme.colors.muted, fontSize: 13, lineHeight: 18 },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 4 },
  confirmCancel: { paddingVertical: 8, paddingHorizontal: 4 },
  confirmCancelText: { color: theme.colors.muted, fontSize: 13, fontWeight: "600" },
  confirmDelete: { backgroundColor: theme.colors.danger, borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  confirmDeleteText: { color: theme.colors.white, fontSize: 13, fontWeight: "700" },
});
