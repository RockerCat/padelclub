"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Newspaper } from "lucide-react";
import { Button, Toast } from "@/components/ui";
import { CreateNewsModal } from "@/app/(app)/[club]/admin/news/CreateNewsModal";
import { buildTournamentNewsDraft } from "@/lib/tournamentNewsDraft";
import type { TournamentAwardSummary } from "@/lib/tournamentAwards";
import type { Tournament } from "@/types/database";

interface TournamentNewsSectionProps {
  clubId: string;
  tournament: Pick<Tournament, "name" | "category" | "secondary_category" | "completed_at" | "status">;
  summary: TournamentAwardSummary;
}

// OWNER/ADMIN-only (mounted only from the admin tournament detail page,
// which already redirects PLAYER away entirely — see
// admin/tournaments/[tournamentId]/page.tsx — so no separate role check is
// needed here). Reuses the real, existing Noticias creation flow verbatim
// (CreateNewsModal → NewsForm → createNews) — never a second news module,
// never an auto-submit. The generated draft only fills the form's initial
// values; the OWNER/ADMIN can edit any text, must still attach an image
// (same requirement as any other news post, never bypassed here), and must
// still press "Publicar noticia" themselves inside the real form — nothing
// is ever published automatically from this section.
export function TournamentNewsSection({ clubId, tournament, summary }: TournamentNewsSectionProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Section only appears once the tournament is completed AND its points
  // have been awarded — before that there is nothing real to report, and
  // CLAUDE.md's own "avoid placeholder screens" principle argues against
  // showing an empty "Noticia del torneo" section earlier.
  //
  // Known limitation (Bloque 2.7, intentionally not addressed): club_news
  // has no tournament_id column, so nothing here can detect or block a
  // second "Generar noticia" for the same tournament. Adding that link
  // would require a schema change, which is out of this block's scope —
  // documented here rather than worked around.
  if (tournament.status !== "completed" || summary.state !== "awarded") return null;

  const draft = buildTournamentNewsDraft(tournament, summary);

  function handleSuccess() {
    setCreating(false);
    setToastMessage("Noticia publicada correctamente");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h2 className="text-lg font-semibold text-white">Noticia del torneo</h2>

      <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 flex flex-col gap-3 items-start">
        <p className="text-sm text-brand-muted">
          Genera una noticia prellenada con los resultados de este torneo. Podrás editar el texto y
          agregar una imagen antes de publicarla.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Newspaper className="w-4 h-4" />
          Generar noticia
        </Button>
      </div>

      {creating && (
        <CreateNewsModal
          clubId={clubId}
          defaultTitle={draft.title}
          defaultContent={draft.content}
          onClose={() => setCreating(false)}
          onSuccess={handleSuccess}
        />
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
