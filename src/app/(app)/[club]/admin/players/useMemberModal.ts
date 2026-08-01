"use client";

import { useCallback, useRef, useState } from "react";
import { getClubMemberForModal } from "./actions";
import type { MemberRow } from "./MembersClient";

interface UseMemberModalOptions {
  clubId: string;
  // Called after any successful mutation from inside MemberModal (toggle
  // active, adjust points, change category) — only needed by a caller
  // whose own list is client-side state that doesn't reconcile with a
  // refreshed server prop on its own (Ranking's `rows`, set via its own
  // fetchRanking()). A caller whose data already flows straight from
  // props (Torneos' `entries`, which does reconcile — see
  // TournamentDetailView) doesn't need this: MemberModal's own
  // router.refresh() is already enough.
  onMutationSuccess?: () => void;
}

export interface MemberModalController {
  selectedMember: MemberRow | null;
  selectedRankingPosition: number | null;
  loadingMemberId: string | null;
  errorMessage: string | null;
  clearError: () => void;
  openMember: (clubMemberId: string, rankingPosition?: number | null) => Promise<void>;
  closeMember: () => void;
  onMutationSuccess?: () => void;
}

// Single implementation of "open the same Miembro del club modal by
// club_member_id, with a per-row loading state and graceful error
// handling" — first built inline for Ranking, now the one thing Ranking
// and Torneos both use (Jugadores' MembersClient doesn't need it: it
// already has the full row in hand from its own list, no id-based lookup
// required). Reuses the exact same select shape Jugadores' page.tsx runs
// (getClubMemberForModal) — never a second query for the same data, and
// never opens a modal for a club_member_id that doesn't resolve (RLS-
// hidden slot, member no longer resolvable, etc.) — that just surfaces as
// errorMessage, never a blank modal, never a crash.
export function useMemberModal({ clubId, onMutationSuccess }: UseMemberModalOptions): MemberModalController {
  const [selected, setSelected] = useState<{ member: MemberRow; rankingPosition: number | null } | null>(null);
  const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Synchronous mirror of loadingMemberId — React state updates aren't
  // visible until the next render, so a plain `if (loadingMemberId) return`
  // at the top of a fast double-click can't see the first call's already-
  // in-flight request. The ref is read/written synchronously instead.
  const loadingRef = useRef<string | null>(null);

  const openMember = useCallback(
    async (clubMemberId: string, rankingPosition: number | null = null) => {
      if (loadingRef.current) return;
      loadingRef.current = clubMemberId;
      setLoadingMemberId(clubMemberId);

      const result = await getClubMemberForModal(clubId, clubMemberId);

      loadingRef.current = null;
      setLoadingMemberId(null);
      if (result.error || !result.member) {
        setErrorMessage(result.error ?? "No se pudo cargar el jugador. Intenta de nuevo.");
        return;
      }
      setSelected({ member: result.member, rankingPosition });
    },
    [clubId]
  );

  const closeMember = useCallback(() => setSelected(null), []);
  const clearError = useCallback(() => setErrorMessage(null), []);

  return {
    selectedMember: selected?.member ?? null,
    selectedRankingPosition: selected?.rankingPosition ?? null,
    loadingMemberId,
    errorMessage,
    clearError,
    openMember,
    closeMember,
    onMutationSuccess,
  };
}
