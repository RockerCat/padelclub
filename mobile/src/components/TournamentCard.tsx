import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Globe, Lock, Users } from "lucide-react-native";
import { theme } from "../lib/theme";
import {
  tournamentCategoryLabel,
  tournamentEntryFeeLabel,
  tournamentStatusBadgeVariant,
  tournamentStatusLabel,
  tournamentVisibilityLabel,
  type TournamentBadgeVariant,
} from "../lib/tournaments";
import type { Tournament } from "../types/domain";

// Traducción 1:1 de TournamentCard.tsx (app web) — misma estructura,
// mismos campos, mismo orden. `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
// en web ya es una sola columna al ancho de un teléfono, así que un
// FlatList vertical de estas cards es la misma vista, no una
// reinterpretación.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function dateRangeLabel(t: Tournament): string {
  return t.starts_at ? formatDate(t.starts_at) : "Sin fecha definida";
}

// Mismos 7 variants que Badge.tsx (app web), traducidos de clases
// Tailwind a colores planos — mismo mapeo de status→variant
// (tournamentStatusBadgeVariant), nunca un color inventado por status.
const BADGE_COLORS: Record<TournamentBadgeVariant, { bg: string; border: string; text: string }> = {
  default: { bg: "rgba(255,255,255,0.1)", border: "transparent", text: "rgba(255,255,255,0.7)" },
  primary: { bg: `${theme.colors.primary}26`, border: `${theme.colors.primary}40`, text: theme.colors.primary },
  secondary: { bg: `${theme.colors.secondary}40`, border: `${theme.colors.secondary}66`, text: "#5FD1D2" },
  success: { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.25)", text: "#34D399" },
  warning: { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.25)", text: theme.colors.warning },
  danger: { bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.25)", text: theme.colors.danger },
  outline: { bg: "transparent", border: "rgba(255,255,255,0.2)", text: "rgba(255,255,255,0.6)" },
};

export function TournamentStatusBadge({ status }: { status: string }) {
  const variant = tournamentStatusBadgeVariant(status);
  const c = BADGE_COLORS[variant];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.badgeText, { color: c.text }]} numberOfLines={1}>
        {tournamentStatusLabel(status)}
      </Text>
    </View>
  );
}

export function TournamentCard({
  tournament,
  confirmedCount,
  onPress,
  footerExtra,
}: {
  tournament: Tournament;
  confirmedCount?: number;
  onPress: () => void;
  // Línea extra opcional bajo la fecha — traducción 1:1 del slot
  // `footerExtra` de TournamentCard.tsx (app web), usado por "Mis
  // torneos" del Dashboard del PLAYER (compañero/posición/puntos). undefined
  // no renderiza nada extra, así que TournamentsScreen.tsx (el único otro
  // caller) queda exactamente igual.
  footerExtra?: React.ReactNode;
}) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.card}>
      {tournament.cover_image_url ? <Image source={{ uri: tournament.cover_image_url }} style={styles.cover} /> : null}
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={2}>
            {tournament.name}
          </Text>
          <TournamentStatusBadge status={tournament.status} />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Users width={14} height={14} color={theme.colors.muted} />
            <Text style={styles.metaText}>
              Categoría {tournamentCategoryLabel(tournament.category, tournament.secondary_category)} ·{" "}
              {confirmedCount !== undefined
                ? `${confirmedCount}/${tournament.max_pairs} duplas confirmadas`
                : `${tournament.max_pairs} duplas`}
            </Text>
          </View>
          <View style={styles.metaItem}>
            {tournament.visibility === "public" ? (
              <Globe width={14} height={14} color={theme.colors.muted} />
            ) : (
              <Lock width={14} height={14} color={theme.colors.muted} />
            )}
            <Text style={styles.metaText}>{tournamentVisibilityLabel(tournament.visibility)}</Text>
          </View>
          <Text style={styles.metaText}>{tournamentEntryFeeLabel(tournament.entry_fee_amount)}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.dateText}>{dateRangeLabel(tournament)}</Text>
          {footerExtra}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    overflow: "hidden",
  },
  cover: { width: "100%", aspectRatio: 16 / 9 },
  body: { padding: 16, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: "600", color: theme.colors.white },
  badge: { borderRadius: theme.radius.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 150 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: theme.colors.muted },
  footer: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.06)" },
  dateText: { fontSize: 12, color: theme.colors.muted },
});
