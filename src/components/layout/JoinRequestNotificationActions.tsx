"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { approveJoinRequest, rejectJoinRequest } from "@/app/(app)/[club]/admin/players/actions";
import type { NotificationRow } from "@/lib/notifications";

type ResolvedStatus = "approved" | "rejected";

interface JoinRequestNotificationActionsProps {
  notification: NotificationRow;
  /** Lets the host (bell dropdown / /notifications) mark this row read
   *  through its own existing read-tracking state — the same update it
   *  already makes on a row click, just triggered here on a resolved action. */
  onResolved?: () => void;
}

// Aprobar/Rechazar for a pending join-request notification. Reuses
// approveJoinRequest/rejectJoinRequest as-is (admin/players/actions.ts) — no
// parallel approval logic, same RPCs, same notification-to-requester side
// effects. Only renders for join_request_created notifications carrying a
// join_request_id (added to metadata by create_join_request as of migration
// 20260729000001); older notifications without it render nothing here and
// fall back to their previous click-to-navigate behavior untouched.
export function JoinRequestNotificationActions({ notification, onResolved }: JoinRequestNotificationActionsProps) {
  const requestId = notification.metadata?.join_request_id;
  const clubId = notification.club_id;
  const clubSlug = notification.clubs?.slug ?? notification.metadata?.club_slug;

  const [resolved, setResolved] = useState<ResolvedStatus | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (notification.type !== "join_request_created" || typeof requestId !== "string" || !clubId || !clubSlug) {
    return null;
  }

  // Re-bound as explicitly-typed consts: the narrowing from the guard above
  // (string | null / string | undefined → string) doesn't survive into the
  // nested `run` closure otherwise.
  const safeRequestId: string = requestId;
  const safeClubId: string = clubId;
  const safeClubSlug: string = clubSlug;

  function run(action: "approve" | "reject") {
    if (isPending) return; // already in flight — ignore a second click
    setError(null);
    setPendingAction(action);
    startTransition(async () => {
      const result = action === "approve"
        ? await approveJoinRequest(safeClubId, safeRequestId, safeClubSlug)
        : await rejectJoinRequest(safeClubId, safeRequestId, safeClubSlug);

      if (result.error) {
        // "Already resolved" (from another tab or the Jugadores section) is
        // not a real failure — look up the real outcome instead of leaving
        // the admin stuck, and only surface an error banner for genuine
        // failures (permission, not-found, network).
        if (result.error === "Esta solicitud ya fue resuelta.") {
          const supabase = createClient();
          const { data } = await supabase
            .from("club_join_requests")
            .select("status")
            .eq("id", safeRequestId)
            .single();
          if (data?.status === "approved" || data?.status === "rejected") {
            setResolved(data.status);
            onResolved?.();
          } else {
            setError(result.error);
          }
        } else {
          setError(result.error);
        }
        setPendingAction(null);
        return;
      }

      setResolved(action === "approve" ? "approved" : "rejected");
      setPendingAction(null);
      onResolved?.();
    });
  }

  if (resolved) {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium shrink-0 ${
          resolved === "approved" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
        }`}
      >
        {resolved === "approved" ? "Aprobada" : "Rechazada"}
      </span>
    );
  }

  // stopPropagation at the wrapper: these rows live inside a clickable
  // notification card (navigate + mark-read on click) — without this, any
  // click here would also fire the card's own handler.
  function stop(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap" onClick={stop}>
      <Button
        type="button"
        size="sm"
        loading={pendingAction === "approve"}
        disabled={isPending}
        onClick={() => run("approve")}
        className="!h-7 !px-2.5 !text-xs"
      >
        Aprobar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        loading={pendingAction === "reject"}
        disabled={isPending}
        onClick={() => run("reject")}
        className="!h-7 !px-2.5 !text-xs"
      >
        Rechazar
      </Button>
      {error && <span className="text-[11px] text-red-400 basis-full">{error}</span>}
    </div>
  );
}
