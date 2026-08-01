import { PlayerSportAvatarButton } from "@/components/players/PlayerSportAvatarButton";
import { PositionMedal, pairLabel } from "./ClassificationSection";
import { cn } from "@/lib/utils/cn";
import type { TournamentClassificationRow, TournamentEntryWithMembers } from "@/lib/tournamentEntries";

interface TournamentPodiumProps {
  // Ya filtradas a position <= 3 por el llamador — computeTournamentClassification
  // es la única fuente de la posición oficial, nunca recalculada aquí.
  rows: TournamentClassificationRow[];
  // "Miembro del club" — mismo modal/estado que Ranking (useMemberModal),
  // nunca una copia. Solo OWNER/ADMIN (avatarsClickable = isAdmin en
  // TournamentDetailView): el modal no tiene modo de solo lectura, así que
  // PLAYER conserva avatares no interactivos, igual que en Ranking.
  avatarsClickable: boolean;
  onSelectMember: (clubMemberId: string) => void;
  loadingMemberId: string | null;
}

// Distribución espacial 2º / 1º / 3º — SIEMPRE, desde el ancho más
// angosto (nunca se retrasa a un breakpoint mayor). `order-*` sin prefijo
// de breakpoint: el grid de 3 columnas es horizontal en todos los
// tamaños, solo cambian tamaños/paddings, nunca la geometría.
const PLACE_ORDER: Record<1 | 2 | 3, string> = { 1: "order-2", 2: "order-1", 3: "order-3" };
// Pedestal — SIEMPRE visible (nunca `hidden`), con altura fija por
// posición y nunca calculada a partir de la cantidad de duplas
// empatadas. height(1) > height(2) > height(3) en cualquier tamaño de
// pantalla; el salto a valores mayores en desktop es solo cosmético.
const PLACE_BASE_HEIGHT: Record<1 | 2 | 3, string> = { 1: "h-20 lg:h-24", 2: "h-14 lg:h-16", 3: "h-10" };
// Bloque de contenido (medalla + título + duplas) — altura FIJA (`h-*`,
// nunca `max-h`/`min-h` solos) por posición, en los mismos 4 breakpoints
// que ya usa el resto del podio. Antes este bloque se autodimensionaba
// hasta un `max-h-[150px]` compartido por las 3 posiciones: con pocas
// duplas el bloque encogía, con varias empatadas crecía hasta el tope —
// como el tope era el mismo para 1º/2º/3º, un 3er lugar con más empates
// que un 1er lugar con pocos podía terminar con una caja total (contenido
// + pedestal) más alta que la del 1er lugar, rompiendo la jerarquía. Con
// una altura fija por posición (estrictamente 1 > 2 > 3 en los 4
// breakpoints) la caja exterior nunca cambia por la cantidad de duplas
// empatadas — sea 1 dupla o 6, el bloque mide exactamente esto; el
// contenido que no quepa se scrollea dentro (ver el div de filas abajo),
// nunca fuerza crecimiento del padre.
const PLACE_CONTENT_HEIGHT: Record<1 | 2 | 3, string> = {
  1: "h-36 sm:h-44 md:h-48 lg:h-56",
  2: "h-32 sm:h-36 md:h-40 lg:h-44",
  3: "h-28 sm:h-32 md:h-36 lg:h-40",
};
const PLACE_LABEL: Record<1 | 2 | 3, string> = { 1: "1.er lugar", 2: "2.º lugar", 3: "3.er lugar" };
// Etiqueta corta — visible en mobile/tablet (compactación pedida
// explícitamente para anchos como 320px); la completa se reserva para
// desktop, donde ya había espacio de sobra.
const PLACE_LABEL_SHORT: Record<1 | 2 | 3, string> = { 1: "1.º", 2: "2.º", 3: "3.er" };
// Avatares — tamaño real controlado por completo vía clases responsive
// (avatarClassName sobreescribe el tamaño base del prop `size` gracias a
// que PlayerAvatar aplica className después de SIZE_CLASSES con
// tailwind-merge), así el podio puede ser mucho más compacto en mobile
// sin tocar PlayerAvatar/PlayerSportAvatar. El 1er lugar recibe
// consistentemente un paso más grande que 2º/3º en cada breakpoint.
const PLACE_AVATAR_CLASS: Record<1 | 2 | 3, string> = {
  1: "w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-16 lg:h-16 ring-2 ring-brand-surface",
  2: "w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 ring-2 ring-brand-surface",
  3: "w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 ring-2 ring-brand-surface",
};

// Podio final del torneo completed — como máximo TRES bloques físicos
// (uno por posición oficial 1/2/3, nunca uno por dupla). Agrupa `rows`
// por `row.position` (nunca por índice) en un Map — con un empate real,
// todas las duplas de esa posición comparten un único bloque, apiladas
// dentro de él. Grid de 3 columnas SIEMPRE (mobile, tablet y desktop):
// una posición sin ninguna dupla no se inventa, pero conserva su columna
// vacía (sin tarjeta, sin pedestal) para que 1º nunca deje de estar
// centrado y 2º/3º nunca cambien de lado.
export function TournamentPodium({ rows, avatarsClickable, onSelectMember, loadingMemberId }: TournamentPodiumProps) {
  const byPlace = new Map<1 | 2 | 3, TournamentClassificationRow[]>();
  for (const row of rows) {
    if (row.position < 1 || row.position > 3) continue;
    const place = row.position as 1 | 2 | 3;
    const list = byPlace.get(place) ?? [];
    list.push(row);
    byPlace.set(place, list);
  }

  if (byPlace.size === 0) return null;

  return (
    <div className="grid grid-cols-3 items-end gap-1.5 sm:gap-2 md:gap-3 lg:gap-4">
      {([1, 2, 3] as const).map((place) => {
        const placeRows = byPlace.get(place);
        return placeRows && placeRows.length > 0 ? (
          <PodiumBlock
            key={place}
            place={place}
            rows={placeRows}
            avatarsClickable={avatarsClickable}
            onSelectMember={onSelectMember}
            loadingMemberId={loadingMemberId}
          />
        ) : (
          // Columna vacía — conserva la geometría (1º centrado, 2º
          // izquierda, 3º derecha) sin inventar una posición que no
          // existe realmente.
          <div key={place} aria-hidden className={cn("min-w-0", PLACE_ORDER[place])} />
        );
      })}
    </div>
  );
}

// Un único bloque por posición, dividido en dos piezas independientes
// apiladas verticalmente (nunca la altura total del bloque representa el
// puesto):
//  1. Contenido — medalla + título (una sola vez, siempre visibles) +
//     lista de duplas empatadas con altura acotada y scroll interno
//     propio si no caben. Su tamaño nunca determina qué tan alto se ve
//     el podio, solo cuántas duplas caben antes del scroll.
//  2. Pedestal — altura fija según PLACE_BASE_HEIGHT, visible en TODOS
//     los tamaños; es la única pieza que comunica 1º > 2º > 3º.
// `items-end` en el grid padre alinea la base de los tres pedestales en
// la misma línea en cualquier ancho — un 3er lugar con muchas duplas
// empatadas nunca puede verse más alto que el primero porque su
// pedestal sigue siendo fijo y más bajo.
function PodiumBlock({
  place,
  rows,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
}: {
  place: 1 | 2 | 3;
  rows: TournamentClassificationRow[];
  avatarsClickable: boolean;
  onSelectMember: (clubMemberId: string) => void;
  loadingMemberId: string | null;
}) {
  return (
    <div className={cn("flex flex-col min-w-0", PLACE_ORDER[place])}>
      {/* Altura FIJA (PLACE_CONTENT_HEIGHT) — nunca crece ni encoge según
          la cantidad de duplas empatadas. `overflow-hidden` es un
          resguardo adicional: ningún hijo puede forzar el crecimiento de
          este contenedor, incluso si algo interno midiera mal. */}
      <div
        className={cn(
          "flex flex-col items-center rounded-t-xl lg:rounded-t-2xl border border-b-0 border-amber-400/25 bg-amber-400/[0.06] px-1.5 py-2 sm:px-2 sm:py-2.5 lg:px-4 lg:py-5 min-w-0 overflow-hidden",
          PLACE_CONTENT_HEIGHT[place]
        )}
      >
        {/* Encabezado — medalla + título, siempre visible (nunca dentro
            del área con scroll, `shrink-0` evita que el área de duplas le
            robe espacio). */}
        <div className="flex flex-col items-center gap-1.5 sm:gap-2 lg:gap-3 shrink-0">
          <PositionMedal place={place} size={place === 1 ? "lg" : "sm"} />
          <span className="lg:hidden text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-brand-muted">
            {PLACE_LABEL_SHORT[place]}
          </span>
          <span className="hidden lg:inline text-xs font-semibold uppercase tracking-wide text-brand-muted">
            {PLACE_LABEL[place]}
          </span>
        </div>

        {/* Única zona con scroll — nunca la medalla/título, nunca el
            pedestal. `flex-1 min-h-0`: ocupa exactamente el espacio que
            sobra dentro de la altura fija del bloque de arriba y nunca la
            excede (sin `min-h-0` el ítem flex no podría encoger por
            debajo de su contenido, y terminaría desbordando el padre).
            Scrollbar discreto, mismo patrón ya usado en
            ReservationForm.tsx (sin plugin/dependencia nueva). */}
        <div
          className="flex flex-col gap-2 lg:gap-3 w-full divide-y divide-amber-400/10 flex-1 min-h-0 overflow-y-auto min-w-0 mt-1.5 sm:mt-2 lg:mt-3"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}
        >
          {rows.map((row, i) => (
            <PodiumEntryRow
              key={row.entry.id}
              entry={row.entry}
              place={place}
              withDivider={i > 0}
              avatarsClickable={avatarsClickable}
              onSelectMember={onSelectMember}
              loadingMemberId={loadingMemberId}
            />
          ))}
        </div>
      </div>

      {/* Pedestal — decorativo (aria-hidden), señal principal de la
          jerarquía visual del podio, visible en cualquier tamaño. */}
      <div
        aria-hidden
        className={cn(
          "rounded-b-lg lg:rounded-b-xl border border-t-0 border-amber-400/25 bg-gradient-to-b from-amber-400/15 to-amber-400/5",
          PLACE_BASE_HEIGHT[place]
        )}
      />
    </div>
  );
}

function PodiumEntryRow({
  entry,
  place,
  withDivider,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
}: {
  entry: TournamentEntryWithMembers;
  place: 1 | 2 | 3;
  withDivider: boolean;
  avatarsClickable: boolean;
  onSelectMember: (clubMemberId: string) => void;
  loadingMemberId: string | null;
}) {
  const pairName = pairLabel(entry);
  return (
    <div className={cn("flex flex-col items-center gap-1 text-center min-w-0 shrink-0", withDivider && "pt-2 lg:pt-3")}>
      {/* Nunca la tarjeta completa ni la medalla/título/pedestal — solo
          cada avatar individual identifica de forma inequívoca a un
          jugador (una tarjeta puede tener 1+ duplas empatadas). */}
      <div className="flex items-center justify-center -space-x-2 shrink-0">
        {entry.members.map((m) => (
          <PlayerSportAvatarButton
            key={m.club_member_id}
            player={{ id: m.club_member_id, full_name: m.full_name, avatar_url: m.avatar_url }}
            size="sm"
            avatarClassName={PLACE_AVATAR_CLASS[place]}
            clickable={avatarsClickable}
            isLoading={loadingMemberId === m.club_member_id}
            onSelect={() => onSelectMember(m.club_member_id)}
            playerName={m.full_name ?? "jugador"}
          />
        ))}
      </div>
      {/* title conserva el nombre completo accesible (hover/long-press)
          aunque el texto visible se recorte a 2 líneas — nunca ensancha
          la columna (min-w-0 en toda la cadena de ancestros + line-clamp
          en vez de nowrap). */}
      <span
        title={pairName}
        className="text-[11px] sm:text-xs lg:text-sm font-semibold text-white leading-tight line-clamp-2 min-w-0 break-words"
      >
        {pairName}
      </span>
      {/* Nunca "X pts" ambiguo — deja explícito que cada integrante recibe
          el monto completo de la dupla, no una división entre los dos
          (mismo entry.points ya cargado, ninguna cuenta nueva). */}
      <span className="text-[10px] sm:text-[11px] lg:text-xs font-medium text-amber-300">
        {entry.points} pts/jugador
      </span>
    </div>
  );
}
