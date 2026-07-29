"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { isoToBogotaWallClock } from "@/lib/utils/bogotaDatetime";
import type { Tournament, SportCategory } from "@/types/database";
import type { TournamentActionState } from "./actions";

interface TournamentFormProps {
  tournament?: Tournament;
  categories: Pick<SportCategory, "code" | "sort_order">[];
  action: (prevState: TournamentActionState, formData: FormData) => Promise<TournamentActionState>;
  onSuccess: (tournament: Tournament | undefined) => void;
  onCancel: () => void;
}

const BRACKET_SIZE_OPTIONS = [4, 8, 16];

const initialState: TournamentActionState = {};

// Shared by CreateTournamentModal and EditTournamentModal — the only
// difference between create/edit is the bound `action` and whether
// `tournament` is passed. Field-level lock rules for registration_open come
// straight from update_tournament's own validation (20260909000001): category,
// bracket_size and registration_opens_at are frozen once registration is
// open — never guessed, and the real backend error still surfaces if a race
// slips through (e.g. someone opened registration in another tab).
export function TournamentForm({ tournament, categories, action, onSuccess, onCancel }: TournamentFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isEdit = !!tournament;
  const lockedByRegistrationOpen = tournament?.status === "registration_open";

  // Controlled (unlike the rest of this form's uncontrolled defaultValue
  // fields) only because the secondary-category options depend reactively
  // on which primary category is currently selected — sort_order-based,
  // never a string/number comparison of the code itself.
  const [categoryCode, setCategoryCode] = useState(tournament?.category ?? "");
  const [secondaryCategoryCode, setSecondaryCategoryCode] = useState(tournament?.secondary_category ?? "");

  const primarySortOrder = categories.find((c) => c.code === categoryCode)?.sort_order;
  const secondaryOptions = categories.filter(
    (c) => primarySortOrder !== undefined && c.sort_order < primarySortOrder
  );

  function handleCategoryChange(code: string) {
    setCategoryCode(code);
    const newSortOrder = categories.find((c) => c.code === code)?.sort_order;
    const stillValid = secondaryCategoryCode
      ? categories.some(
          (c) => c.code === secondaryCategoryCode && newSortOrder !== undefined && c.sort_order < newSortOrder
        )
      : true;
    if (!stillValid) setSecondaryCategoryCode("");
  }

  useEffect(() => {
    if (!state.success) return;
    onSuccess(state.tournament);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        name="name"
        label="Nombre del torneo"
        type="text"
        defaultValue={tournament?.name ?? ""}
        required
        placeholder="Torneo de verano"
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-white/80">Descripción</label>
        <textarea
          name="description"
          defaultValue={tournament?.description ?? ""}
          placeholder="Descripción opcional..."
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Categoría principal</label>
          <select
            name="category"
            value={categoryCode}
            onChange={(e) => handleCategoryChange(e.target.value)}
            disabled={lockedByRegistrationOpen}
            required
            className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="" disabled className="bg-[#001A24]">
              Selecciona...
            </option>
            {categories.map((c) => (
              <option key={c.code} value={c.code} className="bg-[#001A24]">
                {c.code}
              </option>
            ))}
          </select>
          {lockedByRegistrationOpen && (
            <p className="text-xs text-brand-muted">No editable con inscripciones abiertas.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Categoría secundaria (opcional)</label>
          <select
            name="secondary_category"
            value={secondaryCategoryCode}
            onChange={(e) => setSecondaryCategoryCode(e.target.value)}
            disabled={lockedByRegistrationOpen || !categoryCode}
            className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="" className="bg-[#001A24]">
              Ninguna (categoría única)
            </option>
            {secondaryOptions.map((c) => (
              <option key={c.code} value={c.code} className="bg-[#001A24]">
                {c.code}
              </option>
            ))}
          </select>
          {lockedByRegistrationOpen && (
            <p className="text-xs text-brand-muted">No editable con inscripciones abiertas.</p>
          )}
        </div>
      </div>

      <p className="text-xs text-brand-muted -mt-2">
        Selecciona una segunda categoría para crear un torneo combinado. La categoría principal debe ser superior a la secundaria.
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-white/80">Tamaño del cuadro</label>
        <select
          name="bracket_size"
          defaultValue={tournament?.bracket_size ?? 8}
          disabled={lockedByRegistrationOpen}
          required
          className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {BRACKET_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size} className="bg-[#001A24]">
              {size} parejas
            </option>
          ))}
        </select>
        {lockedByRegistrationOpen && (
          <p className="text-xs text-brand-muted">No editable con inscripciones abiertas.</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-white/80">Visibilidad</label>
        <select
          name="visibility"
          defaultValue={tournament?.visibility ?? "private"}
          className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
        >
          <option value="private" className="bg-[#001A24]">
            Privado
          </option>
          <option value="public" className="bg-[#001A24]">
            Público
          </option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Apertura de inscripciones</label>
          <input
            type="datetime-local"
            name="registration_opens_at"
            defaultValue={isoToBogotaWallClock(tournament?.registration_opens_at ?? null)}
            disabled={lockedByRegistrationOpen}
            className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Cierre de inscripciones</label>
          <input
            type="datetime-local"
            name="registration_closes_at"
            defaultValue={isoToBogotaWallClock(tournament?.registration_closes_at ?? null)}
            className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Inicio del torneo</label>
          <input
            type="datetime-local"
            name="starts_at"
            defaultValue={isoToBogotaWallClock(tournament?.starts_at ?? null)}
            className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Fin del torneo</label>
          <input
            type="datetime-local"
            name="ends_at"
            defaultValue={isoToBogotaWallClock(tournament?.ends_at ?? null)}
            className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
          />
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {isEdit ? "Guardar cambios" : "Crear torneo"}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
