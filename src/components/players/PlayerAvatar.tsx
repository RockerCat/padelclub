"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

interface PlayerAvatarPlayer {
  id?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

interface PlayerAvatarProps {
  player: PlayerAvatarPlayer;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}

const SIZE_CLASSES: Record<"sm" | "md" | "lg" | "xl" | "2xl", string> = {
  sm: "w-8 h-8 text-[10px]",
  md: "w-10 h-10 text-xs",
  lg: "w-16 h-16 text-lg",
  xl: "w-20 h-20 text-2xl",
  "2xl": "w-24 h-24 text-3xl",
};

// Brand-aligned solid colors — dark teal-family shades derived from
// --color-brand-secondary (#037172), never the bright cyan primary
// (#00ffff), which would fail contrast behind light/white initials text —
// the fallback picks one per player via a stable hash, so avatars vary
// without straying from PadelClub's palette. Kept as flat solid fills on
// purpose — no gradients, no decorative shapes — so it reads as a clean
// initials avatar, not an attempt at an illustration.
const PALETTE = [
  "#037172",
  "#04595A",
  "#0A8A8C",
  "#065658",
  "#0E6B6D",
  "#023F40",
];

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

// Shared avatar for any place that shows a player/member's photo or initials.
// Prefers player.avatar_url (object-cover, falls back to the plain initials
// avatar if it 404s); otherwise renders a flat, solid-color circle (picked
// via a stable hash of id/name) with the player's initials — clean, no
// gradients or decorative shapes.
export function PlayerAvatar({ player, size = "md", className }: PlayerAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!player.avatar_url && !imageFailed;

  const seed = player.id || player.full_name || "?";
  const hash = hashString(seed);
  const backgroundColor = PALETTE[hash % PALETTE.length];
  const initials = getInitials(player.full_name);

  return (
    <div
      className={cn(
        "relative rounded-full overflow-hidden shrink-0 border border-white/10 flex items-center justify-center font-bold text-white",
        SIZE_CLASSES[size],
        className
      )}
      style={showImage ? undefined : { backgroundColor }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- player photos are arbitrary external/storage URLs, not build-time assets
        <img
          src={player.avatar_url!}
          alt={player.full_name ?? "Jugador"}
          className="w-full h-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-label={player.full_name ?? "Jugador"}>{initials}</span>
      )}
    </div>
  );
}
