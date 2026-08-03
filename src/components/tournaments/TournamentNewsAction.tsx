"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Megaphone, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui";
import { CreateNewsModal } from "@/app/(app)/[club]/admin/news/CreateNewsModal";
import { buildTournamentNewsDraft } from "@/lib/tournamentNewsDraft";
import { newsDetailPath } from "@/lib/newsPaths";
import type { TournamentClassificationRow } from "@/lib/tournamentEntries";
import type { Tournament } from "@/types/database";

interface TournamentNewsActionProps {
  clubId: string;
  clubSlug: string;
  tournament: Pick<Tournament, "id" | "name" | "category" | "secondary_category" | "cover_image_url" | "prize_description">;
  classification: TournamentClassificationRow[];
  // slug de la noticia YA publicada y asociada a este torneo
  // (tournament_id real en club_news), resuelta por el Server Component
  // padre — nunca detectada aquí por título/contenido/fecha. null cuando
  // todavía no existe ninguna.
  existingNewsSlug: string | null;
}

// Cierre editorial del torneo — solo se monta cuando el llamador ya
// decidió que corresponde mostrarlo (OWNER/ADMIN, torneo completed; ver
// TournamentDetailView). "Generar noticia" reutiliza el flujo normal de
// Noticias (CreateNewsModal → NewsForm → createNews) sin crear un
// segundo formulario — únicamente le agrega el tournament.id como
// argumento del server action, nunca como campo visible/editable, y
// (cuando existe) tournament.cover_image_url como imagen inicial ya
// cargada — la misma URL de Storage, nunca una subida nueva; sigue
// siendo editable/reemplazable como cualquier otra imagen del
// formulario. Sin portada, el comportamiento actual no cambia (imagen
// vacía, obligatoria antes de publicar). Tras publicar, la única fuente
// de verdad de "ya existe" vuelve a ser la base de datos (router.
// refresh() releerá club_news vía el padre) — este componente nunca
// asume éxito antes de que el servidor lo confirme.
export function TournamentNewsAction({
  clubId,
  clubSlug,
  tournament,
  classification,
  existingNewsSlug,
}: TournamentNewsActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (existingNewsSlug) {
    return (
      <Link
        href={newsDetailPath(clubSlug, existingNewsSlug)}
        className="flex items-center gap-2.5 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3.5 text-sm font-medium text-emerald-300 hover:bg-emerald-400/10 transition-colors"
      >
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span className="flex-1 min-w-0">Ver noticia</span>
        <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" />
      </Link>
    );
  }

  const draft = buildTournamentNewsDraft(tournament, classification);

  return (
    <>
      <Button className="w-full justify-center" onClick={() => setOpen(true)}>
        <Megaphone className="w-4 h-4" />
        Generar noticia
      </Button>

      {open && (
        <CreateNewsModal
          clubId={clubId}
          tournamentId={tournament.id}
          defaultTitle={draft.title}
          defaultContent={draft.content}
          defaultImageUrl={tournament.cover_image_url}
          onClose={() => setOpen(false)}
          onSuccess={() => {
            // Cerrar sin marcar nada como "generado" todavía — recién lo
            // está al llegar la respuesta fresca del servidor
            // (existingNewsId) tras el refresh, nunca antes.
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
