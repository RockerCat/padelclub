import { Crown } from "lucide-react-native";

// Traducción 1:1 de src/components/players/RankMedalCrown.tsx (app web) —
// misma paleta oro/plata/bronce.
const MEDAL_COLOR: Record<1 | 2 | 3, string> = {
  1: "#FBBF24",
  2: "#CBD5E1",
  3: "#FB923C",
};

export function RankMedalCrown({ place, size = 16 }: { place: 1 | 2 | 3; size?: number }) {
  return <Crown width={size} height={size} color={MEDAL_COLOR[place]} />;
}
