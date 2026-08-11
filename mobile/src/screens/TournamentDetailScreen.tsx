import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Camera, Globe, ImageIcon, Lock, MessageCircle, Pencil, Plus } from "lucide-react-native";
import { supabase } from "../lib/supabase";
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

// PARIDAD FUNCIONAL de TournamentDetailView.tsx (app web, rama OWNER/ADMIN)
// — mismas 8 transiciones de ciclo de vida (Alert.alert nativo como
// equivalente del ConfirmDialog compartido, mismo copy exacto), mismo
// Compartir por WhatsApp, Editar (TournamentFormModal en modo edición),
// Inscripciones (EntriesSection: registrar/confirmar/rechazar/retirar),
// duplas retiradas, Clasificación (puntos editables solo in_progress +
// Cambiar jugadores), Podio (completed, agrupado por posición real, nunca
// por índice), portada (subir/reemplazar en cualquier estado + lightbox).
// Único subflujo deliberadamente fuera de alcance: "Generar noticia"/"Ver
// noticia" — depende enteramente del módulo Noticias, que no existe en
// mobile todavía (ver reporte).
export function TournamentDetailScreen({ route }: Props) {
  const { tournamentId } = route.params;
  const { club } = useClub();

  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined);
  const [entries, setEntries] = useState<TournamentEntryWithMembers[]>([]);
  const [categories, setCategories] = useState<SportCategoryOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editingCover, setEditingCover] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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

  async function handleSelectMember(clubMemberId: string) {
    if (!club) return;
    setLoadingMemberId(clubMemberId);
    const result = await getMemberById(supabase, club.id, clubMemberId);
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

  if (tournament === undefined) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.content}>
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
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{loadError ?? "Torneo no encontrado."}</Text>
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
  const transitions = availableTransitions(tournament, capacity);
  const showEdit = canEditTournament(tournament.status);
  const showShare = canShareWhatsapp(tournament.status);

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
  // WEB. Ícono de cámara superpuesto solo cuando ya hay portada (editar);
  // sin portada, todo el placeholder discontinuo es el botón para
  // agregarla.
  const coverBlock = (
    <View>
      {tournament.cover_image_url ? (
        <TouchableOpacity onPress={() => setPreviewOpen(true)} activeOpacity={0.9}>
          <Image source={{ uri: tournament.cover_image_url }} style={styles.cover} />
          <TouchableOpacity style={styles.coverEditButton} onPress={() => setEditingCover(true)} hitSlop={6}>
            <Camera width={16} height={16} color={theme.colors.white} />
          </TouchableOpacity>
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
      hideConfirmedList={isInProgress}
      avatarsClickable
      onSelectMember={handleSelectMember}
      loadingMemberId={loadingMemberId}
      onEntryPatched={handleEntryPatched}
      onEntryRegistered={handleEntryRegistered}
      onToast={setToastMessage}
    />
  );

  const withdrawnBlock = !isCompleted && (
    <WithdrawnEntriesAccordion entries={withdrawnEntries} avatarsClickable onSelectMember={handleSelectMember} loadingMemberId={loadingMemberId} />
  );

  // Sin tarjeta/borde propio — WEB muestra Clasificación como un título +
  // la lista directamente sobre el fondo, nunca dentro de una caja
  // adicional (esa sí existe para la información del torneo, pero no
  // aquí).
  const classificationBlock = (isInProgress || isCompleted) && (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{isCompleted ? "Clasificación final" : "Clasificación"}</Text>
      <ClassificationSection
        clubId={club.id}
        tournamentId={tournament.id}
        category={tournament.category}
        secondaryCategory={tournament.secondary_category}
        entries={entries}
        editable={isInProgress}
        isLive={isInProgress}
        completed={isCompleted}
        avatarsClickable
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
      <TournamentPodium rows={podiumRows} avatarsClickable onSelectMember={handleSelectMember} loadingMemberId={loadingMemberId} />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
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

      {editing && (
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

      {editingCover && (
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

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  header: { gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
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
