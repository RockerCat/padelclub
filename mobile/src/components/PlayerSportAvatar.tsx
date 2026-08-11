import { StyleSheet, Text, View } from "react-native";
import { PlayerAvatar } from "./PlayerAvatar";
import { RankMedalCrown } from "./RankMedalCrown";
import { theme } from "../lib/theme";

type AvatarSize = "sm" | "md" | "lg" | "xl" | "2xl";

interface Player {
  id?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

// Traducción 1:1 de src/components/players/PlayerSportAvatar.tsx (app
// web) — misma paleta por código de categoría, misma esquina integrada al
// círculo (nunca un badge aparte), misma corona (solo Top 3).
const SPORT_CATEGORY_COLOR: Record<string, string> = {
  "7a": "#64748B",
  "6a": "#8B5CF6",
  "5a": "#3B82F6",
  "4a": "#14B8A6",
  "3a": "#10B981",
  "2a": "#F59E0B",
  "1a": "#EF4444",
};

const CORNER: Record<AvatarSize, { size: number; font: number }> = {
  sm: { size: 14, font: 7 },
  md: { size: 16, font: 7.5 },
  lg: { size: 14, font: 7 },
  xl: { size: 16, font: 8 },
  "2xl": { size: 20, font: 9 },
};

export function PlayerSportAvatar({
  player,
  size = "md",
  sportCategory,
  rankingPosition,
}: {
  player: Player;
  size?: AvatarSize;
  sportCategory?: string | null;
  rankingPosition?: number | null;
}) {
  const showCorner = !!sportCategory;
  const showCrown = rankingPosition === 1 || rankingPosition === 2 || rankingPosition === 3;
  const corner = CORNER[size];

  return (
    <View style={styles.wrap}>
      <PlayerAvatar player={player} size={size} />

      {showCorner && (
        <View
          style={[
            styles.corner,
            {
              width: corner.size,
              height: corner.size,
              backgroundColor: SPORT_CATEGORY_COLOR[sportCategory!] ?? "rgba(255,255,255,0.2)",
            },
          ]}
        >
          <Text style={[styles.cornerText, { fontSize: corner.font }]}>{sportCategory}</Text>
        </View>
      )}

      {showCrown && (
        <View style={styles.crownCircle}>
          <RankMedalCrown place={rankingPosition as 1 | 2 | 3} size={12} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", alignSelf: "flex-start" },
  corner: {
    position: "absolute",
    bottom: -2,
    right: -2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cornerText: { color: theme.colors.white, fontWeight: "700", lineHeight: undefined },
  crownCircle: {
    position: "absolute",
    top: -6,
    left: "50%",
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
});
