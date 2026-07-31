import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { cn } from "@/lib/utils/cn";
import type { TournamentClassificationRow } from "@/lib/tournamentEntries";

interface NewsTournamentChampionsProps {
  // Ya filtradas a position === 1 por el llamador — computeTournamentClassification
  // es la única fuente de la posición oficial, nunca recalculada aquí. Con
  // empate en primer lugar, `champions` trae más de una dupla; todas se
  // muestran dentro de este mismo bloque, nunca uno separado por dupla.
  champions: TournamentClassificationRow[];
  categoryLabel: string | null;
}

// Referencia editorial compacta a la dupla (o duplas, si hay empate)
// campeona de un torneo — nunca un segundo podio completo. Solo se monta
// cuando existen campeones reales que mostrar; el llamador decide cuándo
// eso aplica (news.tournament_id presente, torneo recuperado, al menos
// una dupla en position === 1).
export function NewsTournamentChampions({ champions, categoryLabel }: NewsTournamentChampionsProps) {
  if (champions.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span role="img" aria-label="Medalla de oro" className="text-base leading-none">
          🥇
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Campeones</span>
        {categoryLabel && <span className="ml-auto text-[11px] text-brand-muted shrink-0">{categoryLabel}</span>}
      </div>

      <div className="flex flex-col gap-3">
        {champions.map((row, i) => (
          <div key={row.entry.id} className={cn("flex flex-col gap-1.5", i > 0 && "pt-3 border-t border-amber-400/10")}>
            {row.entry.members.map((m) => (
              <div key={m.club_member_id} className="flex items-center gap-2.5 min-w-0">
                <PlayerSportAvatar
                  player={{ id: m.club_member_id, full_name: m.full_name, avatar_url: m.avatar_url }}
                  size="sm"
                  avatarClassName="ring-2 ring-brand-surface shrink-0"
                />
                <span className="text-sm font-medium text-white truncate min-w-0">{m.full_name ?? "Jugador"}</span>
              </div>
            ))}
            {/* Nunca "X pts" ambiguo — el monto completo por jugador, no
                dividido entre los dos (mismo entry.points ya persistido,
                ninguna cuenta nueva). */}
            <span className="text-xs font-medium text-amber-300">{row.entry.points} pts por jugador</span>
          </div>
        ))}
      </div>
    </div>
  );
}
