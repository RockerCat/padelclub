import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../../lib/theme";
import { pairLabel, groupPodiumByPlace } from "../../lib/tournaments";
import { PlayerAvatar } from "../PlayerAvatar";
import type { TournamentClassificationRow } from "../../lib/tournamentEntries";

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" } as const;
const PEDESTAL_HEIGHT = { 1: 92, 2: 66, 3: 48 } as const;

// Traducción 1:1 de TournamentPodium.tsx (app web) — agrupa por
// row.position (nunca por índice), así un empate real en cualquier
// posición apila varias duplas dentro del MISMO bloque, nunca un ganador
// inventado. Orden visual 2º-1º-3º, altura de pedestal fija por posición
// (nunca escala con la cantidad de empatados — los empates hacen scroll
// dentro del bloque). Solo se monta para torneos completed.
export function TournamentPodium({
  rows,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
}: {
  rows: TournamentClassificationRow[];
  avatarsClickable?: boolean;
  onSelectMember?: (clubMemberId: string) => void;
  loadingMemberId?: string | null;
}) {
  const byPlace = groupPodiumByPlace(rows);
  if (byPlace.size === 0) return null;

  return (
    <View style={styles.wrap}>
      {([2, 1, 3] as const).map((place) => {
        const placeRows = byPlace.get(place) ?? [];
        return (
          <View key={place} style={styles.column}>
            {placeRows.length === 0 ? (
              <View style={{ height: PEDESTAL_HEIGHT[place] }} />
            ) : (
              <View style={[styles.pedestal, { minHeight: PEDESTAL_HEIGHT[place] }]}>
                <Text style={styles.medal}>{MEDAL[place]}</Text>
                {placeRows.map(({ entry }) => (
                  <View key={entry.id} style={styles.entryBlock}>
                    <View style={styles.avatarStack}>
                      {entry.members.map((m) => (
                        <TouchableOpacity
                          key={m.club_member_id}
                          disabled={!avatarsClickable}
                          onPress={() => onSelectMember?.(m.club_member_id)}
                          activeOpacity={0.7}
                        >
                          <PlayerAvatar player={{ id: m.club_member_id, full_name: m.full_name, avatar_url: m.avatar_url }} size="sm" />
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.pairName} numberOfLines={2}>
                      {pairLabel(entry)}
                    </Text>
                    <Text style={styles.points}>{entry.points} pts/jugador</Text>
                  </View>
                ))}
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
  column: { flex: 1, alignItems: "center" },
  pedestal: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 8,
  },
  medal: { fontSize: 22 },
  entryBlock: { alignItems: "center", gap: 4 },
  avatarStack: { flexDirection: "row" },
  pairName: { fontSize: 11, color: theme.colors.white, fontWeight: "600", textAlign: "center" },
  points: { fontSize: 10, color: theme.colors.muted },
});
