"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { Button, Toast } from "@/components/ui";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { setTournamentEntryPointsAction } from "@/lib/tournamentEntryActions";
import { computeTournamentClassification, type TournamentEntryWithMembers } from "@/lib/tournamentEntries";

interface ClassificationSectionProps {
  clubId: string;
  tournamentId: string;
  entries: TournamentEntryWithMembers[];
  // in_progress → editable, en la misma página, sin modal ni autosave.
  // completed → solo lectura, con tratamiento visual de podio.
  editable: boolean;
  revalidatePaths: string[];
}

function pairLabel(entry: TournamentEntryWithMembers): string {
  return entry.members.map((m) => m.full_name ?? "Jugador").join(" / ");
}

// Página principal del torneo también como editor de clasificación
// durante in_progress (Bloque 2 §7): sin modal, sin popup, sin autosave —
// todos los cambios se guardan juntos con un único botón "Guardar
// puntos", vía set_tournament_entry_points (atómica). El orden de las
// filas mientras se edita refleja la última clasificación guardada, no
// una vista previa en vivo mientras se escribe — evita que las filas
// salten de posición bajo el cursor del organizador; el reordenamiento
// real ocurre después de guardar, cuando llegan los datos frescos.
export function ClassificationSection({
  clubId,
  tournamentId,
  entries,
  editable,
  revalidatePaths,
}: ClassificationSectionProps) {
  const router = useRouter();
  const confirmedEntries = useMemo(() => entries.filter((e) => e.status === "confirmed"), [entries]);
  const classification = useMemo(() => computeTournamentClassification(entries), [entries]);

  const [draftPoints, setDraftPoints] = useState<Record<string, string>>(() =>
    Object.fromEntries(confirmedEntries.map((e) => [e.id, String(e.points)]))
  );
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handlePointsChange(entryId: string, value: string) {
    setDraftPoints((prev) => ({ ...prev, [entryId]: value }));
  }

  function handleSave() {
    setError(null);

    const parsed: { entryId: string; points: number }[] = [];
    for (const entry of confirmedEntries) {
      const raw = draftPoints[entry.id] ?? "0";
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        setError(`Los puntos de "${pairLabel(entry)}" deben ser un número entero mayor o igual a cero.`);
        return;
      }
      parsed.push({ entryId: entry.id, points: value });
    }

    startTransition(async () => {
      const result = await setTournamentEntryPointsAction(clubId, tournamentId, parsed, revalidatePaths);
      if (result.error) {
        setError(result.error);
        return;
      }
      setToastMessage("Puntos guardados correctamente");
      router.refresh();
    });
  }

  if (confirmedEntries.length === 0) {
    return <p className="text-sm text-brand-muted">Aún no hay parejas confirmadas.</p>;
  }

  // Modo edición: orden estable (última clasificación guardada), nunca
  // reordenado mientras el organizador escribe.
  const editRows = editable
    ? classification.filter(({ entry }) => entry.status === "confirmed")
    : classification;

  // Podio: toda dupla cuya posición OFICIAL (ya calculada por
  // computeTournamentClassification, con salto de posición en empates) es
  // 1, 2 o 3 — nunca las primeras 3 filas del arreglo, que con empates
  // podrían no corresponder a esas posiciones. Nunca una segunda fuente de
  // clasificación: es un filtro sobre `classification`, calculada una sola
  // vez arriba y reutilizada tanto aquí como en la lista completa de abajo.
  const podium = !editable ? classification.filter(({ position }) => position <= 3) : [];

  function renderRow(entry: TournamentEntryWithMembers, position: number, variant: "podium" | "list") {
    const isPodium = variant === "podium";
    return (
      <div
        key={`${variant}-${entry.id}`}
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
          isPodium ? "border-amber-400/30 bg-amber-400/[0.06]" : "border-white/10 bg-brand-surface"
        }`}
      >
        <div className="flex items-center gap-2 w-9 shrink-0">
          {isPodium && <Trophy className={`w-4 h-4 ${position === 1 ? "text-amber-400" : "text-white/40"}`} />}
          <span className="text-sm font-semibold text-white">{position}</span>
        </div>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          {entry.members.map((m) => (
            <PlayerSportAvatar
              key={m.club_member_id}
              player={{ id: m.club_member_id, full_name: m.full_name, avatar_url: m.avatar_url }}
              size="sm"
              sportCategory={m.category ?? entry.category}
            />
          ))}
          <span className="text-sm text-white truncate min-w-0">{pairLabel(entry)}</span>
        </div>

        {editable ? (
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={draftPoints[entry.id] ?? "0"}
            onChange={(e) => handlePointsChange(entry.id, e.target.value)}
            className="w-20 h-10 shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 text-center text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50"
            aria-label={`Puntos de ${pairLabel(entry)}`}
          />
        ) : (
          <span className="text-sm font-medium text-brand-muted shrink-0">{entry.points} pts</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!editable && podium.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-brand-muted uppercase tracking-wide">Podio</h3>
          <div className="flex flex-col gap-2">
            {podium.map(({ entry, position }) => renderRow(entry, position, "podium"))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {!editable && (
          <h3 className="text-xs font-semibold text-brand-muted uppercase tracking-wide">Clasificación completa</h3>
        )}
        <div className="flex flex-col gap-2">
          {editRows.map(({ entry, position }) => renderRow(entry, position, "list"))}
        </div>
      </div>

      {editable && (
        <>
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
          )}
          <Button size="sm" loading={pending} onClick={handleSave} className="self-start">
            Guardar puntos
          </Button>
        </>
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
