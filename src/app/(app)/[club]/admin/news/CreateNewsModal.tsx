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
  // Reutiliza una URL ya almacenada (p. ej. tournament.cover_image_url)
  // como imagen inicial — nunca sube ni duplica ningún archivo, solo
  // precarga NewsImageUpload exactamente como si esa imagen ya hubiera
  // sido seleccionada por el usuario. Sigue siendo reemplazable sin
  // restricción; si el torneo no tiene portada, undefined deja el
  // comportamiento actual (sin imagen, obligatoria antes de publicar).
  defaultImageUrl?: string | null;
  // Cierre editorial de un torneo — se ata como argumento del server
  // action (createNews.bind), nunca como campo del formulario: el
  // usuario no ve ni puede editar/seleccionar el torneo. undefined para
  // el flujo normal de Noticias (comportamiento sin cambios).
  tournamentId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateNewsModal({
  clubId,
  defaultTitle,
  defaultContent,
  defaultImageUrl,
  tournamentId,
  onClose,
  onSuccess,
}: CreateNewsModalProps) {
  const boundCreate = createNews.bind(null, clubId, tournamentId ?? null);

  return (
    <SettingsModuleModal title="Nueva noticia" onClose={onClose} size="xl">
      <NewsForm
        clubId={clubId}
        defaultTitle={defaultTitle}
        defaultContent={defaultContent}
        defaultImageUrl={defaultImageUrl}
        action={boundCreate}
        onSuccess={onSuccess}
        onCancel={onClose}
      />
    </SettingsModuleModal>
  );
}
