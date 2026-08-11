import { useCallback, useEffect, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { getPlayerReservations, type MyReservation } from "../lib/playerReservations";
import { theme } from "../lib/theme";
import { Skeleton } from "../components/Skeleton";
import { StatusPill } from "../components/StatusPill";
import { addMinutes } from "../lib/time";
import { OwnerDashboardScreen } from "./OwnerDashboardScreen";

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Home nativa — equivalente reducido de src/app/(app)/[club]/home/page.tsx
// (app web): identidad del club + saludo + "lo próximo" (misma fuente,
// getPlayerReservations). Deliberadamente sin noticias ni información del
// club (fuera de alcance de esta fase, ver instrucciones del vertical
// slice). La pantalla se monta de inmediato; los datos llegan después con
// skeleton, nunca bloqueando la navegación.
export function HomeScreen() {
  const { session, signOut } = useAuth();
  const { club, role, identity, loading: clubLoading, error: clubError, reload } = useClub();
  const navigation = useNavigation<any>();

  const [reservations, setReservations] = useState<{ myReservations: MyReservation[]; myBookings: MyReservation[] } | null>(
    null
  );
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReservations = useCallback(async () => {
    if (!club || !session?.user) return;
    const data = await getPlayerReservations(supabase, club.id, session.user.id, todayStr());
    setReservations(data);
  }, [club, session?.user]);

  useEffect(() => {
    setLoadingData(true);
    loadReservations().finally(() => setLoadingData(false));
  }, [loadReservations]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([reload(), loadReservations()]);
    setRefreshing(false);
  }

  const firstName = identity?.name?.split(/\s+/)[0] ?? "";
  const pendingCount = reservations?.myReservations.filter((r) => r.status === "pending").length ?? 0;
  const nextBooking = reservations?.myBookings
    .slice()
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))[0];

  if (clubError) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{clubError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={reload}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!clubLoading && !club) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Sin club activo</Text>
          <Text style={styles.emptyText}>Tu cuenta no tiene una membresía activa en ningún club todavía.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={signOut}>
            <Text style={styles.retryButtonText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // OWNER/ADMIN — mismo punto de decisión por rol que /[club]/dashboard en
  // la web (page.tsx: "PLAYER gets its own personal sport Dashboard...
  // never a reduced copy of the OWNER/ADMIN operational dashboard"), acá
  // en sentido inverso: el contenido de abajo ("Lo próximo") es exclusivo
  // de PLAYER y nunca se le muestra a un OWNER/ADMIN.
  if (role === "OWNER" || role === "ADMIN") {
    return <OwnerDashboardScreen />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      >
        <View style={styles.headerRow}>
          <View style={styles.clubIdentity}>
            {clubLoading ? (
              <Skeleton style={{ width: 40, height: 40, borderRadius: theme.radius.md }} />
            ) : club?.logo_url ? (
              <Image source={{ uri: club.logo_url }} style={styles.logo} />
            ) : (
              <View style={[styles.logo, styles.logoFallback]}>
                <Text style={styles.logoFallbackText}>{club?.name?.slice(0, 2).toUpperCase() ?? "PC"}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              {clubLoading ? (
                <Skeleton style={{ width: 140, height: 16, marginBottom: 6 }} />
              ) : (
                <Text style={styles.clubName} numberOfLines={1}>
                  {club?.name}
                </Text>
              )}
              <Text style={styles.greeting}>{firstName ? `Hola, ${firstName}` : "Hola"}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={signOut} style={styles.logoutButton} accessibilityLabel="Cerrar sesión">
            <Text style={styles.logoutButtonText}>Salir</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Lo próximo</Text>

        {loadingData ? (
          <View style={styles.card}>
            <Skeleton style={{ width: "60%", height: 14, marginBottom: 10 }} />
            <Skeleton style={{ width: "40%", height: 20 }} />
          </View>
        ) : nextBooking ? (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("ReservasTab", { screen: "ReservationDetail", params: { id: nextBooking.id } })}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardCourt}>{nextBooking.courtName}</Text>
              <StatusPill status={nextBooking.status} />
            </View>
            <Text style={styles.cardTime}>
              {nextBooking.date} · {nextBooking.start_time.slice(0, 5)} - {addMinutes(nextBooking.start_time, nextBooking.duration_minutes)}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardEmpty}>No tienes reservas próximas.</Text>
          </View>
        )}

        {!loadingData && pendingCount > 0 && (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingBannerText}>
              Tienes {pendingCount} {pendingCount === 1 ? "solicitud pendiente" : "solicitudes pendientes"} de aprobación.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("ReservasTab", { screen: "ReservationsList" })}
        >
          <Text style={styles.secondaryButtonText}>Ver todas mis reservas</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, gap: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  clubIdentity: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  logo: { width: 40, height: 40, borderRadius: theme.radius.md },
  logoFallback: { backgroundColor: `${theme.colors.primary}22`, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: theme.colors.primary, fontWeight: "700", fontSize: 13 },
  clubName: { color: theme.colors.white, fontSize: 16, fontWeight: "700" },
  greeting: { color: theme.colors.muted, fontSize: 13, marginTop: 2 },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  logoutButtonText: { color: theme.colors.muted, fontSize: 13, fontWeight: "600" },
  sectionTitle: { color: theme.colors.white, fontSize: 14, fontWeight: "700", marginTop: 4 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardCourt: { color: theme.colors.white, fontSize: 15, fontWeight: "700" },
  cardTime: { color: theme.colors.muted, fontSize: 13 },
  cardEmpty: { color: theme.colors.muted, fontSize: 13 },
  pendingBanner: {
    backgroundColor: "rgba(251,191,36,0.1)",
    borderColor: "rgba(251,191,36,0.2)",
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 12,
  },
  pendingBannerText: { color: theme.colors.warning, fontSize: 13 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  secondaryButtonText: { color: theme.colors.white, fontSize: 14, fontWeight: "600" },
  errorText: { color: theme.colors.danger, fontSize: 14, textAlign: "center" },
  emptyTitle: { color: theme.colors.white, fontSize: 16, fontWeight: "700" },
  emptyText: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
  retryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingHorizontal: 20, paddingVertical: 10 },
  retryButtonText: { color: theme.colors.bg, fontWeight: "700" },
});
