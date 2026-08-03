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
  // recalcula posiciones. El rediseño solo cambia cómo se pintan estos
  // mismos datos, nunca su origen ni su orden.
  rows: RankingShareRow[];
}

// Mismo palette fijo de medallas que RankMedalCrown (amber/slate/orange) —
// una identidad de posición que debe leerse igual en cualquier club, nunca
// derivada del accentColor de marca (ver Club Identity Principles: el color
// del club es para identidad, no para comunicar un estado/posición fijo).
const PODIUM_STYLE: Record<1 | 2 | 3, { block: string; numeral: string; avatar: string }> = {
  1: { block: "linear-gradient(180deg, rgba(251,191,36,0.32) 0%, rgba(251,191,36,0.05) 100%)", numeral: "#fbbf24", avatar: "w-40 h-40" },
  2: { block: "linear-gradient(180deg, rgba(203,213,225,0.28) 0%, rgba(203,213,225,0.05) 100%)", numeral: "#cbd5e1", avatar: "w-28 h-28" },
  3: { block: "linear-gradient(180deg, rgba(251,146,60,0.28) 0%, rgba(251,146,60,0.05) 100%)", numeral: "#fb923c", avatar: "w-28 h-28" },
};

const PODIUM_BLOCK_HEIGHT: Record<1 | 2 | 3, number> = { 1: 208, 2: 148, 3: 116 };

function getByPosition(rows: RankingShareRow[], position: 1 | 2 | 3): RankingShareRow | undefined {
  return rows.find((r) => r.position === position);
}

function PodiumColumn({ row, place, category }: { row: RankingShareRow; place: 1 | 2 | 3; category: string }) {
  const style = PODIUM_STYLE[place];
  return (
    <div className={cn("flex flex-col items-center", place === 1 ? "w-[300px]" : "w-[240px]")}>
      <PlayerSportAvatar
        player={{ id: row.clubMemberId, full_name: row.fullName, avatar_url: row.avatarDataUrl }}
        size="2xl"
        avatarClassName={cn(style.avatar, "border-4")}
        sportCategory={category}
        rankingPosition={place}
      />
      <p
        className={cn(
          "font-bold text-white text-center truncate w-full mt-4",
          place === 1 ? "text-2xl" : "text-xl"
        )}
      >
        {row.fullName ?? "Jugador"}
      </p>
      <p className={cn("font-black tabular-nums mt-1", place === 1 ? "text-3xl" : "text-2xl")} style={{ color: style.numeral }}>
        {row.points} pts
      </p>
      <div
        className="w-full mt-4 rounded-t-2xl border-x border-t border-white/15 flex items-start justify-center pt-3 shrink-0"
        style={{ height: PODIUM_BLOCK_HEIGHT[place], background: style.block }}
      >
        <span className="font-black leading-none" style={{ color: style.numeral, fontSize: place === 1 ? 96 : 72 }}>
          {place}
        </span>
      </div>
    </div>
  );
}

function ListRow({ row, accentColor }: { row: RankingShareRow; accentColor: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/8 px-4 py-2.5 min-w-0">
      <span className="w-7 text-lg font-black text-white/45 text-center shrink-0 tabular-nums">{row.position}</span>
      <PlayerSportAvatar
        player={{ id: row.clubMemberId, full_name: row.fullName, avatar_url: row.avatarDataUrl }}
        size="md"
      />
      <span className="flex-1 min-w-0 text-base font-semibold text-white truncate">{row.fullName ?? "Jugador"}</span>
      <span className="text-lg font-black tabular-nums shrink-0" style={{ color: accentColor }}>
        {row.points}
      </span>
    </div>
  );
}

// Rediseño "póster deportivo" del Top 10 — el podio (1º-3º) es el
// protagonista visual (avatares grandes, bloques elevados con el color fijo
// de medalla), el 4º-10º baja a un listado compacto debajo. Mismos datos,
// mismo orden que antes (RankingShareRow no cambió) — solo cambia cómo se
// pintan. Reutiliza PlayerSportAvatar/RankMedalCrown tal cual (nunca
// reimplementa la identidad deportiva del jugador, ver Sport/Ranking Module
// Principles): sportCategory + rankingPosition siguen siendo los únicos
// responsables de la esquina de categoría y la corona.
export function RankingShareCard({
  clubName,
  clubLogoDataUrl,
  accentColor,
  category,
  generatedAtLabel,
  rows,
}: RankingShareCardProps) {
  const first = getByPosition(rows, 1);
  const second = getByPosition(rows, 2);
  const third = getByPosition(rows, 3);
  const rest = rows.filter((r) => r.position > 3);

  return (
    <ShareCardShell
      clubName={clubName}
      clubLogoDataUrl={clubLogoDataUrl}
      accentColor={accentColor}
      eyebrow="Ranking oficial"
      title={`Categoría ${category}`}
      subtitle={`Top ${rows.length}`}
      generatedAtLabel={generatedAtLabel}
    >
      <div className="flex flex-col h-full gap-8">
        {/* Podio — protagonista. Orden visual clásico (2º-1º-3º), 1º
            elevado sobre los otros dos vía bloque más alto y avatar más
            grande, nunca vía reordenamiento de los datos reales. */}
        {(first || second || third) && (
          <div className="flex items-end justify-center gap-6 shrink-0">
            {second && <PodiumColumn row={second} place={2} category={category} />}
            {first && <PodiumColumn row={first} place={1} category={category} />}
            {third && <PodiumColumn row={third} place={3} category={category} />}
          </div>
        )}

        {/* Listado 4º-10º — compacto, dos columnas para ocupar poco
            espacio vertical. */}
        {rest.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 flex-1 min-h-0 content-start">
            {rest.map((row) => (
              <ListRow key={row.clubMemberId} row={row} accentColor={accentColor} />
            ))}
          </div>
        )}
      </div>
    </ShareCardShell>
  );
}
