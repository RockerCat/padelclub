"use client";

import { useTransition, useState } from "react";
import Link from "next/link";
import { Card, CardContent, Button } from "@/components/ui";
import { CheckCircle } from "lucide-react";
import { claimInvitation } from "./actions";

interface AcceptInviteCardProps {
  token: string;
  clubName: string;
  roleLabel: string;
  clubSlug: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: "Este link de invitación no es válido o ya expiró.",
  max_uses_reached: "Este link ya no está disponible.",
  not_authenticated: "Debes iniciar sesión para continuar.",
  club_archived: "Este club se encuentra archivado y ya no acepta nuevas invitaciones.",
};

export function AcceptInviteCard({
  token,
  clubName,
  roleLabel,
  clubSlug,
}: AcceptInviteCardProps) {
  const [pending, startTransition] = useTransition();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await claimInvitation(token);
      if (!result.success) {
        setError(ERROR_MESSAGES[result.error ?? ""] ?? "Error al procesar la invitación.");
        return;
      }
      setAccepted(true);
    });
  }

  if (accepted) {
    return (
      <Card variant="elevated">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white mb-1">
                ¡Ya eres {roleLabel} de {clubName}!
              </h1>
              <p className="text-sm text-brand-muted">
                Tu acceso ha sido confirmado.
              </p>
            </div>
            <Link href={`/${clubSlug}`} className="w-full">
              <Button size="lg" className="w-full">
                Ir al club
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
          Has sido invitado como{" "}
          <span className="text-white font-medium">{roleLabel}</span>.
        </p>
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-center mb-3">
            {error}
          </p>
        )}
        <Button
          size="lg"
          className="w-full"
          loading={pending}
          onClick={handleAccept}
        >
          Aceptar invitación
        </Button>
      </CardContent>
    </Card>
  );
}
