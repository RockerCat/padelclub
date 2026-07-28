import { Crown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Same gold/silver/bronze palette as the Ranking podium (amber-400 /
// slate-300 / orange-400) — kept as its own small piece so this (Jugadores)
// and Ranking can each render a crown without importing across route
// folders, while still looking identical.
const MEDAL_COLOR: Record<1 | 2 | 3, string> = {
  1: "text-amber-400",
  2: "text-slate-300",
  3: "text-orange-400",
};

interface RankMedalCrownProps {
  place: 1 | 2 | 3;
  className?: string;
}

export function RankMedalCrown({ place, className }: RankMedalCrownProps) {
  return <Crown className={cn("w-4 h-4", MEDAL_COLOR[place], className)} aria-hidden="true" />;
}
