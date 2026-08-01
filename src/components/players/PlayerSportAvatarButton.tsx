"use client";

import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { PlayerSportAvatar } from "./PlayerSportAvatar";
import { cn } from "@/lib/utils/cn";

interface PlayerSportAvatarButtonProps extends ComponentProps<typeof PlayerSportAvatar> {
  // false renders the exact same PlayerSportAvatar with zero wrapper —
  // pixel-identical to every other (non-interactive) use of it elsewhere
  // in the app. Never true for PLAYER today (see callers) — MemberModal
  // has no read-only mode yet, so only OWNER/ADMIN ever gets a clickable
  // avatar here.
  clickable: boolean;
  isLoading?: boolean;
  onSelect?: () => void;
  // Used only for the aria-label ("Ver detalle de {nombre}") — never
  // rendered as visible text, per spec (no additional text inside rows).
  playerName: string;
}

// Wraps PlayerSportAvatar — itself left completely untouched, per CLAUDE.md
// ("never re-implement this presentation per screen") — in a real <button>
// only when clickable. Same avatar, same size, same style; the only visual
// addition is a discreet hover/focus ring and (while loading) a spinner
// overlay that doesn't change the avatar's footprint. Shared by every
// surface that opens "Miembro del club" from an individual avatar
// (Torneos' podio/clasificación/inscripciones) — never a second visual
// implementation of "clickable avatar".
export function PlayerSportAvatarButton({
  clickable,
  isLoading = false,
  onSelect,
  playerName,
  ...avatarProps
}: PlayerSportAvatarButtonProps) {
  if (!clickable) {
    return <PlayerSportAvatar {...avatarProps} />;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        // The avatar can sit inside another clickable/menu-bearing row
        // (Clasificación's ContextMenu is a sibling, not an ancestor, but
        // future callers might nest differently) — stopPropagation keeps
        // this strictly a "open this one player" action, never anything
        // else on the row.
        e.stopPropagation();
        onSelect?.();
      }}
      disabled={isLoading}
      aria-label={`Ver detalle de ${playerName}`}
      className={cn(
        "relative inline-flex shrink-0 rounded-full cursor-pointer transition-shadow",
        "hover:ring-2 hover:ring-brand-primary/50",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60",
        "active:scale-95"
      )}
    >
      <PlayerSportAvatar {...avatarProps} />
      {isLoading && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40" aria-hidden="true">
          <Loader2 className="w-1/2 h-1/2 text-white animate-spin" />
        </span>
      )}
    </button>
  );
}
