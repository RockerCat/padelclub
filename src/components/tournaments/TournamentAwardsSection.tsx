"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { Button, ConfirmDialog, Toast } from "@/components/ui";
import { TournamentAwardPairCard } from "./TournamentAwardPairCard";
import { awardTournamentPointsAction } from "@/lib/tournamentAwardActions";
import { tournamentAwardPlacementGroupLabel } from "@/lib/tournamentAwards";
import type { TournamentAwardSummary } from "@/lib/tournamentAwards";

interface TournamentAwardsSectionProps {
  clubId: string;
  tournamentId: string;
  isAdmin: boolean;
  summary: TournamentAwardSummary;
  // Only used to discreetly highlight the signed-in PLAYER's own card when
  // the page already knows their club_member_id safely — never a second
  // query just to find it.
  ownClubMemberId?: string | null;
  revalidatePaths: string[];
}

const PLACEMENT_ORDER = ["champion", "runner_up", "semifinalist", "participant"] as const;

// Único punto de integración en la app para award_tournament_points /
// get_tournament_points_summary. summary siempre llega ya calculado desde
// el servidor (getTournamentPointsSummary) — este componente nunca
// reconstruye puntos ni vuelve a leer el ledger; tras una asignación
// exitosa, se limita a router.refresh() para que el estado "awarded" que
// se muestre venga siempre de una lectura fresca de la RPC, nunca de un
// estado local optimista (pedido explícito, Bloque 2.6 §8).
export function TournamentAwardsSection({
  clubId,
  tournamentId,
  isAdmin,
  summary,
  ownClubMemberId,
  revalidatePaths,
}: TournamentAwardsSectionProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAward() {
    setError(null);
    startTransition(async () => {
      const result = await awardTournamentPointsAction(clubId, tournamentId, revalidatePaths);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      setToastMessage(
        result.alreadyAwarded
          ? "Los puntos de este torneo ya habían sido asignados."
          : "Los puntos del torneo fueron asignados correctamente."
      );
      router.refresh();
    });
  }

  const groupedPairs = PLACEMENT_ORDER.map((placement) => ({
    placement,
    pairs: summary.pairs.filter((pair) => pair.placement === placement),
  })).filter((group) => group.pairs.length > 0);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <h2 className="text-lg font-semibold text-white">Premiación deportiva</h2>

      {summary.state === "pending" && (
        <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
          <p className="text-sm font-semibold text-white mb-1">Premiación pendiente</p>
          <p className="text-sm text-brand-muted">
            Los puntos se podrán asignar cuando todos los partidos del torneo hayan finalizado.
          </p>
        </div>
      )}

      {summary.state === "ready" && (
        <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 flex flex-col gap-3 items-start">
          <p className="text-sm text-white">
            {isAdmin
              ? "El torneo está listo para asignar los puntos deportivos."
              : "Los puntos deportivos todavía no han sido asignados."}
          </p>
          {isAdmin && (
            <Button
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
            >
              Asignar puntos
            </Button>
          )}
        </div>
      )}

      {summary.state === "partial" &&
        (isAdmin ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
            <p className="text-sm font-semibold text-amber-400 mb-1">Asignación incompleta</p>
            <p className="text-sm text-brand-muted">
              Se detectó una inconsistencia en los movimientos de puntos de este torneo. La
              premiación necesita revisión antes de continuar.
            </p>
          </div>
        ) : (
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
            <p className="text-sm text-brand-muted">
              La asignación de puntos de este torneo está en revisión.
            </p>
          </div>
        ))}

      {summary.state === "awarded" && (
        <div className="flex flex-col gap-6">
          {groupedPairs.map(({ placement, pairs }) => (
            <div key={placement} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
                {placement === "champion" && <Trophy className="w-4 h-4 text-amber-400" aria-hidden />}
                {tournamentAwardPlacementGroupLabel(placement)}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pairs.map((pair, index) => (
                  <TournamentAwardPairCard
                    key={pair.entryId ?? `${placement}-${index}`}
                    pair={pair}
                    ownClubMemberId={ownClubMemberId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <ConfirmDialog
          open={confirmOpen}
          title="¿Asignar los puntos del torneo?"
          message={
            "Se otorgarán los puntos de participación y posición final. Si la premiación ya fue completada, el sistema no duplicará los movimientos." +
            (error ? `\n\n${error}` : "")
          }
          confirmLabel="Asignar puntos"
          loading={pending}
          onConfirm={handleAward}
          onCancel={() => {
            setConfirmOpen(false);
            setError(null);
          }}
        />
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
