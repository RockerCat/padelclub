import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";
import { timeToMins } from "../lib/time";
import { CourtIllustration, getSurfaceLabel } from "./CourtIllustration";

const MORNING_END_MINS = 12 * 60;
const EVENING_START_MINS = 18 * 60;

// Colores fijos por type de reserva confirmada (Clase/Bloqueo) — mismos
// tonos que sky-400/violet-400 en AdminAvailabilityView/
// CourtAvailabilityTimeline (app web), nunca el color de marca del club
// (ver CLAUDE.md → Club Identity Principles). "approved"/"pending" ya
// reusan theme.colors.success/#FCD34D, iguales a los de la web.
const CLASS_COLOR = "#38BDF8";
const BLOCK_COLOR = "#A78BFA";

type DayPartGroup = { key: string; label: string; ticks: string[] };

// Traducción 1:1 de buildDayPartGroups en CourtAvailabilityTimeline.tsx.
function buildDayPartGroups(grid: string[]): DayPartGroup[] {
  return [
    { key: "morning", label: "MAÑANA", ticks: grid.filter((t) => timeToMins(t) < MORNING_END_MINS) },
    { key: "afternoon", label: "TARDE", ticks: grid.filter((t) => timeToMins(t) >= MORNING_END_MINS && timeToMins(t) < EVENING_START_MINS) },
    { key: "evening", label: "NOCHE", ticks: grid.filter((t) => timeToMins(t) >= EVENING_START_MINS) },
  ].filter((group) => group.ticks.length > 0);
}

export type OwnTone = "approved" | "pending";

// Tono de una reserva ajena (Agenda, OWNER/ADMIN) — equivalente RN del
// ContextRange["tone"] de confirmedRangesFor/pendingRangesFor en
// AdminAvailabilityView.tsx (app web): "approved"/"class"/"block" pintan una
// reserva confirmada según su type (Partido/Clase/Bloqueo), "pending" una
// solicitud pendiente. Nunca se mezcla con ownTone (siempre vacío para
// OWNER/ADMIN por regla de negocio) — ownTone tiene prioridad cuando ambos
// existen, igual que en la web (contextRange sobre generalContextRanges).
export type OccupiedTone = "approved" | "class" | "block" | "pending";

// Traducción 1:1 de CourtAvailabilityCard (CourtAvailabilityTimeline.tsx,
// app web) para el subconjunto que aplica al calendario PLAYER: mismo
// header (CourtIllustration + nombre + subtítulo), mismo grid agrupado por
// franja (groupByDayPart, siempre activo aquí — mobile). A diferencia de la
// web (que sí trunca cada franja a max-h-[92px] con scroll interno bajo el
// breakpoint lg), acá cada franja crece libremente según la cantidad de
// filas que necesite (sin ScrollView ni maxHeight) — un scroll interno de
// solo 2 filas visibles ocultaba horarios disponibles sin que fuera obvio
// para el usuario; el único scroll vertical es el de la pantalla de
// Reservas. El patrón de rayas diagonales de "Ocupado"
// (repeating-linear-gradient CSS) se simplifica a un relleno sólido tenue
// — sin equivalente directo en RN.
export function CourtAvailabilityCard({
  court,
  grid,
  availableSlots,
  ownToneByStart,
  occupiedToneByStart,
  occupiedLabelByStart,
  selectedRange,
  onSelectSlot,
  onSelectOwn,
  onSelectOccupied,
}: {
  court: { id: string; name: string; surface: string | null; is_indoor: boolean | null };
  grid: string[];
  availableSlots: string[];
  ownToneByStart: Record<string, OwnTone>;
  // OWNER/ADMIN "Agenda" only (undefined para PLAYER) — tono de una reserva
  // ajena por type (Partido/Clase/Bloqueo) o de una solicitud pendiente,
  // portado de confirmedRangesFor/pendingRangesFor (AdminAvailabilityView,
  // app web). ownToneByStart tiene prioridad cuando ambos aplican a un mismo
  // tick (nunca ocurre en la práctica: siempre vacío para OWNER/ADMIN).
  occupiedToneByStart?: Record<string, OccupiedTone>;
  // OWNER/ADMIN "Agenda" only — label a mostrar dentro del tick ocupado en
  // vez de la hora (primer jugador, título o "Club"), portado de
  // occupiedLabelFor (app web). null/ausente conserva la hora como label.
  occupiedLabelByStart?: Record<string, string | null>;
  selectedRange: { start: string; end: string } | null;
  onSelectSlot: (startTime: string) => void;
  onSelectOwn: (startTime: string) => void;
  // OWNER/ADMIN only — equivalente RN de onSelectOccupied en
  // AdminAvailabilityView (app web): a diferencia de onSelectOwn (que solo
  // reacciona a un tono propio, siempre vacío para OWNER/ADMIN por regla de
  // negocio), esto hace tocable CUALQUIER tick ocupado, tenga tono o no —
  // abre ReservationTicketPanel en modo "view"/"pending" según corresponda.
  // undefined (PLAYER) preserva el comportamiento exacto de antes: un tick
  // ocupado sin tono propio queda deshabilitado.
  onSelectOccupied?: (startTime: string) => void;
}) {
  const groups = buildDayPartGroups(grid);
  const availableSet = new Set(availableSlots);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <CourtIllustration surface={court.surface} width={64} height={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.courtName} numberOfLines={1}>
            {court.name}
          </Text>
          <Text style={styles.courtSubtitle} numberOfLines={1}>
            {court.is_indoor ? "Indoor" : "Outdoor"} · {getSurfaceLabel(court.surface)}
          </Text>
        </View>
      </View>

      {selectedRange && (
        <View style={styles.selectedPill}>
          <Text style={styles.selectedPillText}>
            Seleccionado: {selectedRange.start} – {selectedRange.end}
          </Text>
        </View>
      )}

      <View style={{ gap: 16 }}>
        {groups.map((group) => (
          <View key={group.key} style={{ gap: 6 }}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            <View style={styles.tickGrid}>
              {group.ticks.map((tick) => {
                const isAvailable = availableSet.has(tick);
                const ownTone = ownToneByStart[tick];
                // ownTone (propio, PLAYER) siempre gana sobre occupiedTone
                // (reserva ajena, OWNER/ADMIN) — en la práctica nunca
                // coinciden, ya que ownToneByStart está siempre vacío para
                // OWNER/ADMIN por regla de negocio.
                const tone = (ownTone ?? occupiedToneByStart?.[tick]) as OccupiedTone | undefined;
                const occupiedTappable = !!ownTone || !!onSelectOccupied;
                const label = !isAvailable ? occupiedLabelByStart?.[tick] ?? tick : tick;
                return (
                  <TouchableOpacity
                    key={tick}
                    disabled={!isAvailable && !occupiedTappable}
                    onPress={() => {
                      if (isAvailable) return onSelectSlot(tick);
                      if (ownTone) return onSelectOwn(tick);
                      if (onSelectOccupied) return onSelectOccupied(tick);
                    }}
                    style={[
                      styles.tick,
                      isAvailable && styles.tickAvailable,
                      !isAvailable && !tone && styles.tickOccupied,
                      tone === "approved" && styles.tickApproved,
                      tone === "class" && styles.tickClass,
                      tone === "block" && styles.tickBlock,
                      tone === "pending" && styles.tickPending,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        styles.tickText,
                        isAvailable && { color: theme.colors.white },
                        !isAvailable && !tone && { color: "rgba(148,163,184,0.4)" },
                        tone === "approved" && { color: theme.colors.success },
                        tone === "class" && { color: CLASS_COLOR },
                        tone === "block" && { color: BLOCK_COLOR },
                        tone === "pending" && { color: "#FCD34D" },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 16,
    gap: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  courtName: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
  courtSubtitle: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  selectedPill: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}33`,
    backgroundColor: `${theme.colors.primary}1A`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
  },
  selectedPillText: { fontSize: 12, fontWeight: "600", color: theme.colors.primary },
  groupLabel: { fontSize: 11, fontWeight: "500", color: "rgba(148,163,184,0.7)", textTransform: "uppercase", letterSpacing: 0.5 },
  // grid justificado a 5 columnas por fila (equivalente RN de
  // `grid-template-columns: repeat(auto-fill, minmax(46px,1fr))`): cada
  // tick tiene un ancho mínimo (flexBasis) pero crece parejo (flexGrow)
  // para llenar el ancho completo de la fila, igual que la web — nunca un
  // borde derecho irregular con hueco vacío.
  tickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tick: { flexBasis: 50, flexGrow: 1, height: 40, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tickAvailable: { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.15)" },
  tickOccupied: { backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.05)" },
  tickApproved: { backgroundColor: "rgba(0,255,0,0.15)", borderColor: theme.colors.success },
  tickClass: { backgroundColor: "rgba(56,189,248,0.15)", borderColor: CLASS_COLOR },
  tickBlock: { backgroundColor: "rgba(167,139,250,0.15)", borderColor: BLOCK_COLOR },
  tickPending: { backgroundColor: "rgba(251,191,36,0.15)", borderColor: theme.colors.warning },
  tickText: { fontSize: 10, fontWeight: "600" },
});
