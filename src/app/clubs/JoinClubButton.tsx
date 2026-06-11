"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinClub } from "./actions";

interface JoinClubButtonProps {
  clubId: string;
  primaryColor: string;
}

export function JoinClubButton({ clubId, primaryColor }: JoinClubButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const result = await joinClub(clubId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        onClick={handleJoin}
        disabled={isPending}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
        style={{
          backgroundColor: `${primaryColor}22`,
          color: primaryColor,
          border: `1px solid ${primaryColor}44`,
        }}
      >
        {isPending ? "Uniéndome…" : "Unirme"}
      </button>
      {error && (
        <p className="text-[10px] text-red-400 text-right max-w-[120px]">{error}</p>
      )}
    </div>
  );
}
