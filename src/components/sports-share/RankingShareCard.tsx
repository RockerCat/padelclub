import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { cn } from "@/lib/utils/cn";
import { ShareCardShell } from "./ShareCardShell";

export interface RankingShareRow {
  clubMemberId: string;
  position: number;
  fullName: string | null;
  // Ya resuelto a data URL por el caller (o null → PlayerAvatar cae a
  // iniciales) — esta tarjeta nunca hace fetch de imágenes remotas.
  avatarDataUrl: string | null;
  points: number;
}

interface RankingShareCardProps {
  clubName: string;
  clubLogoDataUrl: string | null;
  accentColor: string;
  category: string;
  generatedAtLabel: string;
  // Ya recortadas a máximo 10 y en el orden exacto entregado por
  // get_club_category_ranking_view — esta tarjeta nunca reordena ni
  // recalcula posiciones.
  rows: RankingShareRow[];
}

// Bloque 3.4 — Top 10 del Ranking para compartir. Reutiliza PlayerSportAvatar
// tal cual (mismo badge de categoría, misma corona de posición 1-2-3) — cero
// lenguaje visual nuevo para medallas/categoría.
export function RankingShareCard({
  clubName,
  clubLogoDataUrl,
  accentColor,
  category,
  generatedAtLabel,
  rows,
}: RankingShareCardProps) {
  return (
    <ShareCardShell
      clubName={clubName}
      clubLogoDataUrl={clubLogoDataUrl}
      accentColor={accentColor}
      eyebrow="Ranking"
      title={`Categoría ${category}`}
      subtitle={`Top ${rows.length}`}
      generatedAtLabel={generatedAtLabel}
    >
      <div className="flex flex-col justify-center gap-2 h-full">
        {rows.map((row) => (
          <div
            key={row.clubMemberId}
            className={cn(
              "flex items-center gap-4 rounded-2xl px-5 py-2.5 shrink-0",
              row.position <= 3 ? "bg-white/[0.08] border border-white/15" : "bg-white/[0.03] border border-white/5"
            )}
          >
            <span className="w-9 text-xl font-black text-white/70 text-center shrink-0 tabular-nums">
              {row.position}
            </span>
            <PlayerSportAvatar
              player={{ id: row.clubMemberId, full_name: row.fullName, avatar_url: row.avatarDataUrl }}
              size="md"
              sportCategory={category}
              rankingPosition={row.position <= 3 ? row.position : null}
            />
            <span className="flex-1 min-w-0 text-lg font-semibold text-white truncate">
              {row.fullName ?? "Jugador"}
            </span>
            <span className="text-xl font-black tabular-nums shrink-0" style={{ color: accentColor }}>
              {row.points}
            </span>
          </div>
        ))}
      </div>
    </ShareCardShell>
  );
}
