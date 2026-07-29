"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { Button, ConfirmDialog, Toast } from "@/components/ui";
import { BracketView } from "./BracketView";
import { generateTournamentBracketAction } from "@/lib/tournamentBracketActions";
import type { BracketRound } from "@/lib/tournamentBracket";
import type { TournamentEntriesCapacity } from "@/lib/tournamentEntries";
import type { Tournament } from "@/types/database";

interface BracketSectionProps {
  tournament: Pick<Tournament, "id" | "club_id" | "status" | "bracket_size">;
  rounds: BracketRound[];
  capacity: TournamentEntriesCapacity;
  isAdmin: boolean;
  revalidatePaths: string[];
}

export function BracketSection({ tournament, rounds, capacity, isAdmin, revalidatePaths }: BracketSectionProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasBracket = rounds.length > 0;
  const readyToGenerate = tournament.status === "registration_closed" && capacity.confirmed === capacity.total;

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateTournamentBracketAction(tournament.club_id, tournament.id, revalidatePaths);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      setToastMessage("Cuadro generado correctamente");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <h2 className="text-lg font-semibold text-white">Cuadro del torneo</h2>

      {hasBracket ? (
        <BracketView rounds={rounds} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center justify-center py-12 text-center bg-brand-surface border border-white/10 rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
              <Trophy className="w-6 h-6 text-brand-muted" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">Cuadro pendiente</h3>
            <p className="text-sm text-brand-muted max-w-sm">
              {tournament.status === "draft" &&
                "El cuadro estará disponible después de cerrar las inscripciones."}
              {tournament.status === "registration_open" &&
                "Cierra las inscripciones cuando el torneo tenga todas las parejas confirmadas."}
              {tournament.status === "registration_closed" &&
                (readyToGenerate
                  ? "El torneo está listo para generar el cuadro."
                  : isAdmin
                  ? "Aún no están confirmadas todas las parejas necesarias."
                  : "El cuadro todavía no ha sido generado.")}
              {tournament.status === "cancelled" && "El torneo fue cancelado antes de generar el cuadro."}
              {!isAdmin &&
                !["draft", "registration_open", "registration_closed", "cancelled"].includes(tournament.status) &&
                "El cuadro todavía no ha sido generado."}
            </p>
            {tournament.status === "registration_closed" && (
              <p className="text-xs text-brand-muted mt-2">
                {capacity.confirmed} de {capacity.total} parejas confirmadas
              </p>
            )}
          </div>

          {isAdmin && tournament.status === "registration_closed" && readyToGenerate && (
            <Button onClick={() => setConfirmOpen(true)} className="self-start">
              Generar cuadro
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="¿Generar el cuadro del torneo?"
        message={
          "Las parejas confirmadas se distribuirán aleatoriamente en la primera ronda. Después de generar el cuadro no podrás volver a modificar las inscripciones." +
          (error ? `\n\n${error}` : "")
        }
        confirmLabel="Generar cuadro"
        loading={pending}
        onConfirm={handleGenerate}
        onCancel={() => {
          setConfirmOpen(false);
          setError(null);
        }}
      />

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
