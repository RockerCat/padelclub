import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../../lib/theme";
import { pairLabel, groupPodiumByPlace } from "../../lib/tournaments";
import { PlayerAvatar } from "../PlayerAvatar";
import type { TournamentClassificationRow } from "../../lib/tournamentEntries";

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" } as const;
// Jerarquía real (no solo cosmética por posición): 1.º usa una escala
// claramente mayor en cada pieza (pedestal, medalla, avatar, nombre) que
// 2.º/3.º — adaptación de la jerarquía de TournamentPodium.tsx (app web:
// PLACE_BASE_HEIGHT/PLACE_AVATAR_CLASS/PLACE_CONTENT_HEIGHT) a estilos RN
// fijos por posición, nunca clases CSS copiadas literalmente.
const PEDESTAL_HEIGHT = { 1: 104, 2: 72, 3: 56 } as const;
const MEDAL_SIZE = { 1: 32, 2: 22, 3: 22 } as const;
const AVATAR_SIZE: Record<1 | 2 | 3, "sm" | "md"> = { 1: "md", 2: "sm", 3: "sm" };
const NAME_SIZE = { 1: 13, 2: 11, 3: 11 } as const;
// Mismo acento ámbar ya usado para "Logros deportivos" (AchievementsSection)
// — nunca el cyan genérico de las demás métricas del club, mismo criterio
// que WEB (podio siempre ámbar, independiente del color configurado del
// club). 1.º recibe un tinte ligeramente más marcado, nunca un color
// distinto.
const AMBER = theme.colors.warning;
const PEDESTAL_TINT = {
  1: { bg: `${AMBER}26`, border: `${AMBER}59` },
  2: { bg: `${AMBER}14`, border: `${AMBER}33` },
  3: { bg: `${AMBER}14`, border: `${AMBER}33` },
} as const;

// Traducción 1:1 de TournamentPodium.tsx (app web) — agrupa por
// row.position (nunca por índice), así un empate real en cualquier
// posición apila varias duplas dentro del MISMO bloque, nunca un ganador
// inventado. Orden visual 2º-1º-3º, con 1.º claramente protagonista
// (pedestal más alto, medalla/avatar/nombre más grandes) y 2.º/3.º
// equilibrados entre sí — nunca "3 tarjetas iguales". Solo se monta para
// torneos completed. ownClubMemberId es opcional y puramente presentacional
// (badge "TÚ", mismo criterio/estilo que ya usa ClassificationSection en
// esta misma pantalla) — nunca afecta agrupación, orden ni posición real.
export function TournamentPodium({
  rows,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
  ownClubMemberId,
}: {
  rows: TournamentClassificationRow[];
  avatarsClickable?: boolean;
  onSelectMember?: (clubMemberId: string) => void;
  loadingMemberId?: string | null;
  ownClubMemberId?: string | null;
}) {
  const byPlace = groupPodiumByPlace(rows);
  if (byPlace.size === 0) return null;

  return (
    <View style={styles.wrap}>
      {([2, 1, 3] as const).map((place) => {
        const placeRows = byPlace.get(place) ?? [];
        const tint = PEDESTAL_TINT[place];
        return (
          <View key={place} style={styles.column}>
            {placeRows.length === 0 ? (
              <View style={{ height: PEDESTAL_HEIGHT[place] }} />
            ) : (
              <View
                style={[
                  styles.pedestal,
                  { minHeight: PEDESTAL_HEIGHT[place], backgroundColor: tint.bg, borderColor: tint.border },
                ]}
              >
                <Text style={[styles.medal, { fontSize: MEDAL_SIZE[place] }]}>{MEDAL[place]}</Text>
                {placeRows.map(({ entry }) => {
                  const isOwn = !!ownClubMemberId && entry.members.some((m) => m.club_member_id === ownClubMemberId);
                  return (
                    <View key={entry.id} style={styles.entryBlock}>
                      <View style={styles.avatarStack}>
                        {entry.members.map((m, i) => (
                          <TouchableOpacity
                            key={m.club_member_id}
                            disabled={!avatarsClickable}
                            onPress={() => onSelectMember?.(m.club_member_id)}
                            activeOpacity={0.7}
                            style={i > 0 ? styles.avatarOverlap : undefined}
                          >
                            <PlayerAvatar
                              player={{ id: m.club_member_id, full_name: m.full_name, avatar_url: m.avatar_url }}
                              size={AVATAR_SIZE[place]}
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.nameRow}>
                        <Text style={[styles.pairName, { fontSize: NAME_SIZE[place] }]} numberOfLines={2}>
                          {pairLabel(entry)}
                        </Text>
                        {isOwn && (
                          <View style={styles.ownBadge}>
                            <Text style={styles.ownBadgeText}>TÚ</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.points}>{entry.points} pts/jugador</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  column: { flex: 1, alignItems: "center", minWidth: 0 },
  pedestal: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 8,
  },
  medal: { lineHeight: undefined },
  entryBlock: { alignItems: "center", gap: 4, minWidth: 0 },
  avatarStack: { flexDirection: "row" },
  avatarOverlap: { marginLeft: -8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0, flexWrap: "wrap", justifyContent: "center" },
  pairName: { color: theme.colors.white, fontWeight: "700", textAlign: "center" },
  ownBadge: { backgroundColor: `${theme.colors.primary}26`, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  ownBadgeText: { fontSize: 9, fontWeight: "700", color: theme.colors.primary },
  points: { fontSize: 10, fontWeight: "600", color: AMBER },
});
