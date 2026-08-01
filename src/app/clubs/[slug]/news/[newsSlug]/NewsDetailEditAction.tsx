"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Toast } from "@/components/ui";
import { EditNewsModal } from "@/app/(app)/[club]/admin/news/EditNewsModal";
import type { ClubNews } from "@/types/database";

interface NewsDetailEditActionProps {
  clubId: string;
  news: ClubNews;
}

// Único punto de edición de una noticia ya publicada visible desde el
// detalle público — el llamador (page.tsx) ya decidió que corresponde
// mostrarlo (OWNER/ADMIN con membresía activa, re-validado igual del
// lado del servidor por la propia Server Action). Reutiliza EditNewsModal
// tal cual (mismo formulario, mismo modal, misma Server Action ya usados
// desde /admin/news) — nunca un segundo formulario ni una segunda acción
// de actualización.
export function NewsDetailEditAction({ clubId, news }: NewsDetailEditActionProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function handleSuccess() {
    setEditing(false);
    setToastMessage("Noticia actualizada correctamente");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-white hover:bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
        Editar noticia
      </button>

      {editing && (
        <EditNewsModal clubId={clubId} news={news} onClose={() => setEditing(false)} onSuccess={handleSuccess} />
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </>
  );
}
