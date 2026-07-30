"use client";

import { useState } from "react";
import { Trophy, Crown, Star, Coins, ArrowLeftRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, FilterDropdown, Badge, Toast } from "@/components/ui";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { cn } from "@/lib/utils/cn";
import { AdjustPlayerPointsModal } from "@/app/(app)/[club]/admin/players/AdjustPlayerPointsModal";
import { ChangePlayerCategoryModal } from "@/app/(app)/[club]/admin/players/ChangePlayerCategoryModal";
import { RankingExportButton } from "@/components/sports-share/RankingExportButton";
import type { SportCategory } from "@/types/database";

interface RankingRow {
  ranking_position: number;
  club_member_id: string;
  profile_id: string;
  full_name: string | null;
  avatar_url: string | null;
  current_points: number;
}

interface RankingViewProps {
  clubId: string;
  clubSlug: string;
  clubName: string;
  clubLogoUrl: string | null;
  accentColor: string;
  role: "OWNER" | "ADMIN" | "PLAYER";
  // Bloque 3.2 — null para un visitante sin membresía activa en este club
  // (ranking público de un club público). Toda comparación contra este
  // valor (isSelf/"Tú", posición propia) simplemente nunca coincide en ese
  // caso — nunca un crash, nunca un club_member_id inventado.
  ownClubMemberId: string | null;
  categories: SportCategory[];
  initialCategory: string | null;
  initialRanking: RankingRow[];
  initialError: string | null;
  // Bloque 3.2 — ranking público del club. Fuerza el modo de solo lectura
  // sin importar el rol real del visitante: un OWNER/ADMIN que llega aquí
  // desde la página pública del club nunca debe ver las acciones
  // administrativas (esas viven exclusivamente en /[club]/ranking dentro
  // del panel autenticado). Por defecto false — el comportamiento del
  // Bloque 3.1 queda intacto para quien no pase esta prop.
  readOnly?: boolean;
}

// Visual-only medal styling for the podium — purely presentational, no data
// or business meaning attached. Kept as flat, muted tones (no loud
// gradients) per the club's existing dark, clean aesthetic.
const MEDAL_STYLES = {
  1: {
    badge: "bg-amber-400 text-brand-bg",
    border: "border-amber-400/60",
    glow: "shadow-[0_0_10px_-6px_rgba(251,191,36,0.35)] sm:shadow-[0_0_28px_-10px_rgba(251,191,36,0.55)]",
    pedestal: "bg-amber-400/10 border-amber-400/20",
    pedestalHeight: "h-10 sm:h-24",
    avatarClassName: "w-14 h-14 text-base sm:w-20 sm:h-20 sm:text-2xl",
    basis: "flex-[1.2_1_0%]",
  },
  2: {
    badge: "bg-slate-300 text-brand-bg",
    border: "border-slate-300/50",
    glow: "shadow-[0_0_8px_-6px_rgba(203,213,225,0.3)] sm:shadow-[0_0_20px_-10px_rgba(203,213,225,0.45)]",
    pedestal: "bg-slate-300/10 border-slate-300/20",
    pedestalHeight: "h-7 sm:h-16",
    avatarClassName: "w-11 h-11 text-xs sm:w-16 sm:h-16 sm:text-lg",
    basis: "flex-1",
  },
  3: {
    badge: "bg-orange-400 text-brand-bg",
    border: "border-orange-400/50",
    glow: "shadow-[0_0_8px_-6px_rgba(251,146,60,0.3)] sm:shadow-[0_0_20px_-10px_rgba(251,146,60,0.45)]",
    pedestal: "bg-orange-400/10 border-orange-400/20",
    pedestalHeight: "h-6 sm:h-12",
    avatarClassName: "w-11 h-11 text-xs sm:w-16 sm:h-16 sm:text-lg",
    basis: "flex-1",
  },
} as const;

// Visual order is always 2nd–1st–3rd (podium shape), on every breakpoint —
// the container is a single always-horizontal flex row (see below), so the
// same order utility reorders mobile, tablet and desktop identically. No
// separate mobile order/markup, no duplicated data.
const ROW_ORDER: Record<1 | 2 | 3, string> = {
  1: "order-2",
  2: "order-1",
  3: "order-3",
};

function PodiumCard({
  place,
  row,
  category,
  isSelf,
  isAdmin,
  onAdjustPoints,
  onChangeCategory,
}: {
  place: 1 | 2 | 3;
  row: RankingRow;
  category: string;
  isSelf: boolean;
  isAdmin: boolean;
  onAdjustPoints: (row: RankingRow) => void;
  onChangeCategory: (row: RankingRow) => void;
}) {
  const medal = MEDAL_STYLES[place];
  return (
    <div className={cn("flex flex-col items-center min-w-0", medal.basis, "sm:flex-1 sm:max-w-[240px]", ROW_ORDER[place])}>
      {place === 1 && <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 mb-1 sm:mb-1.5 shrink-0" aria-hidden="true" />}
      <div
        className={cn(
          "relative w-full min-w-0 rounded-2xl border bg-brand-surface px-1.5 py-2 sm:px-4 sm:py-5 flex flex-col items-center text-center",
          "transition-transform duration-200 ease-out hover:-translate-y-1",
          medal.border,
          medal.glow
        )}
      >
        <span
          className={cn(
            "absolute -top-2 -left-2 w-5 h-5 sm:-top-3 sm:-left-3 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold",
            medal.badge
          )}
        >
          {place}
        </span>
        {/* Sin rankingPosition aquí: el podio ya comunica la posición con su
            propio número/pedestal/Crown — una segunda corona sería una
            decoración redundante (ver spec). Solo se agrega la categoría. */}
        <PlayerSportAvatar
          player={{ id: row.profile_id, full_name: row.full_name, avatar_url: row.avatar_url }}
          size="md"
          avatarClassName={medal.avatarClassName}
          sportCategory={category}
        />
        <div className="mt-1.5 sm:mt-3 flex items-center gap-1 sm:gap-1.5 min-w-0 max-w-full">
          <span className="text-[11px] sm:text-sm font-semibold text-white truncate max-w-full sm:max-w-[140px]">
            {row.full_name ?? "Jugador"}
          </span>
          {isSelf && (
            <Badge variant="primary" size="sm" className="shrink-0 text-[9px] px-1 py-0 sm:text-xs sm:px-2 sm:py-0.5">
              Tú
            </Badge>
          )}
        </div>
        <span className="mt-0.5 sm:mt-1 text-[10px] sm:text-sm font-semibold text-brand-primary tabular-nums">
          {row.current_points} puntos
        </span>
        {isAdmin && (
          <div className="mt-1.5 flex items-center gap-1">
            <button
              type="button"
              onClick={() => onAdjustPoints(row)}
              aria-label={`Ajustar puntos de ${row.full_name ?? "jugador"}`}
              className="w-6 h-6 rounded-md flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
            >
              <Coins className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChangeCategory(row)}
              aria-label={`Cambiar categoría de ${row.full_name ?? "jugador"}`}
              className="w-6 h-6 rounded-md flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <div
        className={cn("block w-full rounded-b-lg border border-t-0", medal.pedestal, medal.pedestalHeight)}
      />
    </div>
  );
}

function OwnPositionCard({ position, total, points }: { position: number; total: number; points: number }) {
  return (
    <Card className="px-4 py-3 shrink-0 sm:min-w-[180px]">
      <div className="flex items-center gap-1.5 text-xs text-brand-muted">
        <Star className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
        Tu posición
      </div>
      <p className="mt-1 text-lg font-bold text-brand-primary tabular-nums">
        #{position} de {total}
      </p>
      <p className="text-xs text-brand-muted">{points} puntos</p>
    </Card>
  );
}

// Fase 1 módulo deportivo, bloque 6 — primera vista visible del ranking por
// categoría. No implementa ranking global, historial, medallas ni edición —
// exclusivamente lectura del estado deportivo vigente vía
// get_club_category_ranking_view (variante orientada a UI, con avatar_url,
// que compone get_club_category_ranking — autorizada para cualquier
// miembro activo del club, cualquier rol, ver 20260824000001).
export function RankingView({
  clubId,
  clubSlug,
  clubName,
  clubLogoUrl,
  accentColor,
  role,
  ownClubMemberId,
  categories,
  initialCategory,
  initialRanking,
  initialError,
  readOnly = false,
}: RankingViewProps) {
  const [category, setCategory] = useState<string | null>(initialCategory);
  const [rows, setRows] = useState<RankingRow[]>(initialRanking);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  // Bloque 3.1 — acciones administrativas (OWNER/ADMIN). Reutiliza en su
  // totalidad AdjustPlayerPointsModal/ChangePlayerCategoryModal y sus
  // Server Actions ya existentes (admin/players/actions.ts, protegidas por
  // requireAdminRole) — este componente nunca escribe en tablas deportivas
  // directamente, solo decide qué fila abre qué modal.
  const isAdmin = !readOnly && (role === "OWNER" || role === "ADMIN");
  const [pointsModalRow, setPointsModalRow] = useState<RankingRow | null>(null);
  const [categoryModalRow, setCategoryModalRow] = useState<RankingRow | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Única fuente de verdad para el listado: siempre re-consulta la misma
  // RPC ya autorizada (get_club_category_ranking_view), tanto al cambiar de
  // categoría como después de una mutación exitosa — nunca se reordena ni
  // recalcula el ranking en el frontend.
  async function fetchRanking(targetCategory: string) {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("get_club_category_ranking_view", {
      p_club_id: clubId,
      p_category: targetCategory,
    });

    setLoading(false);
    if (rpcError) {
      console.error("[RankingView] get_club_category_ranking_view failed:", rpcError);
      setError("No se pudo cargar el ranking. Intenta de nuevo.");
      setRows([]);
      return;
    }
    setRows(data ?? []);
  }

  function handleCategoryChange(nextCategory: string) {
    setCategory(nextCategory);
    fetchRanking(nextCategory);
  }

  // Tras ajustar puntos o cambiar de categoría, se re-consulta la categoría
  // actualmente seleccionada en vez de aplicar el resultado de la mutación
  // localmente — un cambio de categoría hace que el jugador desaparezca de
  // este listado exactamente cuando la RPC deje de devolverlo aquí.
  function handleAdminMutationSuccess(message: string) {
    setPointsModalRow(null);
    setCategoryModalRow(null);
    setToastMessage(message);
    if (category) fetchRanking(category);
  }

  // Todo lo de abajo es puramente derivado de `rows` para presentación —
  // no dispara ninguna consulta ni cambia el dato recibido de la RPC.
  const sortedRows = [...rows].sort((a, b) => a.ranking_position - b.ranking_position);
  const allTied = sortedRows.length > 0 && sortedRows.every((r) => r.current_points === sortedRows[0].current_points);
  const showPodium = !allTied && sortedRows.length >= 3;
  const podiumRows = showPodium ? (sortedRows.slice(0, 3) as [RankingRow, RankingRow, RankingRow]) : null;
  const tableRows = showPodium ? sortedRows.slice(3) : sortedRows;
  const ownRow = sortedRows.find((r) => r.club_member_id === ownClubMemberId) ?? null;
  const showReady = !loading && !error && sortedRows.length > 0;

  return (
    <div className="p-6 md:p-10 max-w-4xl md:mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Ranking</h1>
          <p className="text-brand-muted mt-1 text-sm">Clasificación vigente por categoría.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {showReady && ownRow && (
            <OwnPositionCard position={ownRow.ranking_position} total={sortedRows.length} points={ownRow.current_points} />
          )}
          {/* Bloque 3.4 — exportación visual, únicamente OWNER/ADMIN en la
              ruta autenticada (isAdmin ya es false en readOnly, incluyendo
              la ruta pública) — opera siempre sobre la categoría ya
              seleccionada, nunca pide elegirla de nuevo. */}
          {isAdmin && category && showReady && (
            <RankingExportButton
              clubName={clubName}
              clubLogoUrl={clubLogoUrl}
              accentColor={accentColor}
              category={category}
              rows={sortedRows}
            />
          )}
        </div>
      </div>

      {/* Sin ninguna categoría resoluble: el catálogo global está vacío
          (no debería ocurrir en producción, ver sport_categories) — estado
          defensivo, no un error técnico. */}
      {category === null ? (
        <Card className="px-5 py-8 text-center">
          <p className="text-sm text-brand-muted">
            El catálogo de categorías todavía no está disponible.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-5">
            <FilterDropdown
              label="Categoría"
              value={category}
              defaultValue={initialCategory ?? category}
              options={categories.map((c) => ({ value: c.code, label: c.code }))}
              onChange={handleCategoryChange}
            />
            {showReady && (
              <p className="text-xs text-brand-muted mt-2">
                {sortedRows.length} {sortedRows.length === 1 ? "jugador" : "jugadores"} en la categoría {category}
              </p>
            )}
          </div>

          {showReady && (
            <>
              {allTied ? (
                <Card className="px-5 py-8 mb-5 text-center">
                  <p className="text-sm font-medium text-white">Aún no hay una clasificación definida.</p>
                  <p className="text-sm text-brand-muted mt-1">Todos los jugadores comienzan con 0 puntos.</p>
                </Card>
              ) : (
                podiumRows && (
                  <div className="mb-6 animate-ranking-podium-in overflow-hidden">
                    <div className="flex flex-row items-end justify-center gap-1.5 sm:gap-4">
                      {podiumRows.map((row, i) => (
                        <PodiumCard
                          key={row.club_member_id}
                          place={(i + 1) as 1 | 2 | 3}
                          row={row}
                          category={category}
                          isSelf={row.club_member_id === ownClubMemberId}
                          isAdmin={isAdmin}
                          onAdjustPoints={setPointsModalRow}
                          onChangeCategory={setCategoryModalRow}
                        />
                      ))}
                    </div>
                  </div>
                )
              )}
            </>
          )}

          <Card className="overflow-hidden">
            {/* Encabezado de columnas — solo aporta en desktop, donde hay
                ancho de sobra; en mobile las filas ya son autoexplicativas. */}
            <div className="hidden md:flex items-center gap-4 px-5 py-3 border-b border-white/10 text-[11px] uppercase tracking-wider text-brand-muted/60">
              <span className="w-8 text-center">#</span>
              <span className="flex-1">Jugador</span>
              <span>Puntos</span>
            </div>

            {loading ? (
              <RankingSkeleton />
            ) : error ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="px-5 py-10 text-center flex flex-col items-center gap-2">
                <Trophy className="w-6 h-6 text-brand-muted/40" />
                <p className="text-sm text-brand-muted">
                  Todavía no hay jugadores en la categoría {category}.
                </p>
              </div>
            ) : (
              <ul>
                {tableRows.map((row) => {
                  const isSelf = row.club_member_id === ownClubMemberId;
                  return (
                    <li
                      key={row.club_member_id}
                      className={cn(
                        "flex items-center gap-3 px-4 md:px-5 py-3 border-b border-white/5 last:border-b-0",
                        isSelf && "bg-brand-primary/5"
                      )}
                    >
                      <span className="w-8 shrink-0 text-center text-sm font-semibold text-white/70">
                        {row.ranking_position}
                      </span>
                      <PlayerSportAvatar
                        player={{ id: row.profile_id, full_name: row.full_name, avatar_url: row.avatar_url }}
                        size="sm"
                        sportCategory={category}
                        rankingPosition={row.ranking_position}
                      />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-sm text-white truncate">
                          {row.full_name ?? "Jugador"}
                        </span>
                        {isSelf && (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand-primary bg-brand-primary/15 border border-brand-primary/25 rounded-full px-1.5 py-0.5">
                            Tú
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-white tabular-nums">
                        {row.current_points}
                      </span>
                      {isAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPointsModalRow(row)}
                            aria-label={`Ajustar puntos de ${row.full_name ?? "jugador"}`}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <Coins className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCategoryModalRow(row)}
                            aria-label={`Cambiar categoría de ${row.full_name ?? "jugador"}`}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <ArrowLeftRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      {isAdmin && category && pointsModalRow && (
        <AdjustPlayerPointsModal
          clubId={clubId}
          clubSlug={clubSlug}
          clubMemberId={pointsModalRow.club_member_id}
          playerName={pointsModalRow.full_name ?? "Jugador"}
          category={category}
          currentPoints={pointsModalRow.current_points}
          onClose={() => setPointsModalRow(null)}
          onSuccess={() => handleAdminMutationSuccess("Puntos actualizados correctamente")}
        />
      )}

      {isAdmin && category && categoryModalRow && (
        <ChangePlayerCategoryModal
          clubId={clubId}
          clubSlug={clubSlug}
          clubMemberId={categoryModalRow.club_member_id}
          playerName={categoryModalRow.full_name ?? "Jugador"}
          currentCategory={category}
          categories={categories}
          onClose={() => setCategoryModalRow(null)}
          onSuccess={() => handleAdminMutationSuccess("Categoría actualizada correctamente")}
        />
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}

function RankingSkeleton() {
  return (
    <ul>
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 md:px-5 py-3 border-b border-white/5 last:border-b-0">
          <span className="w-8 h-4 shrink-0 rounded bg-white/10 animate-pulse" />
          <span className="w-8 h-8 shrink-0 rounded-full bg-white/10 animate-pulse" />
          <span className="flex-1 h-4 rounded bg-white/10 animate-pulse" />
          <span className="w-8 h-4 shrink-0 rounded bg-white/10 animate-pulse" />
        </li>
      ))}
    </ul>
  );
}
