"use client";

import { MemberModal } from "./MemberModal";
import { Toast } from "@/components/ui";
import type { MemberModalController } from "./useMemberModal";
import type { SportCategory } from "@/types/database";

interface MemberModalHostProps {
  controller: MemberModalController;
  clubId: string;
  clubSlug: string;
  sportCategories: SportCategory[];
}

// Renders the shared "Miembro del club" modal (+ its fetch-error toast)
// for whatever useMemberModal() controller is driving it — the one place
// that turns the hook's state into the actual modal, reused by Ranking and
// Torneos. Jugadores' MembersClient doesn't use this: it renders
// MemberModal directly, since it never needs useMemberModal's id-based
// fetch (see that hook's own note).
export function MemberModalHost({ controller, clubId, clubSlug, sportCategories }: MemberModalHostProps) {
  return (
    <>
      {controller.selectedMember && (
        <MemberModal
          member={controller.selectedMember}
          clubId={clubId}
          clubSlug={clubSlug}
          sportCategories={sportCategories}
          rankingPosition={controller.selectedRankingPosition}
          onClose={controller.closeMember}
          onMutationSuccess={controller.onMutationSuccess}
        />
      )}
      <Toast message={controller.errorMessage} onDismiss={controller.clearError} />
    </>
  );
}
