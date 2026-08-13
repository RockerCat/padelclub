import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import MapView, { Marker } from "react-native-maps";
import { CalendarPlus, MapPin, Clock, MessageCircle, ExternalLink, Navigation, Camera, Lock } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { getPlayerReservations, type MyReservation } from "../lib/playerReservations";
import { sortBookingsByProximity, filterVisibleRequests } from "../lib/reservationActivity";
import { useDismissedReservationIds } from "../lib/dismissedReservations";
import { usePlayerReservationsRealtime } from "../lib/playerReservationsRealtime";
import { getClubPublicPageData, type Court, type ClubNewsCard } from "../../../shared/clubs/publicPageData";
import type { ScheduleGroup } from "../lib/operatingHours";
import { SITE_URL } from "../lib/reservationShare";
import { getTournamentsForClub, partitionPlayerTournaments } from "../lib/tournaments";
import { ActivityCard } from "../components/ActivityCard";
import { CompactCarouselCard } from "../components/CompactCarouselCard";
import { ImagePreviewModal } from "../components/tournaments/ImagePreviewModal";
import { Skeleton } from "../components/Skeleton";
import { theme } from "../lib/theme";
import type { Tournament } from "../types/domain";

type ClubDetails = {
  description: string | null;
  cover_image_url: string | null;
  visibility: string;
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

// Mismo asset real que usa ClubHero.tsx (app web) cuando el club no tiene
// portada propia — nunca una imagen nueva generada para mobile, solo la
// misma URL pública ya servida por WEB.
const DEFAULT_COVER_URL = `${SITE_URL}/img/portada-default.png`;

function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

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
// El mapa de Ubicación usa react-native-maps (ver package.json — instalado
// vía `npx expo install`, incluido en Expo Go sin configuración adicional,
// ver reporte) con la misma lat/lng real ya leída de `clubs`, nunca
// mockeada. "Ver noticia" navega a NewsDetailScreen dentro de
// ClubHomeStack, pasando la noticia ya cargada aquí (nunca una query
// nueva). Una sola pieza de la web NO se replica en esta pasada (decisión
// explícita, ver reporte): el lightbox de Galería (aquí es solo una tira
// horizontal de fotos, sin abrir a pantalla completa).
//
// Noticias/Torneos activos/Torneos finalizados son carruseles horizontales
// (FlatList, nunca ScrollView ni una lista vertical) para que la pantalla
// no crezca sin fin — ver CAROUSEL_GAP/carouselCardWidth. Torneos
// reutiliza getTournamentsForClub (mismo loader que TournamentsScreen) y
// partitionPlayerTournaments (shared/tournaments/actions.ts) para el
// bucketing activos/finalizados — nunca una tercera lógica temporal
// distinta de effectivePlayerTournamentStatus/hasTournamentStarted.
const CAROUSEL_GAP = 12;
const CAROUSEL_SIDE_INSET = 16;

export function ClubHomeScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { session } = useAuth();
  const { club, identity } = useClub();
  const viewerId = session?.user?.id ?? "";
  // ~44% del ancho de pantalla por card — dentro del 42–46% pedido, caben
  // ~2 cards por pantalla y se asoma la siguiente sin necesitar flechas.
  const { width: windowWidth } = useWindowDimensions();
  const carouselCardWidth = Math.round(windowWidth * 0.44);

  const [details, setDetails] = useState<ClubDetails | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [schedule, setSchedule] = useState<ScheduleGroup[]>([]);
  const [news, setNews] = useState<ClubNewsCard[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [myReservations, setMyReservations] = useState<MyReservation[]>([]);
  const [myBookings, setMyBookings] = useState<MyReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { dismissedIds, dismiss } = useDismissedReservationIds(club?.id ?? "");

  const load = useCallback(async () => {
    if (!club || !viewerId) return;
    const [clubRes, publicData, reservationsData, tournamentsData] = await Promise.all([
      supabase
        .from("clubs")
        .select(
          "description, cover_image_url, visibility, address, city, state, country, whatsapp, instagram, facebook, youtube, latitude, longitude, gallery_image_urls"
        )
        .eq("id", club.id)
        .single(),
      getClubPublicPageData(supabase, club.id),
      getPlayerReservations(supabase, club.id, viewerId, todayStr()),
      getTournamentsForClub(supabase, club.id),
    ]);
    setDetails((clubRes.data as ClubDetails | null) ?? null);
    setCourts(publicData.courts);
    setSchedule(publicData.schedule);
    setNews(publicData.news);
    setTournaments(tournamentsData.tournaments);
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
  const { active: activeTournaments, finished: finishedTournaments } = partitionPlayerTournaments(tournaments);

  const heroLoc = [details?.city, details?.state].filter(Boolean).join(", ");
  const isPrivate = details?.visibility === "private";
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
        {/* Hero — equivalente nativo de ClubHero.tsx (app web, variant="card",
            showSocial={false}, igual que /[club]/home). Portada real (o el
            mismo asset por defecto que usa WEB), logo superpuesto, nombre,
            ciudad/estado, indicador público/privado y descripción — mismo
            contenido y jerarquía, adaptado a una sola columna. */}
        <View style={styles.hero}>
          <View style={styles.heroCoverWrap}>
            <Image source={{ uri: details?.cover_image_url?.trim() || DEFAULT_COVER_URL }} style={styles.heroCover} />
            <View style={styles.heroCoverOverlay} />
          </View>
          <View style={styles.heroBody}>
            <View style={styles.heroLogoWrap}>
              {club.logo_url ? (
                <Image source={{ uri: club.logo_url }} style={styles.heroLogoImage} />
              ) : (
                <Text style={styles.heroLogoInitials}>{getInitials(club.name)}</Text>
              )}
            </View>
            <Text style={styles.heroName}>{club.name}</Text>
            {heroLoc && (
              <View style={styles.heroLocRow}>
                <MapPin width={13} height={13} color={theme.colors.muted} />
                <Text style={styles.heroLocText}>{heroLoc}</Text>
              </View>
            )}
            <View style={styles.heroVisibilityRow}>
              {isPrivate ? (
                <>
                  <Lock width={12} height={12} color={theme.colors.warning} />
                  <Text style={[styles.heroVisibilityText, { color: theme.colors.warning }]}>
                    Club privado · Requiere aprobación
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.heroVisibilityDot} />
                  <Text style={[styles.heroVisibilityText, { color: theme.colors.success }]}>
                    Club público · Cualquier jugador puede unirse
                  </Text>
                </>
              )}
            </View>
            {details?.description && (
              <Text style={styles.heroDescription} numberOfLines={3}>
                {details.description}
              </Text>
            )}
          </View>
        </View>

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

        {/* Noticias recientes — carrusel horizontal compacto (FlatList,
            nunca ScrollView): ~44% de ancho por card (caben ~2 por
            pantalla, se asoma la tercera), solo imagen + título — fecha/
            extracto siguen disponibles en el detalle real (NewsDetail),
            nunca eliminados, solo fuera de esta card. Sin recortar el
            arreglo `news`. */}
        {news.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Noticias recientes</Text>
            <FlatList
              horizontal
              style={styles.carousel}
              data={news}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              snapToInterval={carouselCardWidth + CAROUSEL_GAP}
              snapToAlignment="start"
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: CAROUSEL_SIDE_INSET, gap: CAROUSEL_GAP }}
              renderItem={({ item }) => (
                <CompactCarouselCard
                  imageUrl={item.image_url}
                  title={item.title}
                  width={carouselCardWidth}
                  onPress={() => navigation.navigate("NewsDetail", { news: item })}
                />
              )}
            />
          </View>
        )}

        {/* Galería — mismos thumbnails/datos/tira horizontal de siempre;
            único cambio: cada thumbnail ahora es tocable y abre
            ImagePreviewModal (mismo componente que ya usa la portada de
            torneo en TournamentDetailScreen — nunca un segundo lightbox),
            resizeMode="contain" así que la foto nunca se deforma. Cerrar
            (X, tocar el fondo, o back nativo vía onRequestClose) no toca
            el scroll de esta pantalla — se vuelve exactamente a la misma
            posición. */}
        {gallery.length > 0 && (
          <View style={styles.card}>
            <View style={styles.infoHeaderRow}>
              <Camera width={14} height={14} color={theme.colors.muted} />
              <Text style={styles.cardTitle}>Galería</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {gallery.map((url) => (
                <TouchableOpacity key={url} activeOpacity={0.85} onPress={() => setPreviewImage(url)}>
                  <Image source={{ uri: url }} style={styles.galleryImage} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Torneos activos / finalizados — mismo bucketing de siempre
            (partitionPlayerTournaments, shared/tournaments/actions.ts) —
            nunca una segunda regla de qué es "activo"/"finalizado". Las
            cards ahora son compactas (mismo CompactCarouselCard que
            Noticias): categoría/estado/duplas/fecha siguen disponibles en
            TournamentDetail, al que el tap sigue navegando sin cambios. */}
        {activeTournaments.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Torneos activos</Text>
            <FlatList
              horizontal
              style={styles.carousel}
              data={activeTournaments}
              keyExtractor={(t) => t.id}
              showsHorizontalScrollIndicator={false}
              snapToInterval={carouselCardWidth + CAROUSEL_GAP}
              snapToAlignment="start"
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: CAROUSEL_SIDE_INSET, gap: CAROUSEL_GAP }}
              renderItem={({ item }) => (
                <CompactCarouselCard
                  imageUrl={item.cover_image_url}
                  title={item.name}
                  width={carouselCardWidth}
                  onPress={() => navigation.navigate("TournamentsTab", { screen: "TournamentDetail", params: { tournamentId: item.id } })}
                />
              )}
            />
          </View>
        )}

        {finishedTournaments.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Torneos finalizados</Text>
            <FlatList
              horizontal
              style={styles.carousel}
              data={finishedTournaments}
              keyExtractor={(t) => t.id}
              showsHorizontalScrollIndicator={false}
              snapToInterval={carouselCardWidth + CAROUSEL_GAP}
              snapToAlignment="start"
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: CAROUSEL_SIDE_INSET, gap: CAROUSEL_GAP }}
              renderItem={({ item }) => (
                <CompactCarouselCard
                  imageUrl={item.cover_image_url}
                  title={item.name}
                  width={carouselCardWidth}
                  onPress={() => navigation.navigate("TournamentsTab", { screen: "TournamentDetail", params: { tournamentId: item.id } })}
                />
              )}
            />
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
            {hasCoords && (
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: details!.latitude!,
                  longitude: details!.longitude!,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                pitchEnabled={false}
                rotateEnabled={false}
              >
                <Marker coordinate={{ latitude: details!.latitude!, longitude: details!.longitude! }} />
              </MapView>
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
      </ScrollView>

      {previewImage && <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  // Cancela el padding horizontal de `content` (16) para que el carrusel
  // pueda desplazarse hasta el borde real de pantalla — mismo patrón que
  // "-mx-4 px-4" en la versión WEB mobile (page.tsx), CAROUSEL_SIDE_INSET
  // (16, en contentContainerStyle de cada FlatList) vuelve a insertar ese
  // mismo margen visual para la primera/última card.
  carousel: { marginHorizontal: -16 },
  hero: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    overflow: "hidden",
  },
  heroCoverWrap: { width: "100%", height: 140 },
  heroCover: { width: "100%", height: "100%", backgroundColor: theme.colors.surfaceAlt },
  heroCoverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  heroBody: { paddingHorizontal: 16, paddingBottom: 16 },
  heroLogoWrap: {
    width: 76,
    height: 76,
    borderRadius: theme.radius.lg,
    marginTop: -38,
    marginBottom: 10,
    backgroundColor: `${theme.colors.primary}25`,
    borderWidth: 4,
    borderColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  heroLogoImage: { width: "100%", height: "100%" },
  heroLogoInitials: { color: theme.colors.primary, fontSize: 22, fontWeight: "800" },
  heroName: { color: theme.colors.white, fontSize: 22, fontWeight: "800" },
  heroLocRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  heroLocText: { color: theme.colors.muted, fontSize: 13 },
  heroVisibilityRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  heroVisibilityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.success },
  heroVisibilityText: { fontSize: 12, fontWeight: "600" },
  heroDescription: { color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 18, marginTop: 10 },
  map: { width: "100%", height: 180, borderRadius: theme.radius.md, overflow: "hidden" },
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
