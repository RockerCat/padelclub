"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface JoinRequestsListenerProps {
  clubId: string;
}

// Realtime is the primary path; focus/visibilitychange refetch and this
// poll are the mandatory fallback (never rely on Realtime alone) — only
// ticks while the tab is visible.
const POLL_INTERVAL_MS = 30_000;

const isDev = process.env.NODE_ENV === "development";

// Invisible — keeps the layout's pendingJoinRequests badge count and (when
// that's the active route) the Jugadores page's JoinRequestsSection list
// live for OWNER/ADMIN. router.refresh() re-runs the Server Components
// that actually own this data (the layout and, if mounted, the players
// page) — no parallel client-side data-fetching path, no duplicated state.
// RLS (club_join_requests_select) is still the real security boundary —
// Realtime only ever delivers rows the subscriber could already SELECT;
// the club_id filter below is a relevance/efficiency scope, not security.
export function JoinRequestsListener({ clubId }: JoinRequestsListenerProps) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`club_join_requests:${clubId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "club_join_requests",
          filter: `club_id=eq.${clubId}`,
        },
        (payload) => {
          if (isDev) console.debug("[JoinRequestsListener] INSERT", payload);
          router.refresh();
        }
      )
      .subscribe((status, err) => {
        if (isDev) console.debug("[JoinRequestsListener] channel status:", status, err ?? "");
      });

    function refetchIfVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    window.addEventListener("focus", refetchIfVisible);
    document.addEventListener("visibilitychange", refetchIfVisible);
    const interval = setInterval(refetchIfVisible, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", refetchIfVisible);
      document.removeEventListener("visibilitychange", refetchIfVisible);
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [clubId, router]);

  return null;
}
