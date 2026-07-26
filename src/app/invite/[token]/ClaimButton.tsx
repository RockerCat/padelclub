"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { claimInvitation } from "./actions";

interface ClaimButtonProps {
  token: string;
}

export function ClaimButton({ token }: ClaimButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClaim() {
    setError(null);
    startTransition(async () => {
      const result = await claimInvitation(token);
      if (!result.success) {
        const messages: Record<string, string> = {
          invalid_token: "Este link de invitación no es válido o ya expiró.",
          max_uses_reached: "Este link ya no está disponible.",
          not_authenticated: "Debes iniciar sesión para continuar.",
          club_archived: "Este club se encuentra archivado y ya no acepta nuevas invitaciones.",
        };
        setError(messages[result.error ?? ""] ?? "Error al procesar la invitación.");
        return;
      }
      router.push(`/${result.clubSlug}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-center">
          {error}
        </p>
      )}
      <Button size="lg" className="w-full" loading={pending} onClick={handleClaim}>
        Unirme al club
      </Button>
    </div>
  );
}
