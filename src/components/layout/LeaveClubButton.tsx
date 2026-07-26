"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resolveClubEntryPath } from "@/lib/utils/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { leaveClub } from "@/app/(app)/[club]/home/actions";

// PLAYER-only "Salir del club" (Phase 5) — the single shared trigger +
// ConfirmDialog + leaveClub-calling logic, reused everywhere the action is
// exposed (currently: AppNav's NavContent, which itself is shared by the
// desktop sidebar and the PLAYER's mobile drawer — see AppNav.tsx). Never a
// second implementation: this is the only place that calls leaveClub or
// resolveClubEntryPath for this action.
//
// Deliberately styled to read as a secondary/destructive MEMBERSHIP action
// (a different icon and a red-tinted resting state), distinct at a glance
// from the neutral "Salir" session-logout row it sits next to.
export function LeaveClubButton({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await leaveClub(clubId);
      if (result.error) {
        setError(result.error);
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const destination = user ? await resolveClubEntryPath(supabase, user.id) : "/clubs";

      setConfirmOpen(false);
      router.refresh();
      // replace (not push): the abandoned club's route must never be
      // reachable again via the back button once the player has left it.
      router.replace(destination);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/5 transition-colors w-full text-left"
      >
        <UserMinus className="w-4 h-4 shrink-0" />
        <span>Salir del club</span>
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="Salir del club"
        message={
          "Perderás acceso a este club. Tus reservas futuras propias serán canceladas y dejarás de participar en reservas futuras creadas por otros jugadores. Tu historial se conservará." +
          (error ? `\n\n${error}` : "")
        }
        confirmLabel="Salir del club"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        loading={pending}
        onConfirm={handleConfirm}
        onCancel={() => {
          setConfirmOpen(false);
          setError(null);
        }}
      />
    </>
  );
}
