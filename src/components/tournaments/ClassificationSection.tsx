"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { Button, ContextMenu, Toast } from "@/components/ui";
import { PlayerSportAvatarButton } from "@/components/players/PlayerSportAvatarButton";
import { ReplaceMemberModal } from "./ReplaceMemberModal";
import { setTournamentEntryPointsAction } from "@/lib/tournamentEntryActions";
import { computeTournamentClassification, isOwnEntry, type TournamentEntryWithMembers } from "@/lib/tournamentEntries";
import { pairLabel } from "../../../shared/tournaments/classification";
import { cn } from "@/lib/utils/cn";

export { pairLabel };

interface ClassificationSectionProps {
  clubId: string;
  tournamentId: string;
  // Congeladas al registrar cada dupla (tournament_entries.category/
  // secondary_category) — nunca la configuración actual del torneo, que
  // puede haber cambiado desde entonces. Solo se usan aquí para armar el
  // ReplaceMemberModal (misma validación de composición que ya usaba).
  category: string;
  secondaryCategory: string | null;
  entries: TournamentEntryWithMembers[];
  // in_progress → editable, en la misma página, sin modal ni autosave.
  // completed → solo lectura. La misma condición también habilita el menú
  // "Cambiar jugadores" por fila — ambas acciones comparten exactamente
  // el mismo requisito de negocio (OWNER/ADMIN, torneo in_progress) que
  // ya validaba EntriesSection.
  editable: boolean;
  // Puramente presentacional — nunca deriva ninguna regla de negocio de
  // aquí (esa sigue siendo `editable`/las condiciones ya existentes en
  // TournamentDetailView). Solo decide si el brillo "en vivo" de las mini
  // barras se dibuja: true únicamente cuando tournament.status ===
  // "in_progress", tanto para OWNER/ADMIN como para PLAYER/visitante —
  // una clasificación `completed` nunca lo muestra, el torneo ya no está
  // en curso.
  isLive?: boolean;
  // Torneo completed: mismo entry.points de siempre (nunca un valor
  // recalculado en frontend), pero el texto aclara explícitamente que
  // cada integrante recibe el monto completo, no dividido — nunca cambia
  // qué número se muestra, solo cómo se redacta. false en cualquier otro
  // estado (in_progress editable o no) deja el texto "N pts" de siempre,
  // sin tocarlo.
  completed?: boolean;
  ownClubMemberId: string;
  ownUserId: string;
  revalidatePaths: string[];
  // "Miembro del club" — mismo modal/estado que Ranking (useMemberModal),
  // nunca una copia. Independiente de `editable`/`completed`: OWNER/ADMIN
  // puede abrir el detalle de un jugador tanto en vivo como en una
  // clasificación final ya congelada — abrir el modal nunca reescribe
  // resultados del torneo, solo lee/edita el perfil del jugador. PLAYER
  // conserva avatares no interactivos (el modal no tiene modo de solo
  // lectura hoy), igual que en Ranking.
  avatarsClickable: boolean;
  onSelectMember: (clubMemberId: string) => void;
  loadingMemberId: string | null;
}

// Solo para el aria-label del menú de acciones de cada fila — "y" en vez
// del "/" visible en pairLabel, más natural al leerse en voz alta.
function pairAriaName(entry: TournamentEntryWithMembers): string {
  return entry.members.map((m) => m.full_name ?? "Jugador").join(" y ");
}

// Medalla del podio (1/2/3) — emoji real, a pedido explícito: nunca un
// círculo de color con número, nunca la corona de RankMedalCrown (esa
// sigue siendo exclusiva de Ranking/Jugadores, un módulo distinto — ver
// CLAUDE.md), nunca un ícono personalizado. `role="img"` + `aria-label`
// siguen dando el equivalente accesible ("Primer lugar"/...) — el emoji
// ya trae su propio significado visual estándar (oro/plata/bronce), pero
// no todo lector de pantalla lo anuncia igual de claro sin la etiqueta.
const MEDAL_EMOJI: Record<1 | 2 | 3, { symbol: string; label: string }> = {
  1: { symbol: "🥇", label: "Primer lugar" },
  2: { symbol: "🥈", label: "Segundo lugar" },
  3: { symbol: "🥉", label: "Tercer lugar" },
};

export function PositionMedal({ place, size = "sm" }: { place: 1 | 2 | 3; size?: "sm" | "lg" }) {
  const { symbol, label } = MEDAL_EMOJI[place];
  return (
    <span role="img" aria-label={label} className={size === "lg" ? "text-4xl leading-none" : "text-lg leading-none"}>
      {symbol}
    </span>
  );
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
  category,
  secondaryCategory,
  entries,
  editable,
  isLive = false,
  completed = false,
  ownClubMemberId,
  ownUserId,
  revalidatePaths,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
}: ClassificationSectionProps) {
  const router = useRouter();
  const confirmedEntries = useMemo(() => entries.filter((e) => e.status === "confirmed"), [entries]);
  const classification = useMemo(() => computeTournamentClassification(entries), [entries]);
  // Máximo real entre las duplas ya clasificadas (siempre confirmadas,
  // ver computeTournamentClassification) — única fuente para la mini
  // barra de cada fila, nunca un segundo cálculo de puntos. 0 cuando
  // todas las duplas siguen en cero, nunca un divisor real de 0 más
  // abajo.
  const maxPoints = useMemo(
    () => classification.reduce((max, { entry }) => Math.max(max, entry.points), 0),
    [classification]
  );
  // Empate absoluto: todas las duplas clasificadas tienen exactamente el
  // mismo puntaje (incluye el caso más común, todas en cero antes de que
  // el organizador registre nada) — comparar solo primer vs último
  // alcanza porque `classification` ya viene ordenada de mayor a menor
  // puntaje. Mientras esto sea true no existe un podio real todavía, así
  // que ninguna fila muestra medalla ni el tratamiento visual de top 3 —
  // nunca cambia el orden real ni la posición oficial calculada por
  // computeTournamentClassification, solo qué tan pronto se dibuja el
  // podio.
  const allTied =
    classification.length > 0 &&
    classification[0].entry.points === classification[classification.length - 1].entry.points;
  // Las mini barras arrancan en 0% y se animan hasta su ancho real apenas
  // el componente termina de montar — un solo `useEffect` sin
  // dependencias, dispara una sola vez después del primer pintado, nunca
  // recalcula puntos ni orden.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // Misma definición de "ya inscrito" que EntriesSection (pending +
  // confirmed) — reutilizada aquí, no recalculada de otra forma, solo
  // para poder excluir a estos jugadores del combobox de reemplazo.
  const registeredMemberIds = useMemo(
    () =>
      entries
        .filter((e) => e.status === "pending" || e.status === "confirmed")
        .flatMap((e) => e.members.map((m) => m.club_member_id)),
    [entries]
  );

  const [draftPoints, setDraftPoints] = useState<Record<string, string>>(() =>
    Object.fromEntries(confirmedEntries.map((e) => [e.id, String(e.points)]))
  );
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [replacingEntry, setReplacingEntry] = useState<TournamentEntryWithMembers | null>(null);
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
    return <p className="text-sm text-brand-muted">Aún no hay duplas confirmadas.</p>;
  }

  // Una única lista, sin separar podio/clasificación completa — con 6, 8 o
  // 12 duplas ambas mostraban prácticamente lo mismo. `classification` ya
  // viene solo con duplas confirmadas (computeTournamentClassification) y
  // en el orden oficial, con salto de posición en empates — se recorre tal
  // cual, una sola vez, nunca una segunda fuente ni una segunda lista.
  function renderRow(entry: TournamentEntryWithMembers, position: number, index: number) {
    const isOwn = isOwnEntry(entry, ownUserId, ownClubMemberId);
    // Con empate absoluto, computeTournamentClassification asigna la
    // misma posición oficial (1) a todas las filas — correcto para la
    // regla de negocio del salto de posición, pero aquí se muestra el
    // orden de la lista (1, 2, 3...) en su lugar, puramente visual, nunca
    // se reescribe `position` ni el orden real de `classification`.
    const displayPosition = allTied ? index + 1 : position;
    const isTopThree = !allTied && position <= 3;
    const medalPlace = isTopThree ? (position as 1 | 2 | 3) : null;
    // Ancho de la mini barra: proporcional a los puntos de esta dupla
    // respecto del líder actual (maxPoints, calculado arriba sobre la
    // misma `classification`). Con maxPoints en 0 (todas en cero todavía)
    // se usa un ancho neutro fijo — nunca se divide entre 0. Piso de 6%
    // para que una dupla en 0 puntos entre otras con puntaje siga
    // mostrando una barra visible (nunca invisible/rota).
    const barPct = maxPoints > 0 ? Math.max(6, Math.round((entry.points / maxPoints) * 100)) : 10;

    return (
      <div
        key={entry.id}
        // Una única clase visual base para todas las filas — sin importar
        // posición, podio, empate, rol o si es la dupla del usuario. Las
        // medallas 🥇🥈🥉 (PositionMedal) son el único tratamiento visual
        // especial del podio; el badge "TÚ" (más abajo) es el único
        // indicador de la dupla propia — ninguno de los dos toca el
        // fondo/borde de la fila.
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-brand-surface px-3 py-2"
      >
        {/* Posición — medalla numerada para el top 3 (nunca corona, nunca
            la misma medalla repetida para todas las filas), número simple
            a partir de la 4ta. */}
        <div className="w-7 shrink-0 flex items-center justify-center">
          {medalPlace ? (
            <PositionMedal place={medalPlace} />
          ) : (
            <span className="text-sm font-semibold text-white/70 tabular-nums">{displayPosition}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {entry.members.map((m) => (
            <PlayerSportAvatarButton
              key={m.club_member_id}
              player={{ id: m.club_member_id, full_name: m.full_name, avatar_url: m.avatar_url }}
              size="sm"
              clickable={avatarsClickable}
              isLoading={loadingMemberId === m.club_member_id}
              onSelect={() => onSelectMember(m.club_member_id)}
              playerName={m.full_name ?? "jugador"}
            />
          ))}
        </div>

        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-white truncate">{pairLabel(entry)}</span>
            {isOwn && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand-primary bg-brand-primary/15 border border-brand-primary/25 rounded-full px-1.5 py-0.5">
                Tú
              </span>
            )}
          </div>
          {/* Mini barra — no representa avance del torneo, solo qué tan
              cerca está esta dupla del líder actual en puntos. Usa
              siempre entry.points (última clasificación guardada), nunca
              el borrador sin guardar del input mientras se edita — mismo
              criterio de estabilidad que ya evita que las filas salten de
              posición bajo el cursor del organizador. Arranca en 0% y se
              anima hasta su ancho real apenas monta (`mounted`); el mismo
              `transition-[width]` hace que, más adelante, un cambio real
              de puntos (después de guardar/refrescar) también se anime
              hasta el nuevo valor en vez de saltar de golpe. `bar-shimmer`
              (solo mientras el torneo está en curso, `isLive`) agrega
              únicamente un brillo que la recorre — nunca cambia su ancho
              ni su posición, y respeta prefers-reduced-motion (ver
              globals.css). */}
          <div className="h-1 w-full max-w-[140px] rounded-full bg-white/10 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full bg-brand-primary/70 transition-[width] duration-700 ease-out",
                isLive && "bar-shimmer"
              )}
              style={{ width: `${mounted ? barPct : 0}%` }}
            />
          </div>
        </div>

        {/* h-9 fijo en el propio contenedor (no en el input): el input
            (36px) es más alto que el <span> de solo texto (~20px de
            línea) — este contenedor hace que ambas ramas ocupen siempre
            la misma altura, para que la altura base de la fila nunca
            dependa de si hay o no controles de OWNER/ADMIN. */}
        <div className="flex items-center gap-3 shrink-0 h-9">
          {editable ? (
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={draftPoints[entry.id] ?? "0"}
              onChange={(e) => handlePointsChange(entry.id, e.target.value)}
              className="w-16 h-9 shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 text-center text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50"
              aria-label={`Puntos de ${pairLabel(entry)}`}
            />
          ) : (
            // Mismo entry.points de siempre — completed solo cambia la
            // redacción para dejar explícito que cada integrante recibe
            // el monto completo (nunca dividido entre los dos). En mobile
            // "por jugador" le robaba ancho horizontal al nombre de la
            // dupla (line-clamp-2 truncaba antes de tiempo) — el texto
            // largo queda solo para lg+, mismo umbral que ya usa
            // TournamentPodium para su propio par de etiquetas corta/larga.
            <span className="text-sm font-semibold text-white tabular-nums text-right">
              {completed ? (
                <>
                  <span className="lg:hidden">{entry.points} pts</span>
                  <span className="hidden lg:inline">{entry.points} pts por jugador</span>
                </>
              ) : (
                `${entry.points} pts`
              )}
            </span>
          )}
        </div>

        {/* "Cambiar jugadores" — único acceso a este flujo en toda la
            vista (ya no queda un ícono de lápiz aparte). Mismo modal,
            mismo flujo, mismo RPC replace_tournament_entry_member —
            únicamente cambió el punto de entrada visual, de un botón
            siempre visible a un menú de tres puntos. Misma condición de
            negocio de siempre: OWNER/ADMIN, dupla confirmada, torneo
            in_progress — exactamente lo que `editable` representa en esta
            sección; PLAYER/visitantes nunca ven el botón porque
            `editable` es siempre false para ellos. */}
        {editable && (
          <ContextMenu
            className="shrink-0"
            triggerLabel={`Abrir acciones de la dupla ${pairAriaName(entry)}`}
            actions={[
              {
                label: "Cambiar jugadores",
                icon: ArrowLeftRight,
                onClick: () => setReplacingEntry(entry),
              },
            ]}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {classification.map(({ entry, position }, index) => renderRow(entry, position, index))}
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

      {replacingEntry && (
        <ReplaceMemberModal
          clubId={clubId}
          tournamentEntryId={replacingEntry.id}
          category={category}
          secondaryCategory={secondaryCategory}
          members={replacingEntry.members}
          excludeClubMemberIds={registeredMemberIds}
          revalidatePaths={revalidatePaths}
          onClose={() => setReplacingEntry(null)}
          onSuccess={() => {
            setReplacingEntry(null);
            setToastMessage("Integrante reemplazado correctamente");
            router.refresh();
          }}
        />
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
