import { useCallback, useEffect, useState } from "react";
import { Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import { CalendarPlus, MapPin, Clock, MessageCircle, ExternalLink, Navigation, Camera } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { getPlayerReservations, type MyReservation } from "../lib/playerReservations";
import { sortBookingsByProximity, filterVisibleRequests } from "../lib/reservationActivity";
import { useDismissedReservationIds } from "../lib/dismissedReservations";
import { usePlayerReservationsRealtime } from "../lib/playerReservationsRealtime";
import { getClubPublicPageData, type Court, type ClubNewsCard } from "../../../shared/clubs/publicPageData";
import type { ScheduleGroup } from "../lib/operatingHours";
import { formatShortDate } from "../lib/dateFormat";
import { ActivityCard } from "../components/ActivityCard";
import { Skeleton } from "../components/Skeleton";
import { theme } from "../lib/theme";

type ClubDetails = {
  description: string | null;
  cover_image_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  latitude: number | null;
  longitude: number | null;
  gallery_image_urls: string[] | null;
};

const SURFACE_LABELS: Record<string, string> = {
  "": "Sin especificar",
  cristal: "Cristal",
  moqueta: "Moqueta",
  césped_artificial: "Césped artificial",
  cemento: "Cemento",
  tierra: "Tierra batida",
};

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Equivalente nativo de src/app/(app)/[club]/home/page.tsx + PlayerHomeActivity.tsx
// + ClubInfoSections.tsx (app web) — el nuevo tab "Página del club" del PLAYER
// (ver AppTabs.tsx). Reutiliza exactamente las mismas piezas ya establecidas para
// "Mis próximas reservas"/"Mis solicitudes" que ReservationsListScreen (ActivityCard,
// getPlayerReservations, sortBookingsByProximity/filterVisibleRequests,
// useDismissedReservationIds, usePlayerReservationsRealtime) — nunca una segunda
// implementación. getClubPublicPageData es la misma fuente compartida que WEB usa
// para /[club]/home, /clubs/[slug] y la Vista Previa del OWNER (ver
// shared/clubs/publicPageData.ts).
//
// Dos piezas de la web NO se replican en esta pasada (decisión explícita, ver
// reporte): el mapa interactivo de Ubicación (necesitaría una dependencia nativa
// de mapas que el proyecto no tiene todavía — "Cómo llegar" abre Google Maps vía
// Linking, igual que el mismo botón ya hace en la web) y el lightbox de Galería
// (aquí es solo una tira horizontal de fotos, sin abrir a pantalla completa).
export function ClubHomeScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { session } = useAuth();
  const { club, identity } = useClub();
  const viewerId = session?.user?.id ?? "";

  const [details, setDetails] = useState<ClubDetails | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [schedule, setSchedule] = useState<ScheduleGroup[]>([]);
  const [news, setNews] = useState<ClubNewsCard[]>([]);
  const [myReservations, setMyReservations] = useState<MyReservation[]>([]);
  const [myBookings, setMyBookings] = useState<MyReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { dismissedIds, dismiss } = useDismissedReservationIds(club?.id ?? "");

  const load = useCallback(async () => {
    if (!club || !viewerId) return;
    const [clubRes, publicData, reservationsData] = await Promise.all([
      supabase
        .from("clubs")
        .select(
          "description, cover_image_url, address, city, state, country, whatsapp, instagram, facebook, youtube, latitude, longitude, gallery_image_urls"
        )
        .eq("id", club.id)
        .single(),
      getClubPublicPageData(supabase, club.id),
      getPlayerReservations(supabase, club.id, viewerId, todayStr()),
    ]);
    setDetails((clubRes.data as ClubDetails | null) ?? null);
    setCourts(publicData.courts);
    setSchedule(publicData.schedule);
    setNews(publicData.news);
    setMyReservations(reservationsData.myReservations);
    setMyBookings(reservationsData.myBookings);
  }, [club, viewerId]);

  useEffect(() => {
    if (!club) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [club, load]);

  usePlayerReservationsRealtime(useCallback(() => load(), [load]));

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!club) return null;

  const firstName = identity?.name?.split(/\s+/)[0] ?? "";

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.content}>
          <Skeleton style={{ height: 80, borderRadius: 16 }} />
          <Skeleton style={{ height: 120, borderRadius: 16 }} />
          <Skeleton style={{ height: 160, borderRadius: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  const visibleBookings = sortBookingsByProximity(myBookings);
  const visibleRequests = filterVisibleRequests(myReservations, dismissedIds);

  const locFull = [details?.city, details?.state, details?.country].filter(Boolean).join(", ");
  const hasCoords = details?.latitude != null && details?.longitude != null;
  const hasContact = !!(details?.whatsapp || details?.instagram || details?.facebook || details?.youtube);
  const gallery = details?.gallery_image_urls ?? [];
  const courtsBySurface = courts.reduce<Record<string, number>>((acc, c) => {
    if (!c.surface) return acc;
    acc[c.surface] = (acc[c.surface] ?? 0) + 1;
    return acc;
  }, {});
  const surfaceLines = Object.entries(courtsBySurface).map(
    ([surface, count]) => `${count} cancha${count > 1 ? "s" : ""} de ${(SURFACE_LABELS[surface] ?? surface).toLowerCase()}`
  );
  const directionsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${details!.latitude},${details!.longitude}`
    : locFull || details?.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([details?.address, locFull].filter(Boolean).join(", "))}`
      : null;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      >
        {details?.cover_image_url && <Image source={{ uri: details.cover_image_url }} style={styles.cover} />}
        <Text style={styles.greeting}>
          {firstName ? `Hola, ${firstName}. ` : ""}Esto es lo próximo en {club.name}.
        </Text>

        {/* Mis próximas reservas */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Mis próximas reservas</Text>
            <TouchableOpacity
              style={styles.reserveButton}
              activeOpacity={0.85}
              onPress={() => navigation.navigate("ReservasTab", { screen: "ReservationsList" })}
            >
              <CalendarPlus width={14} height={14} color={theme.colors.bg} />
              <Text style={styles.reserveButtonText}>Reservar cancha</Text>
            </TouchableOpacity>
          </View>
          {visibleBookings.length === 0 ? (
            <Text style={styles.emptyText}>Aún no tienes reservas próximas.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {visibleBookings.map((r) => (
                <ActivityCard
                  key={r.id}
                  reservation={r}
                  clubSlug={club.slug}
                  clubName={club.name}
                  viewerId={viewerId}
                  onPress={() => navigation.navigate("ReservasTab", { screen: "ReservationDetail", params: { id: r.id } })}
                  onDismiss={dismiss}
                  onCancelled={load}
                />
              ))}
            </View>
          )}
        </View>

        {/* Mis solicitudes */}
        {visibleRequests.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Mis solicitudes</Text>
            <View style={{ gap: 8 }}>
              {visibleRequests.map((r) => (
                <ActivityCard
                  key={r.id}
                  reservation={r}
                  clubSlug={club.slug}
                  clubName={club.name}
                  viewerId={viewerId}
                  onPress={() => navigation.navigate("ReservasTab", { screen: "ReservationDetail", params: { id: r.id } })}
                  onDismiss={dismiss}
                  onCancelled={load}
                />
              ))}
            </View>
          </View>
        )}

        {/* Noticias recientes */}
        {news.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Noticias recientes</Text>
            {news.map((item) => (
              <View key={item.id} style={styles.newsCard}>
                {item.image_url && <Image source={{ uri: item.image_url }} style={styles.newsImage} />}
                <View style={{ padding: 12, gap: 4 }}>
                  <Text style={styles.newsTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.newsDate}>{formatShortDate(item.published_at.slice(0, 10))}</Text>
                  <Text style={styles.newsSnippet} numberOfLines={3}>
                    {item.content}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Ubicación */}
        {(details?.address || locFull || hasCoords) && (
          <View style={styles.card}>
            <View style={styles.infoHeaderRow}>
              <MapPin width={14} height={14} color={theme.colors.muted} />
              <Text style={styles.cardTitle}>Ubicación</Text>
            </View>
            {(details?.address || locFull) && (
              <Text style={styles.bodyText}>{[details?.address, locFull].filter(Boolean).join(" · ")}</Text>
            )}
            {directionsUrl && (
              <TouchableOpacity style={styles.outlineButton} onPress={() => Linking.openURL(directionsUrl)} activeOpacity={0.85}>
                <Navigation width={14} height={14} color={theme.colors.white} />
                <Text style={styles.outlineButtonText}>Cómo llegar</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Horarios e instalaciones */}
        {(schedule.length > 0 || courts.length > 0) && (
          <View style={styles.card}>
            <View style={styles.infoHeaderRow}>
              <Clock width={14} height={14} color={theme.colors.muted} />
              <Text style={styles.cardTitle}>Horarios e instalaciones</Text>
            </View>
            {schedule.map(({ label, timeRange }) => (
              <View key={label} style={styles.scheduleRow}>
                <Text style={styles.bodyText}>{label}</Text>
                <Text style={styles.scheduleTime}>{timeRange}</Text>
              </View>
            ))}
            {courts.length > 0 && (
              <View style={{ marginTop: schedule.length > 0 ? 8 : 0 }}>
                <Text style={styles.bodyText}>
                  {courts.length} cancha{courts.length > 1 ? "s" : ""} activa{courts.length > 1 ? "s" : ""}
                </Text>
                {surfaceLines.map((line) => (
                  <Text key={line} style={styles.mutedLine}>
                    {line}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Contacto */}
        {hasContact && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Contacto</Text>
            {details?.whatsapp && (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => Linking.openURL(`https://wa.me/${details.whatsapp!.replace(/[^\d+]/g, "")}`)}
              >
                <MessageCircle width={16} height={16} color={theme.colors.muted} />
                <View>
                  <Text style={styles.contactLabel}>WhatsApp</Text>
                  <Text style={styles.contactValue}>{details.whatsapp}</Text>
                </View>
              </TouchableOpacity>
            )}
            {details?.instagram && (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() =>
                  Linking.openURL(
                    details.instagram!.startsWith("http") ? details.instagram! : `https://instagram.com/${details.instagram!.replace(/^@/, "")}`
                  )
                }
              >
                <ExternalLink width={16} height={16} color={theme.colors.muted} />
                <View>
                  <Text style={styles.contactLabel}>Instagram</Text>
                  <Text style={styles.contactValue}>{details.instagram}</Text>
                </View>
              </TouchableOpacity>
            )}
            {details?.facebook && (
              <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL(details.facebook!)}>
                <ExternalLink width={16} height={16} color={theme.colors.muted} />
                <View>
                  <Text style={styles.contactLabel}>Facebook</Text>
                  <Text style={styles.contactValue}>{details.facebook}</Text>
                </View>
              </TouchableOpacity>
            )}
            {details?.youtube && (
              <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL(details.youtube!)}>
                <ExternalLink width={16} height={16} color={theme.colors.muted} />
                <View>
                  <Text style={styles.contactLabel}>YouTube</Text>
                  <Text style={styles.contactValue}>{details.youtube}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Galería — tira horizontal simple, sin lightbox (ver nota arriba) */}
        {gallery.length > 0 && (
          <View style={styles.card}>
            <View style={styles.infoHeaderRow}>
              <Camera width={14} height={14} color={theme.colors.muted} />
              <Text style={styles.cardTitle}>Galería</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {gallery.map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.galleryImage} />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  cover: { width: "100%", height: 120, borderRadius: 16, backgroundColor: theme.colors.surface },
  greeting: { color: theme.colors.muted, fontSize: 13 },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    padding: 16,
    gap: 10,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { color: theme.colors.white, fontSize: 14, fontWeight: "700" },
  emptyText: { color: theme.colors.muted, fontSize: 12 },
  reserveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reserveButtonText: { color: theme.colors.bg, fontSize: 12, fontWeight: "700" },
  sectionTitle: { color: theme.colors.white, fontSize: 14, fontWeight: "700" },
  newsCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
  },
  newsImage: { width: "100%", height: 130, backgroundColor: theme.colors.surfaceAlt },
  newsTitle: { color: theme.colors.white, fontSize: 14, fontWeight: "700" },
  newsDate: { color: theme.colors.muted, fontSize: 11 },
  newsSnippet: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  infoHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  bodyText: { color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 18 },
  mutedLine: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 40,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  outlineButtonText: { color: theme.colors.white, fontSize: 13, fontWeight: "500" },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  scheduleTime: { color: theme.colors.primary, fontSize: 13, fontWeight: "700" },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  contactLabel: { color: "rgba(148,163,184,0.6)", fontSize: 10 },
  contactValue: { color: theme.colors.white, fontSize: 13, fontWeight: "500" },
  galleryImage: { width: 110, height: 110, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt },
});
