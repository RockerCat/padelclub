"use client";

import { SettingsModuleModal } from "../settings/SettingsModuleModal";
import { NewsForm } from "./NewsForm";
import { createNews } from "./actions";

interface CreateNewsModalProps {
  clubId: string;
  // Bloque 2.7 — permite abrir el modal con el título/contenido ya
  // prellenados (p. ej. el cierre editorial de un torneo premiado), sin
  // crear un segundo modal ni un segundo formulario. Todo sigue siendo
  // editable y la publicación sigue requiriendo que el usuario presione
  // "Publicar noticia" dentro del propio formulario.
  defaultTitle?: string;
  defaultContent?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateNewsModal({ clubId, defaultTitle, defaultContent, onClose, onSuccess }: CreateNewsModalProps) {
  const boundCreate = createNews.bind(null, clubId);

  return (
    <SettingsModuleModal title="Nueva noticia" onClose={onClose} size="lg">
      <NewsForm
        clubId={clubId}
        defaultTitle={defaultTitle}
        defaultContent={defaultContent}
        action={boundCreate}
        onSuccess={onSuccess}
        onCancel={onClose}
      />
    </SettingsModuleModal>
  );
}
