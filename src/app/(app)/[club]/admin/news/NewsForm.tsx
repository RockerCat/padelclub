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
  // edición real siempre sigue mostrando news.title/news.content. El
  // usuario puede modificar cualquier texto antes de guardar — esto solo
  // cambia el valor inicial del formulario, nunca envía nada por sí mismo.
  defaultTitle?: string;
  defaultContent?: string;
  action: (prevState: NewsFormState, formData: FormData) => Promise<NewsFormState>;
  onSuccess: () => void;
  onCancel: () => void;
}

const initialState: NewsFormState = {};

export function NewsForm({ clubId, news, defaultTitle, defaultContent, action, onSuccess, onCancel }: NewsFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isEdit = !!news;

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <NewsImageUpload clubId={clubId} currentImageUrl={news?.image_url} />

      <Input
        name="title"
        label="Título"
        type="text"
        defaultValue={news?.title ?? defaultTitle ?? ""}
        required
        placeholder="Nuevo torneo este fin de semana"
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-white/80">Contenido</label>
        <textarea
          name="content"
          defaultValue={news?.content ?? defaultContent ?? ""}
          required
          placeholder="Cuéntale a tus jugadores los detalles..."
          rows={6}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {isEdit ? "Guardar cambios" : "Publicar noticia"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
