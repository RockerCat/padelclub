import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MapView, { Marker } from "react-native-maps";
import { ChevronLeft, Clock, ExternalLink, LayoutGrid, Lock, MapPin, MessageCircle, Navigation, Users } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { getMyClubMemberships, getPendingJoinRequestClubIds, requestClubAccess, updateLastClub } from "../lib/clubSwitcher";
import { updateOwnPhone } from "../lib/profileMutations";
import { getClubPublicPageData, type Court } from "../../../shared/clubs/publicPageData";
import type { ScheduleGroup } from "../lib/operatingHours";
import { WhatsAppRequiredModal } from "../components/WhatsAppRequiredModal";
import { Skeleton } from "../components/Skeleton";
import { Toast } from "../components/Toast";
import { theme } from "../lib/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type ClubDetails = {
  description: string | null;
  cover_image_url: string | null;
  address: string | null;
  country: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  gallery_image_urls: string[] | null;
};

type Relation = { kind: "member"; role: string } | { kind: "pending" } | { kind: "none" };

function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Equivalente nativo de la página pública del club (app web:
// src/app/(public)/[club]/page.tsx + ClubPublicView.tsx + RequestAccessButton.tsx)
// — paridad FUNCIONAL, no pixel-perfect (ver CLAUDE.md). Alcanzada desde
// ChangeClubScreen al tocar cualquier fila que no sea "mi club actual": esta
// pantalla es la única que ejecuta join/request, nunca ChangeClubScreen
// (ver ese archivo — su handleRowPress ahora solo navega aquí).
//
// Datos: ChangeClubScreen ya pasa por params el ClubDirectoryEntry completo
// (id/name/slug/visibility/description/logo_url/whatsapp/city/state/lat/lng)
// — la única query nueva de esta pantalla es la que ya usa ClubHomeScreen.tsx
// para los campos que la vista pública SÍ necesita y el directorio no trae
// (cover_image_url/instagram/facebook/youtube/gallery_image_urls/address/
// country), más getClubPublicPageData (shared/clubs/publicPageData.ts —
// misma fuente que WEB y que ClubHomeScreen) para canchas/horario/jugadores.
// Nunca se inventa un dato ni se agrega una tabla/columna nueva.
//
// El estado de relación (member/pending/none) llega por params como valor
// INICIAL únicamente (lo que ChangeClubScreen ya sabía en el momento del
// tap, para pintar el CTA sin parpadeo) — nunca como fuente de verdad
// definitiva. `load()` lo revalida de inmediato contra el backend
// (getMyClubMemberships/getPendingJoinRequestClubIds, las mismas funciones
// que ya usa ChangeClubScreen, sin duplicar esa consulta) y useFocusEffect
// la vuelve a correr cada vez que esta pantalla recupera foco — así, si el
// acceso cambió mientras tanto (aprobado desde Web, o vía la push de
// aprobación que primero actualiza ClubContext y luego puede devolver al
// usuario aquí), el CTA nunca se queda mostrando "Solicitar acceso" ni
// "Solicitud pendiente" para un club al que el usuario ya tiene acceso
// real — Supabase es siempre la fuente de verdad, el param solo evita el
// parpadeo inicial mientras la revalidación está en curso.
export function PublicClubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "PublicClub">>();
  const { entry, relationKind, relationRole } = route.params;
  const { session } = useAuth();
  const { reload: reloadClub } = useClub();
  const userId = session?.user.id ?? null;

  const [details, setDetails] = useState<ClubDetails | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [schedule, setSchedule] = useState<ScheduleGroup[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [relation, setRelation] = useState<Relation>(
    relationKind === "member" ? { kind: "member", role: relationRole ?? "" } : { kind: relationKind }
  );
  const [acting, setActing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [phoneModal, setPhoneModal] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [clubRes, publicData, membershipRows, pendingRows] = await Promise.all([
      supabase
        .from("clubs")
        .select("description, cover_image_url, address, country, instagram, facebook, youtube, gallery_image_urls")
        .eq("id", entry.id)
        .single(),
      getClubPublicPageData(supabase, entry.id),
      userId ? getMyClubMemberships(supabase, userId) : Promise.resolve([]),
      userId ? getPendingJoinRequestClubIds(supabase, userId) : Promise.resolve([]),
    ]);
    setDetails((clubRes.data as ClubDetails | null) ?? null);
    setCourts(publicData.courts);
    setSchedule(publicData.schedule);
    setPlayerCount(publicData.playerCount);

    // Fuente de verdad real, nunca el param de navegación — ver comentario
    // arriba del componente.
    const membership = membershipRows.find((m) => m.club.id === entry.id);
    const pendingFound = pendingRows.includes(entry.id);
    const nextRelation: Relation = membership
      ? { kind: "member", role: membership.role }
      : pendingFound
        ? { kind: "pending" }
        : { kind: "none" };
    setRelation(nextRelation);
  }, [entry.id, userId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Vuelve a revalidar membership/solicitud al recuperar foco — mismo
  // patrón que PlayerDashboardScreen.tsx/TournamentDetailScreen.tsx
  // (refresco silencioso, sin tocar `loading`/skeletons). Cubre el caso en
  // que el usuario llega/vuelve a esta pantalla después de que su acceso
  // cambió en otra parte mientras esta instancia seguía montada (p. ej.
  // volvió de background tras aprobar desde Web, sin que esta pantalla se
  // haya desmontado).
  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  async function enterClub() {
    if (!userId || acting) return;
    setActing(true);
    try {
      await updateLastClub(supabase, userId, entry.id);
    } catch {
      // Best-effort, igual que ChangeClubScreen.
    }
    await reloadClub();
    setActing(false);
    navigation.popToTop();
  }

  async function handleJoin() {
    if (!userId || acting) return;
    setActing(true);
    try {
      const result = await requestClubAccess(supabase, entry.id);
      if (result.kind === "missing_phone") {
        setPhoneValue("");
        setPhoneError(null);
        setPhoneModal(true);
        return;
      }
      if (result.kind === "error") {
        setToastMessage(result.message);
        return;
      }
      if (result.kind === "requested") {
        setRelation({ kind: "pending" });
        setToastMessage("Solicitud enviada");
        return;
      }
      // "joined" — join_public_club ya creó la membresía activa.
      await updateLastClub(supabase, userId, entry.id);
      await reloadClub();
      navigation.popToTop();
    } finally {
      setActing(false);
    }
  }

  async function handleSavePhoneAndRetry() {
    if (!userId) return;
    setPhoneSaving(true);
    setPhoneError(null);
    const result = await updateOwnPhone(supabase, userId, phoneValue);
    setPhoneSaving(false);
    if (!result.success) {
      setPhoneError(result.error);
      return;
    }
    setPhoneModal(false);
    handleJoin();
  }

  const isPublic = entry.visibility === "public";
  const locFull = [entry.city, entry.state].filter(Boolean).join(", ");
  const fullLocFull = [entry.city, entry.state, details?.country].filter(Boolean).join(", ");
  const hasCoords = entry.latitude != null && entry.longitude != null;
  const hasContact = !!(entry.whatsapp || details?.instagram || details?.facebook || details?.youtube);
  const gallery = details?.gallery_image_urls ?? [];
  const mainSchedule = schedule[0]?.timeRange ?? null;
  const directionsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${entry.latitude},${entry.longitude}`
    : fullLocFull || details?.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([details?.address, fullLocFull].filter(Boolean).join(", "))}`
      : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroCoverWrap}>
            {details?.cover_image_url ? (
              <Image source={{ uri: details.cover_image_url }} style={styles.heroCover} />
            ) : (
              <View style={[styles.heroCover, styles.heroCoverPlaceholder]} />
            )}
            <View style={styles.heroCoverOverlay} />
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10}>
              <ChevronLeft width={20} height={20} color={theme.colors.white} />
            </TouchableOpacity>
          </View>
          <View style={styles.heroBody}>
            <View style={styles.heroLogoWrap}>
              {entry.logo_url ? (
                <Image source={{ uri: entry.logo_url }} style={styles.heroLogoImage} />
              ) : (
                <Text style={styles.heroLogoInitials}>{getInitials(entry.name)}</Text>
              )}
            </View>
            <Text style={styles.heroName}>{entry.name}</Text>
            {locFull && (
              <View style={styles.heroLocRow}>
                <MapPin width={13} height={13} color={theme.colors.muted} />
                <Text style={styles.heroLocText}>{locFull}</Text>
              </View>
            )}
            <View style={styles.heroVisibilityRow}>
              {isPublic ? (
                <>
                  <View style={styles.heroVisibilityDot} />
                  <Text style={[styles.heroVisibilityText, { color: theme.colors.success }]}>
                    Club público · Cualquier jugador puede unirse
                  </Text>
                </>
              ) : (
                <>
                  <Lock width={12} height={12} color={theme.colors.warning} />
                  <Text style={[styles.heroVisibilityText, { color: theme.colors.warning }]}>
                    Club privado · Requiere aprobación
                  </Text>
                </>
              )}
            </View>
            {entry.description && <Text style={styles.heroDescription}>{entry.description}</Text>}

            <View style={styles.ctaWrap}>
              {relation.kind === "member" ? (
                <TouchableOpacity style={styles.ctaPrimary} onPress={enterClub} disabled={acting} activeOpacity={0.85}>
                  {acting ? <ActivityIndicator color={theme.colors.bg} size="small" /> : <Text style={styles.ctaPrimaryText}>Entrar al club →</Text>}
                </TouchableOpacity>
              ) : relation.kind === "pending" ? (
                <View style={[styles.ctaPrimary, styles.ctaDisabled]}>
                  <Text style={styles.ctaDisabledText}>Solicitud pendiente</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.ctaPrimary} onPress={handleJoin} disabled={acting} activeOpacity={0.85}>
                  {acting ? (
                    <ActivityIndicator color={theme.colors.bg} size="small" />
                  ) : (
                    <Text style={styles.ctaPrimaryText}>{isPublic ? "Unirme" : "Solicitar ingreso"}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {loading ? (
          <View style={{ gap: 12 }}>
            <Skeleton style={{ height: 60, borderRadius: 16 }} />
            <Skeleton style={{ height: 120, borderRadius: 16 }} />
          </View>
        ) : (
          <>
            {/* Métricas públicas */}
            {(courts.length > 0 || playerCount > 0 || mainSchedule || entry.city) && (
              <View style={styles.statsRow}>
                {courts.length > 0 && (
                  <View style={styles.statBox}>
                    <LayoutGrid width={16} height={16} color={theme.colors.primary} />
                    <Text style={styles.statValue}>{courts.length}</Text>
                    <Text style={styles.statLabel}>{courts.length === 1 ? "Cancha activa" : "Canchas activas"}</Text>
                  </View>
                )}
                {playerCount > 0 && (
                  <View style={styles.statBox}>
                    <Users width={16} height={16} color={theme.colors.primary} />
                    <Text style={styles.statValue}>{playerCount}</Text>
                    <Text style={styles.statLabel}>{playerCount === 1 ? "Jugador" : "Jugadores"}</Text>
                  </View>
                )}
                {mainSchedule && (
                  <View style={styles.statBox}>
                    <Clock width={16} height={16} color={theme.colors.primary} />
                    <Text style={styles.statValue} numberOfLines={1}>{mainSchedule}</Text>
                    <Text style={styles.statLabel}>Horario principal</Text>
                  </View>
                )}
                {entry.city && (
                  <View style={styles.statBox}>
                    <MapPin width={16} height={16} color={theme.colors.primary} />
                    <Text style={styles.statValue} numberOfLines={1}>{entry.city}</Text>
                    <Text style={styles.statLabel}>Ubicación</Text>
                  </View>
                )}
              </View>
            )}

            {/* Galería */}
            {gallery.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Galería</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {gallery.map((url) => (
                    <Image key={url} source={{ uri: url }} style={styles.galleryImage} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Ubicación */}
            {(details?.address || fullLocFull || hasCoords) && (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <MapPin width={14} height={14} color={theme.colors.muted} />
                  <Text style={styles.cardTitle}>Ubicación</Text>
                </View>
                {(details?.address || fullLocFull) && (
                  <Text style={styles.bodyText}>{[details?.address, fullLocFull].filter(Boolean).join(" · ")}</Text>
                )}
                {hasCoords && (
                  <MapView
                    style={styles.map}
                    initialRegion={{
                      latitude: entry.latitude as number,
                      longitude: entry.longitude as number,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }}
                    pitchEnabled={false}
                    rotateEnabled={false}
                  >
                    <Marker coordinate={{ latitude: entry.latitude as number, longitude: entry.longitude as number }} />
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

            {/* Horarios */}
            {schedule.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Clock width={14} height={14} color={theme.colors.muted} />
                  <Text style={styles.cardTitle}>Horarios</Text>
                </View>
                {schedule.map(({ label, timeRange }) => (
                  <View key={label} style={styles.scheduleRow}>
                    <Text style={styles.bodyText}>{label}</Text>
                    <Text style={styles.scheduleTime}>{timeRange}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Contacto / redes sociales */}
            {hasContact && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Contacto</Text>
                {entry.whatsapp && (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => Linking.openURL(`https://wa.me/${entry.whatsapp!.replace(/[^\d+]/g, "")}`)}
                  >
                    <MessageCircle width={16} height={16} color={theme.colors.muted} />
                    <View>
                      <Text style={styles.contactLabel}>WhatsApp</Text>
                      <Text style={styles.contactValue}>{entry.whatsapp}</Text>
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
          </>
        )}
      </ScrollView>

      <WhatsAppRequiredModal
        visible={phoneModal}
        value={phoneValue}
        onChangeValue={setPhoneValue}
        saving={phoneSaving}
        error={phoneError}
        onCancel={() => setPhoneModal(false)}
        onSave={handleSavePhoneAndRetry}
      />

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { paddingBottom: 32, gap: 16 },
  hero: { backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  heroCoverWrap: { width: "100%", height: 160 },
  heroCover: { width: "100%", height: "100%", backgroundColor: theme.colors.surfaceAlt },
  heroCoverPlaceholder: { backgroundColor: theme.colors.surfaceAlt },
  heroCoverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  backButton: {
    position: "absolute",
    top: 8,
    left: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBody: { paddingHorizontal: 16, paddingBottom: 20 },
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
  ctaWrap: { marginTop: 16 },
  ctaPrimary: {
    height: 46,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  ctaPrimaryText: { color: theme.colors.bg, fontSize: 14, fontWeight: "700" },
  ctaDisabled: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  ctaDisabledText: { color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: "700" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  statBox: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 12,
    gap: 2,
  },
  statValue: { color: theme.colors.white, fontSize: 16, fontWeight: "800" },
  statLabel: { color: theme.colors.muted, fontSize: 11 },
  card: {
    marginHorizontal: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    padding: 16,
    gap: 10,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { color: theme.colors.white, fontSize: 14, fontWeight: "700" },
  bodyText: { color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 18 },
  map: { width: "100%", height: 180, borderRadius: theme.radius.md, overflow: "hidden" },
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
