"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog, Toast } from "@/components/ui";
import { deleteNews } from "./actions";
import { newsDetailPath } from "@/lib/newsPaths";
import type { ClubNewsWithAuthor } from "@/types/database";

interface NewsCardProps {
  news: ClubNewsWithAuthor;
  clubSlug: string;
  clubId: string;
  onEdit: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function NewsCard({ news, clubSlug, clubId, onEdit }: NewsCardProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function handleConfirmDelete() {
    startDelete(async () => {
      const result = await deleteNews(clubId, news.id);
      setConfirmOpen(false);
      if (!result.error) {
        setToastMessage("Noticia eliminada correctamente");
      }
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-sm bg-brand-surface border border-white/10 rounded-2xl overflow-hidden flex flex-col">
      {/* Portrait — misma proporción ya usada por el modal de creación/
          edición (NewsImageUpload), el detalle público de la noticia y la
          portada de torneo (aspect-[3/4] en los tres), nunca un recorte
          horizontal. `overflow-hidden` en el contenedor padre ya redondea
          la esquina superior; la relación fija evita cualquier layout
          shift mientras la imagen carga. */}
      <div className="aspect-[3/4] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={news.image_url} alt={news.title} className="w-full h-full object-cover" />
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 title={news.title} className="text-sm font-semibold text-white line-clamp-2">
          {news.title}
        </h3>
        <p className="text-xs text-brand-muted">
          {formatDate(news.published_at)}
          {news.created_by_profile?.full_name && ` · ${news.created_by_profile.full_name}`}
        </p>

        <div className="flex items-center flex-wrap gap-2 mt-auto pt-3 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar
          </button>
          <a
            href={newsDetailPath(clubSlug, news.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-white hover:bg-white/5 transition-colors ml-auto"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ver publicación
          </a>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Eliminar noticia"
        message={`¿Deseas eliminar "${news.title}"?\nEsta acción no se puede deshacer.`}
        confirmLabel="Eliminar noticia"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
