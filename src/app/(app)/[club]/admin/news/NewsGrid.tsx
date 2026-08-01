"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Toast } from "@/components/ui";
import { NewsCard } from "./NewsCard";
import { CreateNewsModal } from "./CreateNewsModal";
import { EditNewsModal } from "./EditNewsModal";
import type { ClubNewsWithAuthor } from "@/types/database";

interface NewsGridProps {
  news: ClubNewsWithAuthor[];
  clubSlug: string;
  clubId: string;
}

export function NewsGrid({ news, clubSlug, clubId }: NewsGridProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingNews, setEditingNews] = useState<ClubNewsWithAuthor | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function handleCreateSuccess() {
    setCreating(false);
    setToastMessage("Noticia publicada correctamente");
    router.refresh();
  }

  function handleEditSuccess() {
    setEditingNews(null);
    setToastMessage("Cambios guardados correctamente");
    router.refresh();
  }

  return (
    <>
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Noticias</h1>
          <p className="text-brand-muted mt-1 text-sm">
            Comunica novedades, torneos, eventos y anuncios a tus jugadores.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nueva noticia
        </button>
      </div>

      {news.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Plus className="w-6 h-6 text-brand-muted" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">Todavía no hay noticias</h3>
          <p className="text-sm text-brand-muted max-w-sm mb-6">
            Publica la primera noticia para empezar a comunicarte con tus jugadores.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Nueva noticia
          </button>
        </div>
      ) : (
        /* justify-items-center: cada tarjeta trae su propio max-w-sm (ver
           NewsCard) para que las portraits no queden gigantes en desktop
           ancho — sin este centrado, "stretch" (el default de grid) las
           dejaría pegadas al borde izquierdo de su celda en vez de
           centradas dentro del espacio sobrante. */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
          {news.map((item) => (
            <NewsCard
              key={item.id}
              news={item}
              clubSlug={clubSlug}
              clubId={clubId}
              onEdit={() => setEditingNews(item)}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateNewsModal clubId={clubId} onClose={() => setCreating(false)} onSuccess={handleCreateSuccess} />
      )}

      {editingNews && (
        <EditNewsModal
          clubId={clubId}
          news={editingNews}
          onClose={() => setEditingNews(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </>
  );
}
