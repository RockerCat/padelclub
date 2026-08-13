"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui";
import { resolveImageDataUrl, resolveImageDataUrls } from "@/lib/sportsShareExport";
import { buildRankingWhatsappMessage } from "../../../shared/players/ranking";
import { RankingShareCard, type RankingShareRow } from "./RankingShareCard";
import { ShareCardModal } from "./ShareCardModal";

interface RankingExportRow {
  club_member_id: string;
  ranking_position: number;
  full_name: string | null;
  avatar_url: string | null;
  current_points: number;
}

interface RankingExportButtonProps {
  clubName: string;
  clubSlug: string;
  clubLogoUrl: string | null;
  accentColor: string;
  category: string;
  // Exactamente la colección ya cargada por RankingView para la categoría
  // actualmente seleccionada — nunca una consulta nueva, nunca las 7
  // categorías, nunca un reordenamiento propio (ya viene ordenada por
  // ranking_position desde get_club_category_ranking_view).
  rows: RankingExportRow[];
}

function formatGeneratedAt(): string {
  return `Generado el ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}`;
}

// Bloque 3.4/3.9 — botón "Compartir Ranking" (OWNER/ADMIN y PLAYER, ver
// gate en RankingView vía canShareRanking). Opera siempre sobre la categoría ya
// seleccionada, nunca pide elegirla de nuevo. Resuelve avatares a data URL
// bajo demanda (solo al pulsar, nunca al cargar la página) antes de abrir
// el modal — nunca bloquea la navegación principal mientras tanto (el
// propio botón muestra su estado de carga).
export function RankingExportButton({ clubName, clubSlug, clubLogoUrl, accentColor, category, rows }: RankingExportButtonProps) {
  const [preparing, setPreparing] = useState(false);
  const [exportData, setExportData] = useState<{ logoDataUrl: string | null; rows: RankingShareRow[] } | null>(null);
  // Bloque 3.5 — fuerza un remount completo de ShareCardModal en cada
  // apertura (nunca solo actualiza sus props). Sin esto, activar el botón
  // de nuevo mientras el modal ya está abierto (alcanzable por teclado: el
  // botón no queda oculto detrás del backdrop, solo tapado visualmente) no
  // reiniciaba la generación del PNG — el archivo compartido/descargado
  // podía quedar desincronizado del preview mostrado.
  const [generation, setGeneration] = useState(0);

  const top10 = rows.slice(0, 10);
  const hasPlayers = top10.length > 0;

  async function handleOpen() {
    if (preparing) return;
    setPreparing(true);
    const [logoDataUrl, avatarDataUrls] = await Promise.all([
      resolveImageDataUrl(clubLogoUrl),
      resolveImageDataUrls(top10.map((r) => r.avatar_url)),
    ]);
    setExportData({
      logoDataUrl,
      rows: top10.map((r, i) => ({
        clubMemberId: r.club_member_id,
        position: r.ranking_position,
        fullName: r.full_name,
        avatarDataUrl: avatarDataUrls[i],
        points: r.current_points,
      })),
    });
    setGeneration((g) => g + 1);
    setPreparing(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleOpen}
        disabled={!hasPlayers}
        loading={preparing}
        title={hasPlayers ? undefined : "No hay jugadores en esta categoría todavía"}
      >
        <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
        Compartir Ranking
      </Button>

      {exportData && (
        <ShareCardModal
          key={generation}
          title="Compartir Ranking"
          filenameParts={["ranking", clubName, category]}
          shareTitle={`Ranking ${category} · ${clubName}`}
          shareText={`Ranking ${category} de ${clubName} — Mi Pádel Club`}
          whatsappMessage={buildRankingWhatsappMessage({ category, clubName, clubSlug, siteUrl: window.location.origin })}
          onClose={() => setExportData(null)}
          card={
            <RankingShareCard
              clubName={clubName}
              clubLogoDataUrl={exportData.logoDataUrl}
              accentColor={accentColor}
              category={category}
              generatedAtLabel={formatGeneratedAt()}
              rows={exportData.rows}
            />
          }
        />
      )}
    </>
  );
}
