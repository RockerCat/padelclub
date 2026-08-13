import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Camera, ChevronLeft, Globe, ImageIcon, Lock, MessageCircle, Pencil, Plus } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { SITE_URL } from "../lib/reservationShare";
import { getMemberById, type MemberRow, type MemberSportState } from "../lib/players";
import {
  availableTransitions,
  buildTournamentWhatsappMessage,
  canEditTournament,
  canShareWhatsapp,
  formatDurationMinutes,
  runTournamentTransition,
  tournamentCategoryLabel,
  tournamentEntryFeeLabel,
  tournamentStatusLabel,
  tournamentVisibilityLabel,
  TOURNAMENT_TRANSITION_COPY,
  TOURNAMENT_TRANSITION_SUCCESS,
  type SportCategoryOption,
  type TournamentTransitionKey,
} from "../lib/tournaments";
import {
  getTournamentEntriesWithMembers,
  summarizeCapacity,
  computeTournamentClassification,
  type TournamentEntryWithMembers,
} from "../lib/tournamentEntries";
import { TournamentStatusBadge } from "../components/TournamentCard";
import { TournamentFormModal } from "../components/TournamentFormModal";
import { EntriesSection } from "../components/tournaments/EntriesSection";
import { WithdrawnEntriesAccordion } from "../components/tournaments/WithdrawnEntriesAccordion";
import { ClassificationSection } from "../components/tournaments/ClassificationSection";
import { TournamentPodium } from "../components/tournaments/TournamentPodium";
import { TournamentConfetti } from "../components/tournaments/TournamentConfetti";
import { EditTournamentCoverModal } from "../components/tournaments/EditTournamentCoverModal";
import { ImagePreviewModal } from "../components/tournaments/ImagePreviewModal";
import { PlayerDetailSheet } from "../components/PlayerDetailSheet";
import { Toast } from "../components/Toast";
import { Skeleton } from "../components/Skeleton";
import { theme } from "../lib/theme";
import type { Tournament, TournamentEntryRow } from "../types/domain";
import type { TournamentsStackParamList } from "../navigation/TournamentsStack";

type Props = NativeStackScreenProps<TournamentsStackParamList, "TournamentDetail">;

function formatDateTime(iso: string | null): string {
  if (!iso) return "Sin definir";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin definir";
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Transiciones que WEB renderiza como botón "primary" (relleno) —
// Abrir/Cerrar/Reabrir/Iniciar/Finalizar. Archivar/Restaurar son
// "secondary" (mismo tratamiento que Compartir/Editar); Cancelar es
// "danger". Ver TournamentDetailView.tsx (app web).
const PRIMARY_TRANSITIONS = new Set<TournamentTransitionKey>(["open", "close", "reopen", "start", "finalize"]);

// PARIDAD FUNCIONAL de TournamentDetailView.tsx (app web) — una sola
// pantalla para los 3 roles, igual que la web: OWNER/ADMIN conserva las 8
// transiciones de ciclo de vida (Alert.alert nativo como equivalente del
// ConfirmDialog compartido, mismo copy exacto), Compartir por WhatsApp,
// Editar, Inscripciones (registrar cualquier dupla/confirmar/rechazar/
// retirar duplas confirmadas), duplas retiradas, Clasificación editable
// (puntos + Cambiar jugadores) y edición de portada. PLAYER ve
// exactamente el equivalente WEB PLAYER: inscripción propia/Inscribirme,
// retirar su propia dupla, lista de duplas confirmadas en solo lectura,
// Clasificación/Podio en solo lectura (avatares no clickeables — el
// modal "Miembro del club" sigue siendo exclusivo de OWNER/ADMIN, ver
// TournamentDetailView.tsx), portada visible pero sin ningún control de
// edición, y nunca Editar/Compartir/transiciones/duplas retiradas —
// ninguno de los dos roles comparte capacidades del otro. Único subflujo
// deliberadamente fuera de alcance para ambos roles: "Generar noticia"/
// "Ver noticia" — depende enteramente del módulo Noticias, que no existe
// en mobile todavía (ver reporte).
export function TournamentDetailScreen({ route, navigation }: Props) {
  const { tournamentId } = route.params;
  const { club, role, clubMemberId, identity } = useClub();
  const { session } = useAuth();
  const isAdmin = role === "OWNER" || role === "ADMIN";

  // El detalle puede abrirse desde orígenes distintos (Torneos, Dashboard
  // → "Próxima actividad", Actividad reciente, etc.). Cuando se entra
  // cross-tab desde Dashboard (navigation.navigate("TournamentsTab",
  // {screen:"TournamentDetail", params})), TournamentDetail queda como la
  // ÚNICA route de TournamentsStack en ese momento — no hay una pantalla
  // previa DENTRO de ese mismo stack, así que native-stack no dibuja
  // ningún botón "atrás" (headerBackButtonDisplayMode no tiene efecto sin
  // una previous route), pero el header nativo (fondo + altura) se sigue
  // reservando igual — de ahí la franja vacía entre el header global del
  // club y el título. Para PLAYER, el header nativo se oculta por completo
  // (headerShown: false) y el propio contenido de la pantalla dibuja su
  // propia flecha "←" (ver el render de abajo) que sí funciona sin
  // importar el origen: llama a navigation.goBack() directamente, que
  // React Navigation resuelve dentro del stack si hay una route previa
  // (Torneos → detalle) o, si no la hay, la burbujea al Tab Navigator
  // padre y cambia al tab anterior (Dashboard → detalle) — nunca una ruta
  // hardcodeada, nunca un fallback inventado. OWNER/ADMIN conserva el
  // header nativo intacto (mismo criterio que WEB: el back se retira solo
  // para PLAYER).
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: isAdmin, headerBackButtonDisplayMode: "default" });
  }, [navigation, isAdmin]);

  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined);
  const [entries, setEntries] = useState<TournamentEntryWithMembers[]>([]);
  const [categories, setCategories] = useState<SportCategoryOption[]>([]);
  const [ownCategory, setOwnCategory] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editingCover, setEditingCover] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiFiredRef = useRef(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [busyTransition, setBusyTransition] = useState<TournamentTransitionKey | null>(null);

  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [selectedMemberSportState, setSelectedMemberSportState] = useState<MemberSportState | undefined>(undefined);
  const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!club) return;
    const { data, error } = await supabase.from("tournaments").select("*").eq("id", tournamentId).eq("club_id", club.id).single();
    if (error || !data) {
      setLoadError("No fue posible cargar este torneo.");
      setTournament(null);
      return;
    }
    setTournament(data);
    const cats = [data.category, data.secondary_category].filter((c): c is string => !!c);
    const { entries: entryRows } = await getTournamentEntriesWithMembers(supabase, data.id, club.id, cats);
    setEntries(entryRows);
    if (categories.length === 0) {
      const { data: sportCategories } = await supabase.from("sport_categories").select("code, sort_order").order("sort_order", { ascending: true });
      setCategories(sportCategories ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club, tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Categoría propia — únicamente para el gate de elegibilidad de
  // inscripción de PLAYER (ver EntriesSection). Mismo RPC/misma forma que
  // TournamentDetailPage (app web); OWNER/ADMIN nunca se autoinscriben, así
  // que esta consulta ni siquiera corre para ellos.
  useEffect(() => {
    if (isAdmin || !club || !clubMemberId) return;
    let cancelled = false;
    supabase.rpc("get_club_member_sport_state", { p_club_id: club.id, p_club_member_id: clubMemberId }).then(({ data }) => {
      if (cancelled) return;
      setOwnCategory(data?.[0]?.category ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, club, clubMemberId]);

  // Celebración de torneo finalizado — dispara UNA sola vez por montaje de
  // pantalla, apenas se observa tournament.status === "completed" (al
  // entrar directo a un torneo ya finalizado, o al finalizarlo desde acá
  // mismo). confettiFiredRef evita que un refetch posterior (useFocusEffect
  // de abajo, u otra actualización de `tournament` que conserve el mismo
  // status) dispare una segunda explosión — nunca un loop. Respeta
  // "reducir movimiento" del sistema, igual que la versión web
  // (motion-reduce:hidden) — nunca se ignora un resultado real. El único
  // resguardo agregado es un timeout de 500ms EN CARRERA con la propia
  // llamada nativa: si isReduceMotionEnabled() nunca resuelve (falla
  // silenciosa del bridge, no un "true" real), se asume que la preferencia
  // no está activa y se muestra el confetti — nunca al revés.
  useEffect(() => {
    if (tournament?.status !== "completed" || confettiFiredRef.current) return;
    confettiFiredRef.current = true;

    const reduceMotionCheck = AccessibilityInfo.isReduceMotionEnabled();
    const timeoutFallback = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500));
    Promise.race([reduceMotionCheck, timeoutFallback])
      .then((reduceMotion) => {
        if (!reduceMotion) setShowConfetti(true);
      })
      .catch(() => setShowConfetti(true));
  }, [tournament?.status]);

  // Clasificación/inscripciones no deben quedar obsoletas mientras se ve
  // un torneo en_curso — equivalente a la re-suscripción por
  // visibilidad/foco de TournamentDetailView.tsx (router.refresh()
  // debounced), simplificado a "recargar al recuperar foco" (React
  // Navigation no tiene RSC/router.refresh) — nunca deja de haber datos
  // frescos, solo cambia la coreografía exacta del refresco.
  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tournamentId])
  );

  // "Miembro del club" es exclusivo de OWNER/ADMIN (ver
  // TournamentDetailView.tsx, app web — el modal no tiene modo de solo
  // lectura para PLAYER todavía). avatarsClickable ya queda en false para
  // PLAYER en cada sección de abajo, así que esto nunca se dispara desde
  // la UI — este guard es solo defensa adicional, nunca la única barrera.
  async function handleSelectMember(memberId: string) {
    if (!club || !isAdmin) return;
    setLoadingMemberId(memberId);
    const result = await getMemberById(supabase, club.id, memberId);
    setLoadingMemberId(null);
    if (!result) return;
    setSelectedMember(result.member);
    setSelectedMemberSportState(result.sportState);
  }

  function handleEntryPatched(row: TournamentEntryRow) {
    setEntries((prev) => prev.map((e) => (e.id === row.id ? { ...e, ...row } : e)));
  }

  function handleEntryRegistered(row: TournamentEntryRow, members: TournamentEntryWithMembers["members"]) {
    setEntries((prev) => [...prev, { ...row, members } as TournamentEntryWithMembers]);
  }

  function handlePointsSaved(rows: TournamentEntryRow[]) {
    setEntries((prev) => prev.map((e) => {
      const updated = rows.find((r) => r.id === e.id);
      return updated ? { ...e, ...updated } : e;
    }));
  }

  function runTransition(key: TournamentTransitionKey) {
    if (!tournament) return;
    const copy = TOURNAMENT_TRANSITION_COPY[key];
    Alert.alert(copy.title, copy.message, [
      { text: "Cancelar", style: "cancel" },
      {
        text: copy.confirmLabel,
        style: copy.destructive ? "destructive" : "default",
        onPress: async () => {
          setBusyTransition(key);
          const { tournament: updated, alreadyFinalized, error } = await runTournamentTransition(supabase, key, tournament.id);
          setBusyTransition(null);
          if (error) {
            Alert.alert("No fue posible completar la acción", error);
            return;
          }
          if (key === "finalize") {
            setToastMessage(alreadyFinalized ? "Este torneo ya estaba finalizado." : TOURNAMENT_TRANSITION_SUCCESS.finalize);
            load();
          } else if (updated) {
            setTournament(updated);
            setToastMessage(TOURNAMENT_TRANSITION_SUCCESS[key]);
          }
        },
      },
    ]);
  }

  function handleShare() {
    if (!tournament || !club) return;
    const classification = computeTournamentClassification(entries);
    const message = buildTournamentWhatsappMessage({
      clubName: club.name,
      clubSlug: club.slug,
      tournament,
      classification,
      siteUrl: SITE_URL,
    });
    Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`);
  }

  // Con el header nativo oculto para PLAYER, estos dos estados tempranos
  // (cargando/error) también necesitan su propia flecha "←" — sin ella,
  // un PLAYER con conexión lenta o un torneo inexistente quedaría sin
  // forma de volver mientras esta rama sigue montada.
  const backButton = !isAdmin && (
    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={8} accessibilityLabel="Volver">
      <ChevronLeft width={24} height={24} color={theme.colors.white} />
    </TouchableOpacity>
  );

  if (tournament === undefined) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.content}>
          {backButton}
          <Skeleton style={{ height: 180, borderRadius: 16 }} />
          <Skeleton style={{ height: 24, width: "60%" }} />
          <Skeleton style={{ height: 80, borderRadius: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (!tournament || !club) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={[styles.content, { flex: 1 }]}>
          {backButton}
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError ?? "Torneo no encontrado."}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const capacity = summarizeCapacity(entries, tournament.max_pairs);
  const classification = computeTournamentClassification(entries);
  const withdrawnEntries = entries.filter((e) => e.status === "withdrawn");
  const podiumRows = classification.filter((r) => r.position <= 3);
  const isInProgress = tournament.status === "in_progress";
  const isCompleted = tournament.status === "completed";
  // Las 8 transiciones de ciclo de vida, Editar y Compartir por WhatsApp
  // son EXCLUSIVAS de OWNER/ADMIN en la web (ver TournamentDetailView.tsx:
  // canEdit/canShareWhatsApp/canOpenRegistration/etc. siempre parten de
  // `isAdmin &&`) — PLAYER nunca ve ninguna, aunque el status del torneo
  // por sí solo las habilitaría.
  const transitions = isAdmin ? availableTransitions(tournament, capacity) : [];
  const showEdit = isAdmin && canEditTournament(tournament.status);
  const showShare = isAdmin && canShareWhatsapp(tournament.status);

  // Mismos campos exactos, mismo orden que infoFields en
  // TournamentDetailView.tsx (app web) — categoría/cupo/inscripción/
  // premios/inicio/duración/apertura/cierre/auditoría. La visibilidad
  // (privado/público) y la cuenta de duplas confirmadas NO viven aquí —
  // la primera se muestra junto al título, la segunda dentro de
  // Inscripciones (barra de cupo), igual que en WEB.
  function Field({ label, value }: { label: string; value: string }) {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
    );
  }

  const infoCard = (
    <View style={styles.infoCard}>
      <Field label="Categoría" value={tournamentCategoryLabel(tournament.category, tournament.secondary_category)} />
      <Field label="Cupo máximo" value={`${tournament.max_pairs} duplas`} />
      <Field label="Inscripción" value={tournamentEntryFeeLabel(tournament.entry_fee_amount)} />
      {tournament.prize_description && <Field label="Premios" value={tournament.prize_description} />}
      <Field label="Inicio" value={formatDateTime(tournament.starts_at)} />
      <Field
        label="Duración estimada"
        value={tournament.estimated_duration_minutes ? formatDurationMinutes(tournament.estimated_duration_minutes) : "—"}
      />
      <Field label="Apertura de inscripciones" value={formatDateTime(tournament.registration_opens_at)} />
      <Field label="Cierre de inscripciones" value={formatDateTime(tournament.registration_closes_at)} />
      {tournament.started_at && <Field label="Iniciado" value={formatDateTime(tournament.started_at)} />}
      {tournament.completed_at && <Field label="Finalizado" value={formatDateTime(tournament.completed_at)} />}
      {tournament.cancelled_at && <Field label="Cancelado" value={formatDateTime(tournament.cancelled_at)} />}
    </View>
  );

  // Portada — aspect-[3/4] (retrato, como un flyer de torneo), igual que
  // WEB. Ícono de cámara superpuesto y placeholder "Agregar portada" son
  // exclusivos de OWNER/ADMIN (ver TournamentDetailView.tsx:
  // `(tournament.cover_image_url || isAdmin)`) — un PLAYER sin portada
  // simplemente no ve nada, nunca un botón para crear una.
  const coverBlock = (tournament.cover_image_url || isAdmin) && (
    <View>
      {tournament.cover_image_url ? (
        <TouchableOpacity onPress={() => setPreviewOpen(true)} activeOpacity={0.9}>
          <Image source={{ uri: tournament.cover_image_url }} style={styles.cover} />
          {isAdmin && (
            <TouchableOpacity style={styles.coverEditButton} onPress={() => setEditingCover(true)} hitSlop={6}>
              <Camera width={16} height={16} color={theme.colors.white} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.coverPlaceholder} onPress={() => setEditingCover(true)} activeOpacity={0.85}>
          <ImageIcon width={22} height={22} color={theme.colors.muted} />
          <Text style={styles.coverPlaceholderText}>Agregar portada</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const entriesBlock = !isCompleted && (
    <EntriesSection
      clubId={club.id}
      tournament={tournament}
      entries={entries}
      capacity={capacity}
      role={role as "OWNER" | "ADMIN" | "PLAYER"}
      ownClubMemberId={clubMemberId ?? ""}
      ownUserId={session?.user?.id ?? ""}
      ownFullName={identity?.name ?? null}
      ownAvatarUrl={identity?.avatarUrl ?? null}
      ownCategory={ownCategory}
      hideConfirmedList={isInProgress}
      avatarsClickable={isAdmin}
      onSelectMember={handleSelectMember}
      loadingMemberId={loadingMemberId}
      onEntryPatched={handleEntryPatched}
      onEntryRegistered={handleEntryRegistered}
      onToast={setToastMessage}
    />
  );

  // Historial de duplas retiradas — únicamente OWNER/ADMIN (ver
  // TournamentDetailView.tsx: `isAdmin && !isCompleted`), nunca PLAYER.
  const withdrawnBlock = isAdmin && !isCompleted && (
    <WithdrawnEntriesAccordion entries={withdrawnEntries} avatarsClickable onSelectMember={handleSelectMember} loadingMemberId={loadingMemberId} />
  );

  // Sin tarjeta/borde propio — WEB muestra Clasificación como un título +
  // la lista directamente sobre el fondo, nunca dentro de una caja
  // adicional (esa sí existe para la información del torneo, pero no
  // aquí). Editable (input de puntos + "Cambiar jugadores") y avatares
  // clickeables (modal "Miembro del club") son exclusivos de OWNER/ADMIN.
  const classificationBlock = (isInProgress || isCompleted) && (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{isCompleted ? "Clasificación final" : "Clasificación"}</Text>
      <ClassificationSection
        clubId={club.id}
        tournamentId={tournament.id}
        category={tournament.category}
        secondaryCategory={tournament.secondary_category}
        entries={entries}
        editable={isAdmin && isInProgress}
        isLive={isInProgress}
        completed={isCompleted}
        ownClubMemberId={clubMemberId}
        avatarsClickable={isAdmin}
        onSelectMember={handleSelectMember}
        loadingMemberId={loadingMemberId}
        onPointsSaved={handlePointsSaved}
        onReplaceSuccess={load}
        onToast={setToastMessage}
      />
    </View>
  );

  const podiumBlock = isCompleted && podiumRows.length > 0 && (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Podio final</Text>
      <TournamentPodium
        rows={podiumRows}
        avatarsClickable={isAdmin}
        onSelectMember={handleSelectMember}
        loadingMemberId={loadingMemberId}
        ownClubMemberId={clubMemberId}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header compacto — solo PLAYER (sin header nativo, ver
            useLayoutEffect arriba): fila 1 flecha "atrás" + título juntos
            (alignItems: flex-start en playerTitleRow, así con título de 2
            líneas la flecha queda arriba, nunca centrada respecto al
            bloque completo); fila 2 estado + visibilidad juntos. OWNER/
            ADMIN conserva exactamente el markup/orden anterior sin cambios
            (título+estado en la fila 1, en-vivo+visibilidad en la fila 2,
            sin flecha — sigue con su header nativo intacto). Mismos
            badges/colores/textos en ambas ramas, nunca una segunda
            implementación visual de cada badge. */}
        {isAdmin ? (
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{tournament.name}</Text>
              <TournamentStatusBadge status={tournament.status} />
            </View>

            <View style={styles.subBadgeRow}>
              {isInProgress && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>En vivo</Text>
                </View>
              )}
              <View style={styles.visibilityInline}>
                {tournament.visibility === "public" ? (
                  <Globe width={13} height={13} color={theme.colors.muted} />
                ) : (
                  <Lock width={13} height={13} color={theme.colors.muted} />
                )}
                <Text style={styles.visibilityText}>{tournamentVisibilityLabel(tournament.visibility)}</Text>
              </View>
            </View>

            {tournament.description && <Text style={styles.description}>{tournament.description}</Text>}
          </View>
        ) : (
          <View style={styles.header}>
            <View style={styles.playerTitleRow}>
              {backButton}
              <Text style={styles.title}>{tournament.name}</Text>
            </View>

            <View style={styles.subBadgeRow}>
              <TournamentStatusBadge status={tournament.status} />
              {isInProgress && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>En vivo</Text>
                </View>
              )}
              <View style={styles.visibilityInline}>
                {tournament.visibility === "public" ? (
                  <Globe width={13} height={13} color={theme.colors.muted} />
                ) : (
                  <Lock width={13} height={13} color={theme.colors.muted} />
                )}
                <Text style={styles.visibilityText}>{tournamentVisibilityLabel(tournament.visibility)}</Text>
              </View>
            </View>

            {tournament.description && <Text style={styles.description}>{tournament.description}</Text>}
          </View>
        )}

        {(showShare || showEdit || transitions.length > 0) && (
          <View style={styles.actionsRow}>
            {showShare && (
              <TouchableOpacity style={styles.actionSecondary} onPress={handleShare}>
                <MessageCircle width={14} height={14} color={theme.colors.white} />
                <Text style={styles.actionSecondaryText}>Compartir por WhatsApp</Text>
              </TouchableOpacity>
            )}
            {showEdit && (
              <TouchableOpacity style={styles.actionSecondary} onPress={() => setEditing(true)}>
                <Pencil width={14} height={14} color={theme.colors.white} />
                <Text style={styles.actionSecondaryText}>Editar</Text>
              </TouchableOpacity>
            )}
            {transitions
              .filter((k) => PRIMARY_TRANSITIONS.has(k))
              .map((key) => (
                <TouchableOpacity
                  key={key}
                  style={styles.actionPrimary}
                  disabled={busyTransition === key}
                  onPress={() => runTransition(key)}
                >
                  {busyTransition === key ? (
                    <ActivityIndicator size="small" color={theme.colors.bg} />
                  ) : (
                    <Text style={styles.actionPrimaryText}>{TOURNAMENT_TRANSITION_COPY[key].confirmLabel}</Text>
                  )}
                </TouchableOpacity>
              ))}
            {(["archive", "restore"] as const).map(
              (key) =>
                transitions.includes(key) && (
                  <TouchableOpacity
                    key={key}
                    style={styles.actionSecondary}
                    disabled={busyTransition === key}
                    onPress={() => runTransition(key)}
                  >
                    {busyTransition === key ? (
                      <ActivityIndicator size="small" color={theme.colors.white} />
                    ) : (
                      <Text style={styles.actionSecondaryText}>{TOURNAMENT_TRANSITION_COPY[key].confirmLabel}</Text>
                    )}
                  </TouchableOpacity>
                )
            )}
            {transitions.includes("cancel") && (
              <TouchableOpacity style={styles.actionDanger} disabled={busyTransition === "cancel"} onPress={() => runTransition("cancel")}>
                {busyTransition === "cancel" ? (
                  <ActivityIndicator size="small" color={theme.colors.danger} />
                ) : (
                  <Text style={styles.actionDangerText}>Cancelar torneo</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {isInProgress ? (
          <>
            {classificationBlock}
            {coverBlock}
            {infoCard}
            {withdrawnBlock}
            {entriesBlock}
          </>
        ) : isCompleted ? (
          <>
            {podiumBlock}
            {classificationBlock}
            {coverBlock}
            {infoCard}
          </>
        ) : (
          <>
            {infoCard}
            {coverBlock}
            {entriesBlock}
            {withdrawnBlock}
          </>
        )}
      </ScrollView>

      {isAdmin && editing && (
        <TournamentFormModal
          clubId={club.id}
          tournament={tournament}
          categories={categories}
          minMaxPairs={capacity.occupied}
          onClose={() => setEditing(false)}
          onSuccess={(updated) => {
            setEditing(false);
            setTournament(updated);
            setToastMessage("Cambios guardados correctamente");
          }}
          // Swap a hermano, nunca anidado: cierra este modal y abre
          // EditTournamentCoverModal por separado — dos <Modal> de RN
          // cerrándose a la vez es la causa confirmada de un freeze real
          // en otro flujo (ver ReservationTicketPanel/RejectReservationModal).
          onEditCover={() => {
            setEditing(false);
            setEditingCover(true);
          }}
        />
      )}

      {isAdmin && editingCover && (
        <EditTournamentCoverModal
          clubId={club.id}
          tournamentId={tournament.id}
          currentImageUrl={tournament.cover_image_url}
          onClose={() => setEditingCover(false)}
          onSuccess={(updated) => {
            setEditingCover(false);
            setTournament(updated);
            setToastMessage("Portada actualizada correctamente");
          }}
        />
      )}

      {previewOpen && tournament.cover_image_url && <ImagePreviewModal src={tournament.cover_image_url} onClose={() => setPreviewOpen(false)} />}

      <PlayerDetailSheet member={selectedMember} sportState={selectedMemberSportState} onClose={() => setSelectedMember(null)} />

      {showConfetti && <TournamentConfetti onDone={() => setShowConfetti(false)} />}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  backButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  header: { gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  // PLAYER: flecha + título en la misma fila. alignItems: "flex-start" —
  // no "center" — es lo que mantiene la flecha arriba (nunca centrada
  // respecto al bloque completo) cuando el título ocupa 2 líneas.
  playerTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: theme.colors.white },
  subBadgeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#3f0d0d",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.5)",
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#ef4444" },
  liveText: { fontSize: 12, fontWeight: "700", color: theme.colors.white },
  visibilityInline: { flexDirection: "row", alignItems: "center", gap: 5 },
  visibilityText: { fontSize: 12, color: theme.colors.muted },
  description: { fontSize: 13, color: theme.colors.muted, lineHeight: 19 },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionSecondary: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionSecondaryText: { fontSize: 12, fontWeight: "600", color: theme.colors.white },
  actionPrimary: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPrimaryText: { fontSize: 12, fontWeight: "700", color: theme.colors.bg },
  actionDanger: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionDangerText: { fontSize: 12, fontWeight: "600", color: theme.colors.danger },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 18,
    gap: 14,
  },
  field: { gap: 3 },
  fieldLabel: { fontSize: 12, color: theme.colors.muted },
  fieldValue: { fontSize: 14, color: theme.colors.white, fontWeight: "500" },
  section: { gap: 14 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.white },
  cover: { width: "100%", aspectRatio: 3 / 4, borderRadius: 16 },
  coverEditButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  coverPlaceholder: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  coverPlaceholderText: { fontSize: 13, color: theme.colors.muted },
  errorBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { fontSize: 14, color: theme.colors.muted, textAlign: "center" },
});
