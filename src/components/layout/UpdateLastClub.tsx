"use client";

import { useEffect } from "react";
import { updateLastClub } from "@/lib/actions/profile";

interface UpdateLastClubProps {
  clubId: string;
}

/**
 * Invisible client component. Fires updateLastClub on mount
 * so the user's last-used club is recorded without blocking render.
 */
export function UpdateLastClub({ clubId }: UpdateLastClubProps) {
  useEffect(() => {
    updateLastClub(clubId).catch(() => {});
  }, [clubId]);

  return null;
}
