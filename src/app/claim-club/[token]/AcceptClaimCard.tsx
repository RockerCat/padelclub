"use client";

import { useTransition, useState } from "react";
import Link from "next/link";
import { Card, CardContent, Button } from "@/components/ui";
import { CheckCircle } from "lucide-react";
import { claimClub } from "./actions";
import { getClubEntryPath } from "@/lib/utils/navigation";

interface AcceptClaimCardProps {
  token: string;
  clubName: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "Este enlace de entrega no es válido.",
  already_claimed: "Este club ya fue reclamado.",
  revoked: "Este enlace ha sido revocado.",
  already_owned: "Este club ya tiene un propietario activo.",
  account_type_incompatible:
    "Tu cuenta ya tiene un rol distinto (jugador, administrador o del equipo de la plataforma) y no puede convertirse en propietario.",
  cannot_claim_own_placeholder: "No puedes reclamar un club con la misma cuenta que lo preparó.",
  not_authenticated: "Debes iniciar sesión para continuar.",
};

export function AcceptClaimCard({ token, clubName }: AcceptClaimCardProps) {
  const [pending, startTransition] = useTransition();
  const [claimedSlug, setClaimedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await claimClub(token);
      if (!result.success) {
        setError(ERROR_MESSAGES[result.error] ?? "No se pudo completar la entrega. Intenta de nuevo.");
        return;
      }
      setClaimedSlug(result.clubSlug);
    });
  }

  if (claimedSlug) {
    return (
      <Card variant="elevated">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white mb-1">¡{clubName} ahora es tuyo!</h1>
              <p className="text-sm text-brand-muted">Ya eres el propietario de este club.</p>
            </div>
            <Link href={getClubEntryPath(claimedSlug, "OWNER")} className="w-full">
              <Button size="lg" className="w-full">
                Ir al panel del club
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <CardContent className="pt-6">
        <p className="text-sm text-brand-muted text-center mb-5">
          Este club fue preparado para ti. Crea tu acceso para comenzar a administrarlo.
        </p>
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-center mb-3">
            {error}
          </p>
        )}
        <Button size="lg" className="w-full" loading={pending} onClick={handleAccept}>
          Aceptar la entrega
        </Button>
      </CardContent>
    </Card>
  );
}
