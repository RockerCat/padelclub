import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MapView, { Callout, Marker } from "react-native-maps";
import { Check, ChevronDown, ChevronRight, Lock, Search, X } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import {
  getMyClubMemberships,
  getClubDirectory,
  getPendingJoinRequestClubIds,
  updateLastClub,
  type MyClubMembership,
  type ClubDirectoryEntry,
} from "../lib/clubSwitcher";
import { clubRoleLabel } from "../lib/roleLabels";
import { Skeleton } from "../components/Skeleton";
import { Toast } from "../components/Toast";
import { theme } from "../lib/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Idéntico a normalizeCityKey en ExploreSection.tsx (app web) — colapsa
// mayúsculas/espacios para que "Bogotá"/" bogotá "/"Bogotá  " cuenten como
// la misma opción; la etiqueta visible conserva el primer casing visto.
function normalizeCityKey(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

type VisibilityFilter = "all" | "public" | "private";
type RelationFilter = "all" | "mine" | "not_joined";
const ALL_CITIES = "all";

const VISIBILITY_OPTIONS: { value: VisibilityFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "public", label: "Públicos" },
  { value: "private", label: "Privados" },
];
const RELATION_OPTIONS: { value: RelationFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "mine", label: "Mis clubes" },
  { value: "not_joined", label: "No inscrito" },
];

// Centro/zoom de respaldo cuando ningún club visible tiene coordenadas —
// idéntico DEFAULT_CENTER de ClubsMap.tsx (app web, Colombia completa). Una
// vez hay al menos un club con coordenadas, fitToCoordinates (ver abajo)
// reemplaza esto de inmediato.
const DEFAULT_REGION = { latitude: 4.5709, longitude: -74.2973, latitudeDelta: 8, longitudeDelta: 8 };

type Relation = { kind: "member"; role: string } | { kind: "pending" } | { kind: "none" };

// Equivalente RN de FilterDropdown.tsx (app web) — mismo mecanismo ya usado
// por PlayersScreen.tsx (FilterMenu): la web ancla un popover al botón, RN
// lo resuelve con un modal simple con las mismas opciones y el mismo check
// en la seleccionada.
function FilterMenu({
  visible,
  onClose,
  options,
  value,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  options: { value: string; label: string }[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.menuCard}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={styles.menuItem}
              onPress={() => {
                onSelect(opt.value);
                onClose();
              }}
            >
              <Text style={styles.menuItemText}>{opt.label}</Text>
              {opt.value === value && <Check width={14} height={14} color={theme.colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// Equivalente RN de "Cambiar de club" (WEB): para PLAYER/ADMIN esto es un
// Link plano a /clubs (nunca el modal de switch-en-línea de OWNER, que es
// otro flujo — ver AppNav.tsx → ChangeClubModal, OWNER-only, fuera de
// alcance de esta pantalla); /clubs muestra "Mis clubes" (toda membresía
// activa, sin filtrar archivadas — ver CLAUDE.md → Club Archival
// Principles: el acceso de solo lectura a un club archivado se preserva) +
// "Explorar clubes" (buscador + filtros ciudad/visibilidad/relación + mapa +
// listado, ver ExploreSection.tsx). Mismas queries/RPCs que WEB, vía
// shared/clubs/clubSwitcher.ts — nunca una segunda regla de join/membership.
//
// Mapa: react-native-maps (ya instalado y en uso en ClubHomeScreen.tsx para
// la ubicación del propio club — ver CLAUDE.md, confirmado compatible con
// Expo Go, sin plugin/config nuevo). WEB usa Leaflet (solo-browser, no
// portable) y centra el mapa únicamente en el primer club visible
// (`focusClub`, nunca un bounds-fit); aquí se usa `fitToCoordinates` sobre
// TODOS los marcadores visibles en cada cambio de filtro/búsqueda — un
// ajuste deliberado, más útil en un mapa nativo con pan/zoom reales, sin
// inventar ni una sola coordenada (mismas `clubs.latitude/longitude` que
// WEB lee). Clubes sin coordenadas nunca reciben marcador pero siguen en el
// listado, igual que WEB.
//
// No incluye auto-scroll de la lista al tocar un marker: FlatList.
// scrollToIndex requiere getItemLayout con alturas fijas para ser seguro
// (las filas del directorio tienen alto variable por la línea de
// ubicación) — sin eso puede lanzar un invariant-violation real sobre
// elementos aún no medidos. En su lugar, tocar un marker resalta esa fila
// (mismo `selectedId` que colorea el pin) y su Callout dispara el mismo
// `handleRowPress` que la fila de lista — misma entidad, mismo flujo,
// nunca un segundo detalle paralelo.
export function ChangeClubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session, signOut } = useAuth();
  const { club: currentClub, reload: reloadClub } = useClub();
  const userId = session?.user.id ?? null;
  const { height: windowHeight } = useWindowDimensions();

  const [memberships, setMemberships] = useState<MyClubMembership[] | null>(null);
  const [directory, setDirectory] = useState<ClubDirectoryEntry[] | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [cityFilter, setCityFilter] = useState<string>(ALL_CITIES);
  const [relationFilter, setRelationFilter] = useState<RelationFilter>("all");
  const [visibilityMenuOpen, setVisibilityMenuOpen] = useState(false);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [relationMenuOpen, setRelationMenuOpen] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<MapView | null>(null);

  const [switchingClubId, setSwitchingClubId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);
    try {
      const [membershipRows, directoryRows, pendingRows] = await Promise.all([
        getMyClubMemberships(supabase, userId),
        getClubDirectory(supabase),
        getPendingJoinRequestClubIds(supabase, userId),
      ]);
      setMemberships(membershipRows);
      setDirectory(directoryRows);
      setPendingIds(new Set(pendingRows));
    } catch {
      setLoadError("No se pudieron cargar tus clubes. Intenta de nuevo.");
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Revalida membresías/solicitudes pendientes cada vez que esta pantalla
  // recupera foco — mismo patrón que PlayerDashboardScreen.tsx/
  // TournamentDetailScreen.tsx (recargar al recuperar foco, sin tocar
  // `loading`, refresco silencioso). Sin esto, esta pantalla podía quedarse
  // mostrando "Pendiente" (o memberships desactualizadas) indefinidamente
  // tras una aprobación/rechazo real ocurrido en otra parte (Web, otra
  // sesión, o esta misma sesión llegando aquí de vuelta tras la
  // notificación push de aprobación) hasta que el usuario cerrara y
  // reabriera la pantalla — el backend/Supabase es la fuente de verdad,
  // nunca el snapshot cargado en el primer montaje.
  useFocusEffect(
    useCallback(() => {
      load();
      // ClubContext (club/role "actual") es un snapshot aparte del
      // load() de arriba — revalidarlo también aquí cubre cualquier
      // entrada a esta pantalla (push, menú, back) sin depender de que
      // el punto de entrada específico ya lo haya hecho (ver
      // PushNotificationNavigator.tsx/NotificationsScreen.tsx para el
      // caso de push de club desactivado, que ahora también lo hace).
      reloadClub();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of memberships ?? []) map.set(m.club.id, m.role);
    return map;
  }, [memberships]);

  const relationOf = useCallback(
    (clubId: string): Relation => {
      const role = memberMap.get(clubId);
      if (role) return { kind: "member", role };
      if (pendingIds.has(clubId)) return { kind: "pending" };
      return { kind: "none" };
    },
    [memberMap, pendingIds]
  );

  // Construido desde TODO el directorio (nunca el subconjunto ya filtrado),
  // igual que cityOptions en ExploreSection.tsx — elegir una ciudad nunca
  // reduce el propio desplegable.
  const cityOptions = useMemo(() => {
    const labelByKey = new Map<string, string>();
    for (const c of directory ?? []) {
      const raw = c.city?.trim();
      if (!raw) continue;
      const key = normalizeCityKey(raw);
      if (!labelByKey.has(key)) labelByKey.set(key, raw.replace(/\s+/g, " "));
    }
    const entries = Array.from(labelByKey.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
    return [{ value: ALL_CITIES, label: "Todas las ciudades" }, ...entries.map(([value, label]) => ({ value, label }))];
  }, [directory]);

  const q = query.trim().toLowerCase();
  const filteredDirectory = useMemo(() => {
    return (directory ?? []).filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (cityFilter !== ALL_CITIES && normalizeCityKey(c.city ?? "") !== cityFilter) return false;
      if (visibilityFilter !== "all" && c.visibility !== visibilityFilter) return false;
      if (relationFilter !== "all") {
        const isMine = relationOf(c.id).kind === "member";
        if (relationFilter === "mine" && !isMine) return false;
        if (relationFilter === "not_joined" && isMine) return false;
      }
      return true;
    });
  }, [directory, q, cityFilter, visibilityFilter, relationFilter, relationOf]);

  // Solo los clubes filtrados que además tienen coordenadas reales —
  // clubes sin lat/lng se quedan en `filteredDirectory` (listado) pero
  // nunca reciben marcador, nunca una coordenada inventada.
  const clubsWithCoords = useMemo(
    () =>
      filteredDirectory.filter(
        (c): c is ClubDirectoryEntry & { latitude: number; longitude: number } => c.latitude != null && c.longitude != null
      ),
    [filteredDirectory]
  );

  // Reencuadra el mapa sobre todos los marcadores visibles cada vez que
  // cambia la búsqueda/filtros — búsqueda, filtros, mapa y listado nunca
  // divergen: los tres leen exactamente `filteredDirectory`/`clubsWithCoords`.
  useEffect(() => {
    if (!mapRef.current || clubsWithCoords.length === 0) return;
    mapRef.current.fitToCoordinates(
      clubsWithCoords.map((c) => ({ latitude: c.latitude, longitude: c.longitude })),
      { edgePadding: { top: 48, right: 48, bottom: 48, left: 48 }, animated: true }
    );
  }, [clubsWithCoords]);

  async function switchToClub(clubId: string) {
    if (!userId || switchingClubId) return;
    setSwitchingClubId(clubId);
    try {
      await updateLastClub(supabase, userId, clubId);
    } catch {
      // Best-effort, igual que WEB — un fallo aquí nunca bloquea seguir.
    }
    await reloadClub();
    setSwitchingClubId(null);
    navigation.goBack();
  }

  // Mismo handler para una fila de "Explorar clubes" y para el Callout de
  // su marker — nunca dos implementaciones del mismo tap. Una membresía
  // propia sigue cambiando de club directo (switchToClub, sin pasos
  // intermedios); cualquier otro club (sin relación o con solicitud
  // pendiente) navega a su página pública — join/request y el modal de
  // WhatsApp viven ahí ahora, nunca aquí (ver PublicClubScreen.tsx).
  function handleRowPress(clubId: string) {
    const relation = relationOf(clubId);
    if (relation.kind === "member") {
      if (clubId === currentClub?.id) return;
      switchToClub(clubId);
      return;
    }
    const entry = (directory ?? []).find((c) => c.id === clubId);
    if (!entry) return;
    navigation.navigate("PublicClub", { entry, relationKind: relation.kind });
  }

  function handleMarkerPress(clubId: string) {
    setSelectedId(clubId);
  }

  const visibilityLabel = VISIBILITY_OPTIONS.find((o) => o.value === visibilityFilter)?.label ?? "Todos";
  const cityLabel = cityOptions.find((o) => o.value === cityFilter)?.label ?? "Todas las ciudades";
  const relationLabel = RELATION_OPTIONS.find((o) => o.value === relationFilter)?.label ?? "Todos";
  const mapHeight = Math.max(220, Math.round(windowHeight * 0.38));

  // Sin membresías confirmado (no mientras carga, no si hubo error — en
  // ambos casos todavía no sabemos si tiene alguna) → esta pantalla no
  // está "cambiando" nada, es la primera exploración del usuario. Mismo
  // criterio para el título y para ocultar "Mis clubes" vacía.
  const hasNoMemberships = !loading && !loadError && memberships !== null && memberships.length === 0;

  // Si hay historial real (se llegó desde AppHeader/una notificación con
  // club ya activo), X cierra normal. Si esta es la pantalla obligatoria
  // de un usuario recién autenticado sin ningún club (NoClubStack en
  // RootNavigator.tsx, sin ninguna screen debajo), goBack() no tendría
  // adónde volver — la salida razonable es cerrar sesión, reutilizando el
  // mismo signOut ya usado en HomeScreen.tsx/AppHeader.tsx, nunca una
  // navegación inventada hacia "App" sin club.
  function handleClose() {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    signOut();
  }

  const header = (
    <View>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{hasNoMemberships ? "Explorar clubes" : "Cambiar de club"}</Text>
        {!hasNoMemberships && (
          <TouchableOpacity onPress={handleClose} hitSlop={10} style={styles.closeButton}>
            <X width={20} height={20} color={theme.colors.white} />
          </TouchableOpacity>
        )}
      </View>

      {!hasNoMemberships && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mis clubes</Text>
        {loading ? (
          <View style={{ gap: 8 }}>
            <Skeleton style={{ height: 56, borderRadius: theme.radius.lg }} />
            <Skeleton style={{ height: 56, borderRadius: theme.radius.lg }} />
          </View>
        ) : loadError ? (
          <Text style={styles.errorText}>{loadError}</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {(memberships ?? []).map(({ role, club }) => {
              const isCurrent = club.id === currentClub?.id;
              const isSwitching = switchingClubId === club.id;
              const content = (
                <>
                  <View style={styles.logo}>
                    {club.logo_url ? (
                      <Image source={{ uri: club.logo_url }} style={styles.logoImg} />
                    ) : (
                      <Text style={styles.logoText}>{getInitials(club.name)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.rowTitleLine}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {club.name}
                      </Text>
                      {isCurrent && (
                        <View style={styles.currentBadge}>
                          <Check width={10} height={10} color={theme.colors.success} />
                          <Text style={styles.currentBadgeText}>Actual</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rowSubtitle}>{clubRoleLabel(role)}</Text>
                  </View>
                  {isSwitching ? (
                    <ActivityIndicator color={theme.colors.muted} size="small" />
                  ) : !isCurrent ? (
                    <ChevronRight width={16} height={16} color={theme.colors.muted} />
                  ) : null}
                </>
              );

              if (isCurrent) {
                return (
                  <View key={club.id} style={[styles.row, styles.rowCurrent]}>
                    {content}
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  key={club.id}
                  style={styles.row}
                  disabled={switchingClubId !== null}
                  onPress={() => switchToClub(club.id)}
                >
                  {content}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Explorar clubes</Text>
        <View style={styles.searchBar}>
          <Search width={16} height={16} color="rgba(148,163,184,0.6)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar club por nombre"
            placeholderTextColor={theme.colors.muted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.filtersRow}>
          <TouchableOpacity
            onPress={() => setCityMenuOpen(true)}
            style={[styles.filterPill, cityFilter !== ALL_CITIES && styles.filterPillActive]}
          >
            <Text style={[styles.filterPillText, cityFilter !== ALL_CITIES && styles.filterPillTextActive]} numberOfLines={1}>
              {cityLabel}
            </Text>
            <ChevronDown width={13} height={13} color={cityFilter !== ALL_CITIES ? theme.colors.primary : theme.colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setVisibilityMenuOpen(true)}
            style={[styles.filterPill, visibilityFilter !== "all" && styles.filterPillActive]}
          >
            <Text style={[styles.filterPillText, visibilityFilter !== "all" && styles.filterPillTextActive]}>{visibilityLabel}</Text>
            <ChevronDown width={13} height={13} color={visibilityFilter !== "all" ? theme.colors.primary : theme.colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setRelationMenuOpen(true)}
            style={[styles.filterPill, relationFilter !== "all" && styles.filterPillActive]}
          >
            <Text style={[styles.filterPillText, relationFilter !== "all" && styles.filterPillTextActive]}>{relationLabel}</Text>
            <ChevronDown width={13} height={13} color={relationFilter !== "all" ? theme.colors.primary : theme.colors.muted} />
          </TouchableOpacity>
        </View>

        {!loading && (
          <MapView
            ref={mapRef}
            style={{ height: mapHeight, borderRadius: theme.radius.lg, overflow: "hidden" }}
            initialRegion={DEFAULT_REGION}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            {clubsWithCoords.map((club) => {
              const relation = relationOf(club.id);
              const isCurrent = club.id === currentClub?.id;
              const pinColor = isCurrent ? theme.colors.success : club.id === selectedId ? theme.colors.primary : undefined;
              const calloutSubtitle =
                relation.kind === "member"
                  ? isCurrent
                    ? "Club actual"
                    : clubRoleLabel(relation.role)
                  : relation.kind === "pending"
                  ? "Solicitud pendiente"
                  : club.visibility === "public"
                  ? "Toca para unirte"
                  : "Toca para solicitar ingreso";
              return (
                <Marker
                  key={club.id}
                  coordinate={{ latitude: club.latitude, longitude: club.longitude }}
                  pinColor={pinColor}
                  onPress={() => handleMarkerPress(club.id)}
                >
                  <Callout onPress={() => handleRowPress(club.id)}>
                    <View style={styles.calloutBox}>
                      <Text style={styles.calloutTitle} numberOfLines={1}>
                        {club.name}
                      </Text>
                      <Text style={styles.calloutSubtitle}>{calloutSubtitle}</Text>
                    </View>
                  </Callout>
                </Marker>
              );
            })}
          </MapView>
        )}
      </View>

      <View style={[styles.section, { paddingBottom: 0 }]}>
        <Text style={styles.sectionTitle}>Resultados</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <FlatList
        data={loading ? [] : filteredDirectory}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.section}>
              <Text style={styles.emptyText}>
                {q ? `No se encontraron clubes con "${q}".` : "No se encontraron clubes con estos filtros."}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const relation = relationOf(item.id);
          const isSelected = selectedId === item.id;
          const location = [item.city, item.state].filter(Boolean).join(", ");
          return (
            <TouchableOpacity
              style={[styles.row, styles.directoryRow, isSelected && styles.rowSelected]}
              disabled={switchingClubId !== null}
              onPress={() => {
                setSelectedId(item.id);
                handleRowPress(item.id);
              }}
            >
              <View style={styles.logo}>
                {item.logo_url ? (
                  <Image source={{ uri: item.logo_url }} style={styles.logoImg} />
                ) : (
                  <Text style={styles.logoText}>{getInitials(item.name)}</Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.rowTitleLine}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {relation.kind === "member" && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>{clubRoleLabel(relation.role)}</Text>
                    </View>
                  )}
                  {relation.kind === "pending" && (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Pendiente</Text>
                    </View>
                  )}
                </View>
                <View style={styles.rowMetaLine}>
                  {!!location && (
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {location} ·{" "}
                    </Text>
                  )}
                  {item.visibility === "public" ? (
                    <Text style={styles.publicText}>Público</Text>
                  ) : (
                    <View style={styles.privateRow}>
                      <Lock width={10} height={10} color="rgba(251,191,36,0.7)" />
                      <Text style={styles.privateText}>Privado</Text>
                    </View>
                  )}
                </View>
              </View>
              <ChevronRight width={16} height={16} color={theme.colors.muted} />
            </TouchableOpacity>
          );
        }}
      />

      <FilterMenu visible={cityMenuOpen} onClose={() => setCityMenuOpen(false)} options={cityOptions} value={cityFilter} onSelect={setCityFilter} />
      <FilterMenu
        visible={visibilityMenuOpen}
        onClose={() => setVisibilityMenuOpen(false)}
        options={VISIBILITY_OPTIONS}
        value={visibilityFilter}
        onSelect={(v) => setVisibilityFilter(v as VisibilityFilter)}
      />
      <FilterMenu
        visible={relationMenuOpen}
        onClose={() => setRelationMenuOpen(false)}
        options={RELATION_OPTIONS}
        value={relationFilter}
        onSelect={(v) => setRelationFilter(v as RelationFilter)}
      />

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
  listContent: { paddingBottom: 32 },
  section: { padding: 16, paddingBottom: 4, gap: 10 },
  sectionTitle: { color: theme.colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  errorText: { color: theme.colors.danger, fontSize: 12 },
  emptyText: { color: "rgba(148,163,184,0.7)", fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowCurrent: { backgroundColor: "rgba(255,255,255,0.03)" },
  rowSelected: { borderColor: theme.colors.primary },
  directoryRow: { marginHorizontal: 16, marginBottom: 8 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${theme.colors.primary}22`,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImg: { width: 40, height: 40 },
  logoText: { color: theme.colors.primary, fontWeight: "700", fontSize: 13 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  rowTitle: { color: theme.colors.white, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  rowSubtitle: { color: theme.colors.muted, fontSize: 12, marginTop: 1 },
  rowMetaLine: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  currentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: "rgba(0,255,0,0.25)",
    backgroundColor: "rgba(0,255,0,0.1)",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  currentBadgeText: { color: theme.colors.success, fontSize: 10, fontWeight: "700" },
  pendingBadge: {
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.25)",
    backgroundColor: "rgba(251,191,36,0.1)",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  pendingBadgeText: { color: theme.colors.warning, fontSize: 10, fontWeight: "700" },
  publicText: { color: "#34d399", fontSize: 11, fontWeight: "600" },
  privateRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  privateText: { color: "rgba(251,191,36,0.8)", fontSize: 11, fontWeight: "600" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, color: theme.colors.white, fontSize: 14 },
  filtersRow: { flexDirection: "row", gap: 8 },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    maxWidth: 140,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  filterPillActive: { backgroundColor: `${theme.colors.primary}1A`, borderColor: `${theme.colors.primary}4D` },
  filterPillText: { fontSize: 12, fontWeight: "600", color: theme.colors.muted, flexShrink: 1 },
  filterPillTextActive: { color: theme.colors.primary },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  menuCard: {
    width: "100%",
    maxWidth: 320,
    maxHeight: "70%",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
  },
  menuItemText: { color: theme.colors.white, fontSize: 14, fontWeight: "500", flexShrink: 1 },
  calloutBox: { minWidth: 140, maxWidth: 220, paddingVertical: 2 },
  calloutTitle: { color: "#0f172a", fontSize: 13, fontWeight: "700" },
  calloutSubtitle: { color: "#334155", fontSize: 11, marginTop: 2 },
});
