import Link from "next/link";
import { TournamentCard } from "../../admin/tournaments/TournamentCard";
import { CompactCarouselCard } from "../../home/CompactCarouselCard";
import { effectivePlayerTournamentStatus } from "../../../../../../shared/tournaments/actions";
import type { PlayerTournamentCard } from "@/lib/playerDashboard";

// Sección "Mis torneos" — reutiliza EXACTAMENTE la misma tarjeta compacta
// que ya usa el listado principal de Torneos (TournamentCard,
// ../../admin/tournaments/TournamentCard), misma escala/proporción/
// densidad — nunca una variante grande exclusiva del Dashboard. Lo único
// propio de esta pantalla (compañero/posición/puntos) se agrega vía el
// slot opcional `footerExtra` que ese mismo componente ya expone, sin
// tocar su apariencia para el resto de sus usos (listado OWNER/ADMIN y
// PLAYER, ninguno de los cuales pasa `footerExtra`).
function TournamentFooterExtra({ card }: { card: PlayerTournamentCard }) {
  const { partnerName, position, points, tournament } = card;
  const showResult = tournament.status === "completed" && position !== null;

  if (!partnerName && !showResult) return null;

  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      {partnerName ? <span className="text-brand-muted truncate">Con {partnerName}</span> : <span />}
      {showResult && (
        <span className="font-semibold text-white shrink-0" style={{ color: "var(--club-primary)" }}>
          #{position} · {points} pts
        </span>
      )}
    </div>
  );
}

// Cada tarjeta reutiliza exactamente la clasificación oficial ya calculada
// en playerDashboard.ts (computeTournamentClassification) — nunca una
// posición recalculada aquí.
//
// Mobile (sm:hidden): carrusel horizontal compacto — mismo
// CompactCarouselCard (../../home/CompactCarouselCard) y mismo patrón
// (overflow-x-auto snap-x snap-mandatory, -mx-4 px-4 para sangrar hasta el
// borde real del contenedor p-4 del Dashboard, shrink-0 w-[44%] snap-start
// por card) que ya usan Noticias recientes/Torneos activos/Torneos
// finalizados en /[club]/home/page.tsx — nunca un patrón nuevo. Solo
// imagen + título (igual que esos otros carruseles) — categoría/estado/
// compañero/posición/puntos siguen disponibles en el detalle real, al que
// el Link ya navega sin cambios.
// Desktop (sm:+): el mismo grid completo de siempre con TournamentCard,
// sin ningún cambio de comportamiento.
export function MyTournamentsSection({ clubSlug, cards }: { clubSlug: string; cards: PlayerTournamentCard[] }) {
  if (cards.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Mis torneos</h2>
        <Link href={`/${clubSlug}/tournaments`} className="text-xs font-medium text-brand-muted hover:text-white transition-colors">
          Ver todos los torneos
        </Link>
      </div>

      <div className="sm:hidden flex overflow-x-auto snap-x snap-mandatory gap-3 -mx-4 px-4">
        {cards.map((card) => (
          <div key={card.tournament.id} className="shrink-0 w-[44%] snap-start">
            <CompactCarouselCard
              href={`/${clubSlug}/tournaments/${card.tournament.slug}`}
              imageUrl={card.tournament.cover_image_url}
              title={card.tournament.name}
            />
          </div>
        ))}
      </div>

      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <TournamentCard
            key={card.tournament.id}
            tournament={card.tournament}
            href={`/${clubSlug}/tournaments/${card.tournament.slug}`}
            footerExtra={<TournamentFooterExtra card={card} />}
            // Esta sección es exclusiva de PLAYER (Dashboard deportivo) —
            // siempre el estado EFECTIVO, mismo criterio que
            // TournamentDetailView.tsx/TournamentsGrid.tsx.
            displayStatus={effectivePlayerTournamentStatus(card.tournament)}
          />
        ))}
      </div>
    </div>
  );
}
