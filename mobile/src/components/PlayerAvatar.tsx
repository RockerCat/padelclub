import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

// Traducción 1:1 de src/components/players/PlayerAvatar.tsx (app web) —
// misma paleta de fallback, mismo hash estable por id/nombre, mismas
// iniciales.
type AvatarSize = "sm" | "md" | "lg" | "xl" | "2xl";

interface Player {
  id?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

const SIZE_PX: Record<AvatarSize, { box: number; font: number }> = {
  sm: { box: 32, font: 10 },
  md: { box: 40, font: 12 },
  lg: { box: 64, font: 18 },
  xl: { box: 80, font: 24 },
  "2xl": { box: 96, font: 30 },
};

const PALETTE = ["#037172", "#04595A", "#0A8A8C", "#065658", "#0E6B6D", "#023F40"];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function PlayerAvatar({ player, size = "md" }: { player: Player; size?: AvatarSize }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!player.avatar_url && !imageFailed;

  const seed = player.id || player.full_name || "?";
  const hash = hashString(seed);
  const backgroundColor = PALETTE[hash % PALETTE.length];
  const initials = getInitials(player.full_name);
  const { box, font } = SIZE_PX[size];

  return (
    <View
      style={[
        styles.base,
        { width: box, height: box, borderRadius: box / 2, backgroundColor: showImage ? undefined : backgroundColor },
      ]}
    >
      {showImage ? (
        <Image source={{ uri: player.avatar_url! }} style={{ width: box, height: box }} onError={() => setImageFailed(true)} />
      ) : (
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: font }}>{initials}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
});
