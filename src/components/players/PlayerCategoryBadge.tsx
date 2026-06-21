import { cn } from "@/lib/utils/cn";
import type { PlayerCategory } from "@/types/database";

// Translucent bg + border + colored text — same visual language as
// src/components/ui/Badge.tsx, just with the extra hues categories need
// (blue, orange) that the generic Badge variants don't cover.
const CATEGORY_STYLES: Record<PlayerCategory, string> = {
  Principiante: "bg-white/10 text-white/70 border-white/20",
  "5ta": "bg-blue-500/15 text-blue-400 border-blue-500/25",
  "4ta": "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  "3ra": "bg-amber-500/15 text-amber-400 border-amber-500/25",
  "2da": "bg-orange-500/15 text-orange-400 border-orange-500/25",
  "1ra": "bg-red-500/15 text-red-400 border-red-500/25",
};

export function getCategoryBadge(category: PlayerCategory): { label: string; className: string } {
  return {
    label: category === "Principiante" ? category : `${category} Categoría`,
    className: CATEGORY_STYLES[category],
  };
}

interface PlayerCategoryBadgeProps {
  category: PlayerCategory;
  size?: "sm" | "md";
  className?: string;
}

export function PlayerCategoryBadge({ category, size = "md", className }: PlayerCategoryBadgeProps) {
  const { label, className: colorClassName } = getCategoryBadge(category);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium border",
        colorClassName,
        size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1",
        className
      )}
    >
      {label}
    </span>
  );
}
