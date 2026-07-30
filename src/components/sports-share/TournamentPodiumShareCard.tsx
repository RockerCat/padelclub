import { Crown } from "lucide-react";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { cn } from "@/lib/utils/cn";
import { ShareCardShell } from "./ShareCardShell";

export interface PodiumSharePlayer {
  clubMemberId: string;
  fullName: string | null;
  avatarDataUrl: string | null;
  // Categoría deportiva REAL de este integrante (nunca la categoría
  // congelada del torneo aplicada por igual a ambos) — resuelta por el
  // caller cruzando entries (ya trae category real por miembro desde
  // Bloque 3.3) con el club_member_id de este jugador en el resumen de
  // premiación. null si ese miembro no tiene estado deportivo resoluble.
  category: string | null;
  totalPoints: number;
}

export interface PodiumSharePair {
  players: PodiumSharePlayer[];
}

interface TournamentPodiumShareCardProps {
  clubName: string;
  clubLogoDataUrl: string | null;
  accentColor: string;
  tournamentName: string;
  categoryLabel: string;
  dateLabel: string;
  generatedAtLabel: string;
  champion: PodiumSharePair | null;
  runnerUp: PodiumSharePair | null;
}

function PairBlock({
  pair,
  place,
  label,
}: {
  pair: PodiumSharePair;
  place: 1 | 2;
  label: string;
}) {
  const medalColor = place === 1 ? "#fbbf24" : "#cbd5e1";
  return (
    <div
      className={cn(
        "rounded-3xl border px-8 py-6 flex flex-col gap-4",
        place === 1 ? "bg-white/[0.08] border-amber-400/30" : "bg-white/[0.04] border-white/15"
      )}
    >
      <div className="flex items-center gap-2.5">
        <Crown className="w-6 h-6" style={{ color: medalColor }} aria-hidden="true" />
        <span className="text-xl font-bold text-white uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex flex-col gap-3">
        {pair.players.map((player) => (
          <div key={player.clubMemberId} className="flex items-center gap-4">
            <PlayerSportAvatar
              player={{ id: player.clubMemberId, full_name: player.fullName, avatar_url: player.avatarDataUrl }}
              size="lg"
              sportCategory={player.category}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xl font-semibold text-white truncate">{player.fullName ?? "Jugador"}</p>
              <p className="text-sm text-white/50 mt-0.5">+{player.totalPoints} puntos</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Bloque 3.4 — podio final del torneo. Solo Campeón/Subcampeón: este
// backend nunca produce un "tercer lugar" real (un torneo de eliminación
// directa deja siempre DOS semifinalistas empatados, nunca uno solo — ver
// Tournament Module Principles/get_tournament_points_summary) — mostrar uno
// de los dos como "tercer puesto" sería inventar un dato que el backend no
// respalda, así que esta tarjeta nunca lo hace.
export function TournamentPodiumShareCard({
  clubName,
  clubLogoDataUrl,
  accentColor,
  tournamentName,
  categoryLabel,
  dateLabel,
  generatedAtLabel,
  champion,
  runnerUp,
}: TournamentPodiumShareCardProps) {
  return (
    <ShareCardShell
      clubName={clubName}
      clubLogoDataUrl={clubLogoDataUrl}
      accentColor={accentColor}
      eyebrow={`Torneo · ${categoryLabel}`}
      title={tournamentName}
      subtitle={dateLabel}
      generatedAtLabel={generatedAtLabel}
    >
      <div className="flex flex-col justify-center gap-6 h-full">
        {champion && <PairBlock pair={champion} place={1} label="Campeones" />}
        {runnerUp && <PairBlock pair={runnerUp} place={2} label="Subcampeones" />}
      </div>
    </ShareCardShell>
  );
}
