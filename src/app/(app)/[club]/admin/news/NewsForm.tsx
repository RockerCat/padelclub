"use client";

import { useActionState, useEffect } from "react";
import { Button, Input } from "@/components/ui";
import { NewsImageUpload } from "./NewsImageUpload";
import type { NewsFormState } from "./actions";
import type { ClubNews } from "@/types/database";

interface NewsFormProps {
  clubId: string;
  news?: ClubNews;
  // Bloque 2.7 — prellenado asistido (p. ej. desde la noticia de cierre de
  // un torneo). Solo tienen efecto en creación (news === undefined); una
  // edición real siempre sigue mostrando news.title/news.content/
  // news.image_url. El usuario puede modificar cualquier valor antes de
  // guardar — esto solo cambia el valor inicial del formulario, nunca
  // envía nada por sí mismo. defaultImageUrl reutiliza una URL ya
  // almacenada (p. ej. tournament.cover_image_url) tal cual, sin subir
  // ni duplicar ningún archivo — NewsImageUpload la trata exactamente
  // igual que una imagen ya cargada por el propio usuario: se puede
  // reemplazar con un nuevo archivo sin restricción alguna.
  defaultTitle?: string;
  defaultContent?: string;
  defaultImageUrl?: string | null;
  action: (prevState: NewsFormState, formData: FormData) => Promise<NewsFormState>;
  onSuccess: () => void;
  onCancel: () => void;
}

const initialState: NewsFormState = {};

export function NewsForm({
  clubId,
  news,
  defaultTitle,
  defaultContent,
  defaultImageUrl,
  action,
  onSuccess,
  onCancel,
}: NewsFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isEdit = !!news;

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    // Desktop (lg+): dos columnas — imagen (~35%, con un ancho máximo
    // fijo de 340px para que nunca crezca indefinidamente en pantallas
    // muy anchas) a la izquierda, formulario (~65%, y sigue creciendo
    // con el modal) a la derecha. Sin `items-start`: el grid usa el
    // `stretch` por defecto, así la columna derecha ocupa el 100% de la
    // altura real de la fila — eso es lo que le da a `flex-1` del
    // textarea espacio real para crecer, y lo que hace que el
    // `sticky top-0` de la imagen tenga "recorrido" para pegarse
    // mientras el formulario (más alto) hace scroll a su lado.
    //
    // Columna derecha = un único flex-col con Título → Contenido →
    // Botones, en ese orden real de DOM — el mismo bloque que en mobile
    // se ve simplemente como "el formulario" completo, antes de la
    // imagen (order-1 vs order-2). El textarea es el único hijo con
    // `flex-1`, así absorbe todo el espacio vertical sobrante entre el
    // título y los botones — estos últimos quedan siempre pegados al
    // final de la columna sin desplazarse según el largo del contenido,
    // nunca por márgenes/posicionamiento manual.
    <form
      action={formAction}
      className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,min(35%,340px))_minmax(0,1fr)] lg:gap-x-6"
    >
      <div className="order-1 lg:order-none lg:col-start-2 flex flex-col gap-4 lg:h-full">
        <Input
          name="title"
          label="Título"
          type="text"
          defaultValue={news?.title ?? defaultTitle ?? ""}
          required
          placeholder="Nuevo torneo este fin de semana"
        />

        <div className="flex flex-col gap-1.5 flex-1 min-h-0">
          <label className="text-sm font-medium text-white/80">Contenido</label>
          <textarea
            name="content"
            defaultValue={news?.content ?? defaultContent ?? ""}
            required
            placeholder="Cuéntale a tus jugadores los detalles..."
            rows={8}
            className="w-full flex-1 min-h-[420px] resize-y rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
          />
        </div>

        {state.error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 shrink-0">
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-3 shrink-0">
          <Button type="submit" loading={pending}>
            {isEdit ? "Guardar cambios" : "Publicar noticia"}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>

      <div className="order-2 lg:order-none lg:col-start-1 lg:row-start-1 lg:sticky lg:top-0">
        <NewsImageUpload clubId={clubId} currentImageUrl={news?.image_url ?? defaultImageUrl} />
      </div>
    </form>
  );
}
