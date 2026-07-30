import { PlayerAvatar } from "./PlayerAvatar";
import { RankMedalCrown } from "./RankMedalCrown";
import { cn } from "@/lib/utils/cn";

type AvatarSize = "sm" | "md" | "lg" | "xl" | "2xl";

interface PlayerSportAvatarPlayer {
  id?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

interface PlayerSportAvatarProps {
  player: PlayerSportAvatarPlayer;
  size?: AvatarSize;
  // Fase 1 módulo deportivo — categoría vigente del jugador (código del
  // catálogo sport_categories: "6a", "5a", ...), no la categoría general
  // (Principiante/5ta/...) que ya cubre PlayerCategoryBadge. null/undefined
  // = sin categoría deportiva todavía, el avatar se ve exactamente igual
  // que antes de este componente.
  sportCategory?: string | null;
  // Posición vigente en el ranking de esa misma categoría. Solo 1, 2 o 3
  // dibujan la corona; cualquier otro valor (o ausencia) no dibuja nada.
  rankingPosition?: number | null;
  // Clases del contenedor relativo (posicionamiento/margen externo) — nunca
  // llega al círculo del avatar en sí.
  className?: string;
  // Bloque 3.3 — pasa directo al PlayerAvatar interno (tailwind-merge
  // dentro de PlayerAvatar ya resuelve el conflicto con SIZE_CLASSES[size]
  // de forma segura). Permite que un caller con tamaños responsivos
  // propios (p. ej. el podio del Ranking) siga usando su propio ancho/alto
  // por breakpoint sin perder la esquina de categoría ni la corona.
  avatarClassName?: string;
}

// Paleta propia del código de categoría deportiva (7a..1a) — sport_categories
// no tiene columna de color, así que esta paleta ordenada por sort_order es,
// desde aquí en adelante, el color "oficial" de cada categoría en toda la
// app. Mismo precedente que PlayerCategoryBadge.CATEGORY_STYLES para la otra
// clasificación (Principiante/5ta/...): un mapa fijo, no calculado.
const SPORT_CATEGORY_COLOR: Record<string, string> = {
  "7a": "bg-slate-500",
  "6a": "bg-violet-500",
  "5a": "bg-blue-500",
  "4a": "bg-teal-500",
  "3a": "bg-emerald-500",
  "2a": "bg-amber-500",
  "1a": "bg-red-500",
};

// Bloque 3.3 — la categoría debe ser legible también en avatares pequeños
// (filas de Ranking, tarjetas de Torneos, listas compactas de Jugadores),
// así que la esquina ahora cubre todos los tamaños, no solo lg+. sm/md usan
// una esquina proporcionalmente más chica (nunca desborda el círculo).
const CORNER_SIZE: Record<AvatarSize, string> = {
  // Bloque 3.5 — sm/md ligeramente más grandes que la versión original de
  // Bloque 3.3 (6px/6.5px): dos caracteres a esa escala son difíciles de
  // leer en pantalla real; sigue sin desbordar el círculo de 32px/40px.
  sm: "w-3.5 h-3.5 text-[7px]",
  md: "w-4 h-4 text-[7.5px]",
  lg: "w-3.5 h-3.5 text-[7px]",
  xl: "w-4 h-4 text-[8px]",
  "2xl": "w-5 h-5 text-[9px]",
};

// Identidad deportiva unificada del avatar de un jugador — envuelve
// PlayerAvatar (foto/iniciales sin cambios) y superpone, cuando aplica:
// 1) la categoría deportiva vigente como una pequeña esquina integrada al
//    círculo (nunca un badge aparte, nunca texto debajo), y
// 2) la corona de Ranking (mismo componente, RankMedalCrown) si el jugador
//    está en el Top 3 de su categoría — nunca un número de posición.
// Nunca aumenta el tamaño del avatar (todo lo agregado es absolute, fuera
// del flujo) y nunca tapa las iniciales (esquina en la orilla inferior
// derecha, corona apenas rozando la orilla superior).
export function PlayerSportAvatar({
  player,
  size = "md",
  sportCategory,
  rankingPosition,
  className,
  avatarClassName,
}: PlayerSportAvatarProps) {
  const showCorner = !!sportCategory;
  const showCrown = rankingPosition === 1 || rankingPosition === 2 || rankingPosition === 3;
  const medalLabel =
    rankingPosition === 1 ? "Medalla de oro — 1er lugar" : rankingPosition === 2 ? "Medalla de plata — 2do lugar" : "Medalla de bronce — 3er lugar";

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <PlayerAvatar player={player} size={size} className={avatarClassName} />

      {showCorner && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-md border border-brand-surface flex items-center justify-center font-bold text-white leading-none",
            SPORT_CATEGORY_COLOR[sportCategory!] ?? "bg-white/20",
            CORNER_SIZE[size]
          )}
        >
          {sportCategory}
        </span>
      )}

      {showCrown && (
        // role="img" + aria-label — la corona nunca depende solo del color
        // para distinguir oro/plata/bronce (RankMedalCrown usa el mismo
        // ícono para las 3, diferenciado solo por color); el número real de
        // `rankingPosition` sigue siendo la fuente visible en las filas del
        // Ranking (esto nunca lo reemplaza, ver RankingView).
        <span
          role="img"
          aria-label={medalLabel}
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-brand-surface border border-white/10 flex items-center justify-center"
        >
          <RankMedalCrown place={rankingPosition as 1 | 2 | 3} className="w-3 h-3" />
        </span>
      )}
    </div>
  );
}
