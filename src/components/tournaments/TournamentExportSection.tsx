"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui";
import { resolveImageDataUrl, resolveImageDataUrls } from "@/lib/sportsShareExport";
import { ShareCardModal } from "@/components/sports-share/ShareCardModal";
import { TournamentPodiumShareCard, type PodiumSharePair } from "@/components/sports-share/TournamentPodiumShareCard";
import { TournamentResultsShareCard, type ResultsShareMatch } from "@/components/sports-share/TournamentResultsShareCard";
import { tournamentCategoryLabel } from "@/lib/tournamentLabels";
import type { BracketRound } from "@/lib/tournamentBracket";
import type { TournamentAwardSummary, TournamentAwardPair } from "@/lib/tournamentAwards";
import type { TournamentEntryWithMembers } from "@/lib/tournamentEntries";
import type { Tournament } from "@/types/database";

interface TournamentExportSectionProps {
  clubName: string;
  clubLogoUrl: string | null;
  accentColor: string;
  tournament: Pick<Tournament, "name" | "category" | "secondary_category" | "completed_at" | "status">;
  awardSummary: TournamentAwardSummary;
  entries: TournamentEntryWithMembers[];
  rounds: BracketRound[];
}

function formatDateLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}

function formatGeneratedAt(): string {
  return `Generado el ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}`;
}

function formatSetScore(a: number | null, b: number | null): string | null {
  if (a == null || b == null) return null;
  return `${a}-${b}`;
}

// Presentación únicamente — nunca recalcula ni infiere un ganador. Los 6
// campos de marcador y winner_entry_id siempre vienen tal cual del backend
// (tournament_matches, vía getTournamentBracketView); esta función solo los
// concatena para la línea compacta de la tarjeta exportable (el diseño de
// MatchCard normal usa un layout de 2 filas, no una sola línea de texto, así
// que no hay una utilidad existente que extraer y reutilizar aquí).
function formatMatchScoreLine(m: {
  setOneEntryOne: number | null;
  setOneEntryTwo: number | null;
  setTwoEntryOne: number | null;
  setTwoEntryTwo: number | null;
  setThreeEntryOne: number | null;
  setThreeEntryTwo: number | null;
}): string | null {
  const sets = [
    formatSetScore(m.setOneEntryOne, m.setOneEntryTwo),
    formatSetScore(m.setTwoEntryOne, m.setTwoEntryTwo),
    formatSetScore(m.setThreeEntryOne, m.setThreeEntryTwo),
  ].filter((s): s is string => !!s);
  return sets.length > 0 ? sets.join(", ") : null;
}

// Bloque 3.3 (ya implementado) resolvió la categoría real por miembro
// dentro de entries — esta función solo cruza ese dato ya cargado con el
// entryId/clubMemberId del resumen de premiación. Nunca una consulta nueva,
// nunca recalcula por profile_id.
function resolveRealCategory(
  entries: TournamentEntryWithMembers[],
  entryId: string | null,
  clubMemberId: string
): string | null {
  if (!entryId) return null;
  const entry = entries.find((e) => e.id === entryId);
  return entry?.members.find((m) => m.club_member_id === clubMemberId)?.category ?? null;
}

// Bloque 3.4 — "Compartir podio" / "Compartir resultados", visibles
// únicamente cuando el torneo ya tiene datos finales suficientes y
// consistentes (mismo gate que TournamentNewsSection: completed + awarded).
// Solo se monta desde TournamentDetailActions (OWNER/ADMIN) — PLAYER nunca
// ve esta sección.
export function TournamentExportSection({
  clubName,
  clubLogoUrl,
  accentColor,
  tournament,
  awardSummary,
  entries,
  rounds,
}: TournamentExportSectionProps) {
  const [preparing, setPreparing] = useState<"podium" | "results" | null>(null);
  const [podiumData, setPodiumData] = useState<{
    logoDataUrl: string | null;
    champion: PodiumSharePair | null;
    runnerUp: PodiumSharePair | null;
  } | null>(null);
  const [resultsData, setResultsData] = useState<{ logoDataUrl: string | null; matches: ResultsShareMatch[] } | null>(
    null
  );
  // Bloque 3.5 — fuerza remount de cada ShareCardModal en cada apertura
  // (ver misma corrección en RankingExportButton.tsx): sin esto, reabrir
  // el mismo export mientras el modal ya estaba visible no reiniciaba la
  // generación del PNG.
  const [podiumGeneration, setPodiumGeneration] = useState(0);
  const [resultsGeneration, setResultsGeneration] = useState(0);

  const enabled = tournament.status === "completed" && awardSummary.state === "awarded";
  if (!enabled) return null;

  const categoryLabel = tournamentCategoryLabel(tournament.category, tournament.secondary_category);
  const dateLabel = formatDateLabel(tournament.completed_at);

  const championPair = awardSummary.pairs.find((p) => p.placement === "champion") ?? null;
  const runnerUpPair = awardSummary.pairs.find((p) => p.placement === "runner_up") ?? null;

  async function buildSharePair(pair: TournamentAwardPair | null): Promise<PodiumSharePair | null> {
    if (!pair) return null;
    const avatarUrls = await resolveImageDataUrls(pair.players.map((p) => p.avatarUrl));
    return {
      players: pair.players.map((p, i) => ({
        clubMemberId: p.clubMemberId,
        fullName: p.name,
        avatarDataUrl: avatarUrls[i],
        category: resolveRealCategory(entries, pair.entryId, p.clubMemberId),
        totalPoints: p.totalPoints,
      })),
    };
  }

  async function handleOpenPodium() {
    if (preparing) return;
    setPreparing("podium");
    const [logoDataUrl, champion, runnerUp] = await Promise.all([
      resolveImageDataUrl(clubLogoUrl),
      buildSharePair(championPair),
      buildSharePair(runnerUpPair),
    ]);
    setPodiumData({ logoDataUrl, champion, runnerUp });
    setPodiumGeneration((g) => g + 1);
    setPreparing(null);
  }

  async function handleOpenResults() {
    if (preparing) return;
    setPreparing("results");

    // Siempre las últimas 2 rondas del bracket (semifinales + final), sin
    // importar el tamaño del cuadro (4/8/16) — nunca el cuadro completo.
    const lastRounds = rounds.slice(-2);
    const flatMatches = lastRounds.flatMap((round) => round.matches.map((m) => ({ ...m, roundLabel: round.label })));

    // Una sola tanda paralela de resolución de avatares para todos los
    // jugadores mostrados (máx. 2 rondas × 2 partidos × 2 parejas × 2
    // jugadores = 16 imágenes como mucho) — nunca una por jugador en serie.
    const avatarUrls: Array<string | null> = [];
    for (const m of flatMatches) {
      for (const entry of [m.entryOne, m.entryTwo]) {
        if (!entry) continue;
        for (const p of entry.players) avatarUrls.push(p.avatar_url);
      }
    }
    const [logoDataUrl, resolvedAvatars] = await Promise.all([
      resolveImageDataUrl(clubLogoUrl),
      resolveImageDataUrls(avatarUrls),
    ]);
    let cursor = 0;
    const nextAvatar = () => resolvedAvatars[cursor++] ?? null;

    const shareMatches: ResultsShareMatch[] = flatMatches.map((m) => ({
      id: m.id,
      roundLabel: m.roundLabel,
      entryOne: m.entryOne
        ? {
            id: m.entryOne.id,
            category: m.entryOne.category,
            players: m.entryOne.players.map((p) => ({
              club_member_id: p.club_member_id,
              full_name: p.full_name,
              avatar_url: nextAvatar(),
              category: p.category,
            })),
          }
        : null,
      entryTwo: m.entryTwo
        ? {
            id: m.entryTwo.id,
            category: m.entryTwo.category,
            players: m.entryTwo.players.map((p) => ({
              club_member_id: p.club_member_id,
              full_name: p.full_name,
              avatar_url: nextAvatar(),
              category: p.category,
            })),
          }
        : null,
      winnerEntryId: m.winnerEntryId,
      scoreLine: formatMatchScoreLine(m),
    }));

    setResultsData({ logoDataUrl, matches: shareMatches });
    setResultsGeneration((g) => g + 1);
    setPreparing(null);
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h2 className="text-lg font-semibold text-white">Compartir</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleOpenPodium}
          disabled={!championPair || (preparing !== null && preparing !== "podium")}
          loading={preparing === "podium"}
        >
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
          Compartir podio
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleOpenResults}
          disabled={rounds.length === 0 || (preparing !== null && preparing !== "results")}
          loading={preparing === "results"}
        >
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
          Compartir resultados
        </Button>
      </div>

      {podiumData && (
        <ShareCardModal
          key={podiumGeneration}
          title="Compartir podio"
          filenameParts={["torneo", tournament.name, "podio"]}
          shareTitle={`Podio de ${tournament.name} · ${clubName}`}
          shareText={`Podio de ${tournament.name} — Mi Pádel Club`}
          onClose={() => setPodiumData(null)}
          card={
            <TournamentPodiumShareCard
              clubName={clubName}
              clubLogoDataUrl={podiumData.logoDataUrl}
              accentColor={accentColor}
              tournamentName={tournament.name}
              categoryLabel={categoryLabel}
              dateLabel={dateLabel}
              generatedAtLabel={formatGeneratedAt()}
              champion={podiumData.champion}
              runnerUp={podiumData.runnerUp}
            />
          }
        />
      )}

      {resultsData && (
        <ShareCardModal
          key={resultsGeneration}
          title="Compartir resultados"
          filenameParts={["torneo", tournament.name, "resultados"]}
          shareTitle={`Resultados de ${tournament.name} · ${clubName}`}
          shareText={`Resultados de ${tournament.name} — Mi Pádel Club`}
          onClose={() => setResultsData(null)}
          card={
            <TournamentResultsShareCard
              clubName={clubName}
              clubLogoDataUrl={resultsData.logoDataUrl}
              accentColor={accentColor}
              tournamentName={tournament.name}
              categoryLabel={categoryLabel}
              dateLabel={dateLabel}
              generatedAtLabel={formatGeneratedAt()}
              matches={resultsData.matches}
            />
          }
        />
      )}
    </div>
  );
}
