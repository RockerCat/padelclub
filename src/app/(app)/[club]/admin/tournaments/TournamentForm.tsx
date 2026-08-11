"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { isoToBogotaWallClock } from "@/lib/utils/bogotaDatetime";
import { defaultEstimatedDurationMinutes, hoursInputToMinutes, minutesToHoursInputValue } from "@/lib/utils/tournamentDuration";
import { isStructuralFieldsLocked } from "../../../../../../shared/tournaments/actions";
import { TournamentImageUpload } from "./TournamentImageUpload";
import type { Tournament, SportCategory } from "@/types/database";
import type { TournamentActionState } from "./actions";

interface TournamentFormProps {
  clubId: string;
  tournament?: Tournament;
  categories: Pick<SportCategory, "code" | "sort_order">[];
  action: (prevState: TournamentActionState, formData: FormData) => Promise<TournamentActionState>;
  onSuccess: (tournament: Tournament | undefined) => void;
  onCancel: () => void;
  // Duplas activas (pending + confirmed) — el mismo capacity.occupied ya
  // usado por el contador y la barra de progreso, nunca un segundo
  // cálculo. Es el mínimo real que backend acepta para max_pairs; solo
  // aplica en edición, la creación no tiene inscripciones todavía.
  minMaxPairs?: number;
}

const initialState: TournamentActionState = {};

// Solo para la vista de solo lectura de "Apertura de inscripciones" cuando
// el campo está congelado — el valor real que viaja al backend sigue
// siendo el datetime-local crudo del input oculto, esto es puramente
// cosmético.
function formatWallClockDisplay(value: string): string {
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return value || "—";
  const [year, month, day] = datePart.split("-");
  return `${day}/${month}/${year} ${timePart}`;
}

// Shared by CreateTournamentModal and EditTournamentModal — the only
// difference between create/edit is the bound `action` and whether
// `tournament` is passed. Field-level lock rules come straight from
// update_tournament's own validation: category, secondary_category and
// registration_opens_at are frozen once registration is open OR closed.
// max_pairs stays editable through registration_open/registration_closed
// too — only backend-enforced floor is the current count of active
// (pending+confirmed) entries, via `minMaxPairs`, never a hard freeze —
// never guessed, and the real backend error still surfaces if a race
// slips through (e.g. someone opened
// registration in another tab).
export function TournamentForm({ clubId, tournament, categories, action, onSuccess, onCancel, minMaxPairs = 1 }: TournamentFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isEdit = !!tournament;
  // Un torneo nunca debe permitir menos de 2 duplas de cupo — piso
  // absoluto, independiente de minMaxPairs (que solo refleja duplas ya
  // activas al editar).
  const effectiveMinMaxPairs = Math.max(2, minMaxPairs);
  const [maxPairsError, setMaxPairsError] = useState<string | null>(null);
  const structuralFieldsLocked = !!tournament && isStructuralFieldsLocked(tournament.status);

  // Todos los campos de este formulario son controlados (value+onChange,
  // nunca defaultValue) por la misma razón: React resetea los campos no
  // controlados de un <form action={...}> en cuanto la Server Action
  // resuelve — sin importar si el resultado fue éxito o un {error: "..."}
  // devuelto normalmente (React solo sabe que la promesa no fue
  // rechazada). Un campo controlado no depende de ese reset nativo porque
  // React vuelve a aplicar su propio `value` en cada render, incluida la
  // re-renderización que muestra el error.
  const [categoryCode, setCategoryCode] = useState(tournament?.category ?? "");
  const [secondaryCategoryCode, setSecondaryCategoryCode] = useState(tournament?.secondary_category ?? "");
  const [nameInput, setNameInput] = useState(tournament?.name ?? "");
  const [descriptionInput, setDescriptionInput] = useState(tournament?.description ?? "");
  const [visibilityInput, setVisibilityInput] = useState(tournament?.visibility ?? "private");
  // Al crear: plantilla editable de premios, nunca sobreescrita si el
  // usuario la borra o modifica. Al editar: siempre el valor guardado,
  // nunca la plantilla.
  const [prizeInput, setPrizeInput] = useState(() =>
    isEdit ? tournament!.prize_description ?? "" : "🥇 1er lugar:\n🥈 2do lugar:"
  );
  // Valor de inscripción por persona, COP. 0 por defecto al crear; al
  // editar siempre el valor realmente guardado.
  const [entryFeeAmountInput, setEntryFeeAmountInput] = useState(() =>
    String(tournament?.entry_fee_amount ?? 0)
  );

  // Al crear: la hora local actual, calculada en el momento en que este
  // formulario se monta (nunca al momento del build, nunca una constante
  // global) — el usuario puede editarla libremente después. Al editar: el
  // valor ya guardado del torneo, nunca reemplazado por la hora actual.
  const [registrationOpensAtInput, setRegistrationOpensAtInput] = useState(() =>
    isEdit ? isoToBogotaWallClock(tournament!.registration_opens_at) : isoToBogotaWallClock(new Date().toISOString())
  );

  // Cierre de inscripciones — se autocompleta con el mismo valor de
  // "Inicio del torneo" mientras el usuario no lo haya editado
  // manualmente (closesAtTouched). En edición, closesAtTouched arranca en
  // true: el valor guardado se conserva siempre y nunca se recalcula.
  const [startsAtInput, setStartsAtInput] = useState(() => isoToBogotaWallClock(tournament?.starts_at ?? null));
  const [registrationClosesAtInput, setRegistrationClosesAtInput] = useState(() =>
    isoToBogotaWallClock(tournament?.registration_closes_at ?? null)
  );
  const [closesAtTouched, setClosesAtTouched] = useState(isEdit);

  function handleStartsAtChange(value: string) {
    setStartsAtInput(value);
    if (!isEdit && !closesAtTouched) {
      setRegistrationClosesAtInput(value);
    }
  }

  function handleClosesAtChange(value: string) {
    setRegistrationClosesAtInput(value);
    setClosesAtTouched(true);
  }

  // Duración estimada — el organizador solo ve horas; minutos siguen
  // siendo la unidad real almacenada y enviada al backend (input oculto).
  // Mismo patrón de autocompletado que el resto del formulario: se
  // recalcula desde "Cupo máximo de parejas" (30 min por pareja) mientras
  // el usuario no la haya editado manualmente. En edición arranca desde
  // el valor guardado y con durationTouched=true, nunca se recalcula.
  const initialMaxPairs = tournament?.max_pairs ?? 8;
  const [maxPairsInput, setMaxPairsInput] = useState(() => String(initialMaxPairs));
  const [durationHoursInput, setDurationHoursInput] = useState(() =>
    minutesToHoursInputValue(tournament?.estimated_duration_minutes ?? defaultEstimatedDurationMinutes(initialMaxPairs))
  );
  const [durationTouched, setDurationTouched] = useState(isEdit);
  const durationMinutesForSubmit = hoursInputToMinutes(durationHoursInput);

  function handleMaxPairsChange(value: string) {
    setMaxPairsInput(value);
    const parsedMaxPairs = parseInt(value, 10);
    if (!durationTouched && Number.isInteger(parsedMaxPairs) && parsedMaxPairs > 0) {
      setDurationHoursInput(minutesToHoursInputValue(defaultEstimatedDurationMinutes(parsedMaxPairs)));
    }
  }

  function handleDurationHoursChange(value: string) {
    setDurationHoursInput(value);
    setDurationTouched(true);
  }

  // Defensa ante cualquier divergencia entre categoryCode (siempre
  // inicializado desde tournament.category/secondary_category, nunca
  // desde una "categoría por defecto") y el catálogo `categories`
  // recibido: si el código real del torneo no tiene una <option>
  // correspondiente, un <select> controlado cuyo value no matchea
  // ninguna opción cae al fallback silencioso del navegador (la primera
  // opción habilitada de la lista) — sustituyendo visualmente la
  // categoría real por otra sin que el estado de React cambie. Se
  // garantiza aquí que la opción siempre exista, para cualquiera de las
  // 7 categorías fijas (nunca una hardcodeada) — nunca afecta la
  // elegibilidad real ni el catálogo mostrado al crear.
  const categoryOptions =
    categoryCode && !categories.some((c) => c.code === categoryCode)
      ? [{ code: categoryCode, sort_order: -1 }, ...categories]
      : categories;

  const primarySortOrder = categoryOptions.find((c) => c.code === categoryCode)?.sort_order;
  const secondaryOptionsBase = categoryOptions.filter(
    (c) => primarySortOrder !== undefined && c.sort_order < primarySortOrder
  );
  const secondaryOptions =
    secondaryCategoryCode && !secondaryOptionsBase.some((c) => c.code === secondaryCategoryCode)
      ? [{ code: secondaryCategoryCode, sort_order: -1 }, ...secondaryOptionsBase]
      : secondaryOptionsBase;

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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const parsedMaxPairs = parseInt(maxPairsInput, 10);
    if (!Number.isInteger(parsedMaxPairs) || parsedMaxPairs < 2) {
      e.preventDefault();
      setMaxPairsError("Un torneo debe permitir al menos 2 duplas.");
      return;
    }
    setMaxPairsError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Columna izquierda: identidad y configuración del evento */}
        <div className="flex flex-col gap-4 min-w-0">
          <Input
            name="name"
            label="Nombre del torneo"
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            required
            placeholder="Torneo de verano"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/80">Descripción</label>
            <textarea
              name="description"
              value={descriptionInput}
              onChange={(e) => setDescriptionInput(e.target.value)}
              placeholder="Descripción o reglas opcionales..."
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/80">Categoría principal</label>
              {/* Sin `name` en ningún caso: el input oculto de abajo es
                  quien siempre envía el valor real. Cuando la categoría
                  está congelada por reglas de negocio (inscripciones
                  abiertas o cerradas), no se renderiza un <select
                  disabled> en absoluto — un control de formulario
                  deshabilitado sigue siendo un elemento nativo que el
                  navegador puede resetear a su primera <option> al
                  reenviar el formulario (p.ej. tras un error de otro
                  campo), lo que antes hacía que categoryCode y el propio
                  DOM del <select> divergieran visualmente sin que React
                  llegara a notarlo. Un <div> de solo lectura no es un
                  control de formulario: no puede ser reseteado por el
                  navegador bajo ninguna circunstancia. */}
              {structuralFieldsLocked ? (
                <div className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 flex items-center text-base md:text-sm text-white/50">
                  {categoryCode || "—"}
                </div>
              ) : (
                <select
                  value={categoryCode}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  required
                  className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
                >
                  <option value="" disabled className="bg-[#001A24]">
                    Selecciona...
                  </option>
                  {categoryOptions.map((c) => (
                    <option key={c.code} value={c.code} className="bg-[#001A24]">
                      {c.code}
                    </option>
                  ))}
                </select>
              )}
              <input type="hidden" name="category" value={categoryCode} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/80">Categoría secundaria</label>
              {structuralFieldsLocked ? (
                <div className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 flex items-center text-base md:text-sm text-white/50">
                  {secondaryCategoryCode || "Ninguna"}
                </div>
              ) : (
                <select
                  value={secondaryCategoryCode}
                  onChange={(e) => setSecondaryCategoryCode(e.target.value)}
                  disabled={!categoryCode}
                  className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="" className="bg-[#001A24]">
                    Ninguna
                  </option>
                  {secondaryOptions.map((c) => (
                    <option key={c.code} value={c.code} className="bg-[#001A24]">
                      {c.code}
                    </option>
                  ))}
                </select>
              )}
              <input type="hidden" name="secondary_category" value={secondaryCategoryCode} />
            </div>
          </div>
          <p className="text-xs text-brand-muted -mt-2">
            Selecciona una segunda categoría para un torneo combinado. La principal debe ser superior a la secundaria.
          </p>
          {structuralFieldsLocked && (
            <p className="text-xs text-brand-muted -mt-2">
              Categoría y apertura de inscripciones ya no son editables.
            </p>
          )}

          <Input
            name="max_pairs"
            label="Cupo máximo de duplas"
            type="number"
            min={effectiveMinMaxPairs}
            step={1}
            value={maxPairsInput}
            onChange={(e) => handleMaxPairsChange(e.target.value)}
            hint={isEdit ? `Mínimo permitido: ${effectiveMinMaxPairs} duplas registradas actualmente.` : undefined}
            required
          />

          <Input
            name="entry_fee_amount"
            label="Valor de inscripción por persona"
            type="number"
            min={0}
            step={1}
            value={entryFeeAmountInput}
            onChange={(e) => setEntryFeeAmountInput(e.target.value)}
            hint="Moneda: COP. Usa 0 para inscripción gratuita."
            required
          />
        </div>

        {/* Columna derecha: imagen, visibilidad y premios */}
        <div className="flex flex-col gap-4 min-w-0">
          <TournamentImageUpload clubId={clubId} currentImageUrl={tournament?.cover_image_url} />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/80">Visibilidad</label>
            <select
              name="visibility"
              value={visibilityInput}
              onChange={(e) => setVisibilityInput(e.target.value)}
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

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/80">Premios (opcional)</label>
            <textarea
              name="prize_description"
              value={prizeInput}
              onChange={(e) => setPrizeInput(e.target.value)}
              placeholder={"Ej.\n🥇 1er lugar: Trofeo + $500.000\n🥈 2do lugar: Gatorade + bonos\n🎁 Rifas de patrocinadores"}
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Apertura de inscripciones</label>
          {/* Mismo motivo que la categoría: sin `name` en el control
              visible, y sin dejarlo como un <input disabled> nativo
              cuando está congelado — un input deshabilitado se excluye
              del FormData del submit (lo que hacía que
              registration_opens_at llegara como null al backend y
              disparara "cannot change" incluso sin haberlo tocado), y
              además sigue siendo un control nativo que el navegador
              puede resetear. El input oculto de abajo es la única fuente
              real del valor enviado, siempre. */}
          {structuralFieldsLocked ? (
            <div className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 flex items-center text-base md:text-sm text-white/50">
              {formatWallClockDisplay(registrationOpensAtInput)}
            </div>
          ) : (
            <input
              type="datetime-local"
              value={registrationOpensAtInput}
              onChange={(e) => setRegistrationOpensAtInput(e.target.value)}
              className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
            />
          )}
          <input type="hidden" name="registration_opens_at" value={registrationOpensAtInput} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Inicio del torneo</label>
          <input
            type="datetime-local"
            name="starts_at"
            value={startsAtInput}
            onChange={(e) => handleStartsAtChange(e.target.value)}
            className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Cierre de inscripciones</label>
          <input
            type="datetime-local"
            name="registration_closes_at"
            value={registrationClosesAtInput}
            onChange={(e) => handleClosesAtChange(e.target.value)}
            className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Duración estimada</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="any"
              value={durationHoursInput}
              onChange={(e) => handleDurationHoursChange(e.target.value)}
              required
              className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
            />
            <span className="text-sm text-brand-muted shrink-0">horas</span>
          </div>
          <input type="hidden" name="estimated_duration_minutes" value={durationMinutesForSubmit} />
        </div>
      </div>

      {(maxPairsError || state.error) && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {maxPairsError || state.error}
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
