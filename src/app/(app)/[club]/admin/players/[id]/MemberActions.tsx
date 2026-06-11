"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toggleMemberActive, changeMemberRole } from "../actions";

interface MemberActionsProps {
  clubId: string;
  clubSlug: string;
  memberId: string;
  memberRole: "OWNER" | "ADMIN" | "PLAYER";
  isActive: boolean;
  callerRole: "OWNER" | "ADMIN";
  isSelf: boolean;
}

export function MemberActions({
  clubId,
  clubSlug,
  memberId,
  memberRole,
  isActive,
  callerRole,
  isSelf,
}: MemberActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [toggling, startToggle] = useTransition();
  const [changing, startChange] = useTransition();

  const canToggle = !isSelf && memberRole !== "OWNER";
  const canChangeRole = callerRole === "OWNER" && !isSelf && memberRole !== "OWNER";

  function handleToggle() {
    setError(null);
    startToggle(async () => {
      const result = await toggleMemberActive(clubId, memberId, !isActive, clubSlug);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleRoleChange(newRole: "ADMIN" | "PLAYER") {
    setError(null);
    startChange(async () => {
      const result = await changeMemberRole(clubId, memberId, newRole, clubSlug);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  if (!canToggle && !canChangeRole) return null;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {canToggle && (
          <Button
            variant={isActive ? "danger" : "secondary"}
            size="md"
            loading={toggling}
            onClick={handleToggle}
          >
            {isActive ? "Desactivar miembro" : "Activar miembro"}
          </Button>
        )}

        {canChangeRole && memberRole === "PLAYER" && (
          <Button
            variant="secondary"
            size="md"
            loading={changing}
            onClick={() => handleRoleChange("ADMIN")}
          >
            Promover a Admin
          </Button>
        )}

        {canChangeRole && memberRole === "ADMIN" && (
          <Button
            variant="secondary"
            size="md"
            loading={changing}
            onClick={() => handleRoleChange("PLAYER")}
          >
            Degradar a Jugador
          </Button>
        )}
      </div>
    </div>
  );
}
