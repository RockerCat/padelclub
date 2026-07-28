"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, FilterDropdown } from "@/components/ui";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { cn } from "@/lib/utils/cn";

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
  ownClubMemberId: string;
  categories: { code: string; sortOrder: number }[];
  initialCategory: string | null;
  initialRanking: RankingRow[];
  initialError: string | null;
}

// Fase 1 módulo deportivo, bloque 6 — primera vista visible del ranking por
// categoría. No implementa ranking global, historial, medallas ni edición —
// exclusivamente lectura del estado deportivo vigente vía
// get_club_category_ranking_view (variante orientada a UI, con avatar_url,
// que compone get_club_category_ranking — autorizada para cualquier
// miembro activo del club, cualquier rol, ver 20260824000001).
export function RankingView({
  clubId,
  ownClubMemberId,
  categories,
  initialCategory,
  initialRanking,
  initialError,
}: RankingViewProps) {
  const [category, setCategory] = useState<string | null>(initialCategory);
  const [rows, setRows] = useState<RankingRow[]>(initialRanking);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function handleCategoryChange(nextCategory: string) {
    setCategory(nextCategory);
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("get_club_category_ranking_view", {
      p_club_id: clubId,
      p_category: nextCategory,
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

  return (
    <div className="p-6 md:p-10 max-w-2xl md:mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Ranking</h1>
        <p className="text-brand-muted mt-1 text-sm">Clasificación vigente por categoría.</p>
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
          </div>

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
                {rows.map((row) => {
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
                      <PlayerAvatar
                        player={{ id: row.profile_id, full_name: row.full_name, avatar_url: row.avatar_url }}
                        size="sm"
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
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
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
