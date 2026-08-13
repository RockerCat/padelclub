// Extraído de RankingView.tsx (app web) — antes esta derivación (podio/
// empates/fila propia) vivía solo inline dentro de ese componente, nunca
// exportada. Ahora es la única fuente para WEB y mobile: ninguna de las
// dos plataformas recalcula posiciones/empates por su cuenta.

export type RankingRow = {
  ranking_position: number;
  club_member_id: string;
  profile_id: string;
  full_name: string | null;
  avatar_url: string | null;
  current_points: number;
};

export interface RankingPresentation {
  sortedRows: RankingRow[];
  /** true cuando todos los jugadores de la categoría tienen los mismos puntos (incluye el caso "todos en 0"). */
  allTied: boolean;
  /** Podio (top 3) visible solo cuando hay al menos 3 filas y no están todas empatadas. */
  showPodium: boolean;
  podiumRows: [RankingRow, RankingRow, RankingRow] | null;
  /** El resto de filas del listado — desde la 4ª posición si se muestra podio, o todas si no. */
  tableRows: RankingRow[];
  ownRow: RankingRow | null;
}

// `rows` no necesita venir pre-ordenada — get_club_category_ranking_view ya
// la devuelve ordenada, pero esta función nunca confía en eso ciegamente
// (mismo criterio que RankingView.tsx ya aplicaba). ownClubMemberId es
// `null` para un visitante sin membresía activa (ranking público) — la
// comparación simplemente nunca coincide en ese caso.
export function computeRankingPresentation(rows: RankingRow[], ownClubMemberId: string | null): RankingPresentation {
  const sortedRows = [...rows].sort((a, b) => a.ranking_position - b.ranking_position);
  const allTied = sortedRows.length > 0 && sortedRows.every((r) => r.current_points === sortedRows[0].current_points);
  const showPodium = !allTied && sortedRows.length >= 3;
  const podiumRows = showPodium ? (sortedRows.slice(0, 3) as [RankingRow, RankingRow, RankingRow]) : null;
  const tableRows = showPodium ? sortedRows.slice(3) : sortedRows;
  const ownRow = sortedRows.find((r) => r.club_member_id === ownClubMemberId) ?? null;
  return { sortedRows, allTied, showPodium, podiumRows, tableRows, ownRow };
}

// Portado de RankingExportButton.tsx (app web, dentro de handleOpen) —
// mismo texto exacto, ahora la única fuente para el mensaje de WhatsApp de
// "Compartir Ranking" en ambas plataformas (WEB lo usa como fallback de
// texto plano cuando no hay share nativo de archivo; mobile lo usa
// siempre, ver CLAUDE.md → Sports Data Export Principles/WhatsApp Share
// Principles — mobile no tiene el generador de imagen de WEB, html-to-image
// es una librería de DOM sin equivalente en React Native).
export function buildRankingWhatsappMessage(params: { category: string; clubName: string; clubSlug: string; siteUrl: string }): string {
  const { category, clubName, clubSlug, siteUrl } = params;
  return `🏆 Ranking ${category} — ${clubName}\n\nConsulta la clasificación completa aquí 👇\n\n${siteUrl}/clubs/${clubSlug}/ranking`;
}
