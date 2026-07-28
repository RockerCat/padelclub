"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { changePlayerCategory, type ChangeCategoryState } from "./actions";
import { CATEGORY_CHANGE_TYPES, SPORT_NOTE_MAX_LENGTH } from "@/lib/sportOperations";
import type { SportCategory } from "@/types/database";

interface ChangePlayerCategoryModalProps {
  clubId: string;
  clubSlug: string;
  clubMemberId: string;
  playerName: string;
  currentCategory: string | null;
  categories: SportCategory[];
  onClose: () => void;
  onSuccess: (newCategory: string) => void;
}

// Fase 1 módulo deportivo — cambio manual de categoría. Toda regla real
// (validar destino, validar ascenso/descenso contra el orden real,
// reiniciar puntos a 0, snapshot de historial) vive en
// change_club_player_category (SECURITY DEFINER); este componente solo
// recopila la entrada y muestra la advertencia obligatoria.
export function ChangePlayerCategoryModal({
  clubId,
  clubSlug,
  clubMemberId,
  playerName,
  currentCategory,
  categories,
  onClose,
  onSuccess,
}: ChangePlayerCategoryModalProps) {
  const boundAction = changePlayerCategory.bind(null, clubId, clubMemberId, clubSlug);
  const [state, action, pending] = useActionState<ChangeCategoryState, FormData>(boundAction, {});
  const [targetCategory, setTargetCategory] = useState("");
  const [changeType, setChangeType] = useState("");
  const [note, setNote] = useState("");

  const canSubmit =
    targetCategory.length > 0 &&
    targetCategory !== currentCategory &&
    changeType.length > 0 &&
    note.trim().length > 0;

  useEffect(() => {
    if (state.success && state.newCategory) {
      onSuccess(state.newCategory);
    }
  }, [state.success, state.newCategory, onSuccess]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[500]"
      style={{ backdropFilter: "blur(4px)" }}
      onClick={onClose}
      aria-hidden
    >
      <div
        className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-auto w-full md:w-[440px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col isolate"
          style={{ maxHeight: "90dvh" }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">Cambiar categoría</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5">
            <form action={action} className="flex flex-col gap-4">
              <p className="text-sm text-white/80 truncate">{playerName}</p>

              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-muted">Categoría actual</span>
                <span className="text-white">{currentCategory ?? "—"}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="target_category" className="text-xs font-medium text-brand-muted">
                  Categoría destino
                </label>
                <select
                  id="target_category"
                  name="target_category"
                  value={targetCategory}
                  onChange={(e) => setTargetCategory(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
                >
                  <option value="" disabled className="bg-[#001A24]">
                    Selecciona una categoría
                  </option>
                  {categories.map((c) => (
                    <option
                      key={c.code}
                      value={c.code}
                      disabled={c.code === currentCategory}
                      className="bg-[#001A24]"
                    >
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="change_type" className="text-xs font-medium text-brand-muted">
                  Tipo de cambio
                </label>
                <select
                  id="change_type"
                  name="change_type"
                  value={changeType}
                  onChange={(e) => setChangeType(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
                >
                  <option value="" disabled className="bg-[#001A24]">
                    Selecciona un tipo
                  </option>
                  {CATEGORY_CHANGE_TYPES.map((t) => (
                    <option key={t.code} value={t.code} className="bg-[#001A24]">
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="category_note" className="text-xs font-medium text-brand-muted">
                  Nota
                </label>
                <textarea
                  id="category_note"
                  name="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={SPORT_NOTE_MAX_LENGTH}
                  rows={3}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none"
                />
              </div>

              <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                El jugador comenzará con 0 puntos en la nueva categoría.
              </p>

              {state.error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {state.error}
                </p>
              )}

              {state.success && (
                <p className="text-sm text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-xl px-4 py-3">
                  Categoría actualizada correctamente.
                </p>
              )}

              <div className="pt-1 flex justify-end">
                <Button type="submit" disabled={!canSubmit} loading={pending}>
                  {pending ? "Guardando…" : "Confirmar cambio"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
