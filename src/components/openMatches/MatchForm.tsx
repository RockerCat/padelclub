"use client";

import { useState } from "react";
import { Button, Input, Switch } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import {
  OPEN_MATCH_COMMENT_MAX,
  OPEN_MATCH_LEVELS,
  OPEN_MATCH_MAX_PLAYERS,
  OPEN_MATCH_VENUE_MAX,
  maxOpenMatchDate,
  validateOpenMatchForm,
  type OpenMatchFormValues,
} from "@/lib/openMatches";
import { getBogotaNow } from "@/lib/utils/bogotaDatetime";
import { placeKey } from "@/lib/directory";
import { VenuePicker, type PickedVenue } from "./VenuePicker";

interface MatchFormProps {
  mode: "create" | "edit";
  initial: OpenMatchFormValues;
  /** Ciudades con partidos activos — solo sugerencias (datalist). */
  citySuggestions?: string[];
  /** Establecimiento del directorio ya elegido (edición, o "Organizar partido aquí"). */
  initialVenue?: PickedVenue | null;
  submitLabel: string;
  onSubmit: (values: OpenMatchFormValues) => Promise<string | null>;
  onCancel?: () => void;
}

const selectClass =
  "h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 [&>option]:bg-brand-surface";

// Un solo formulario corto para crear y editar: los campos opcionales
// (lugar, cancha, comentario) van al final y nunca bloquean.
export function MatchForm({ mode, initial, citySuggestions = [], initialVenue = null, submitLabel, onSubmit, onCancel }: MatchFormProps) {
  const [values, setValues] = useState<OpenMatchFormValues>({ ...initial, venueId: initialVenue?.id ?? null });
  const [venue, setVenue] = useState<PickedVenue | null>(initialVenue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const today = getBogotaNow().dateStr;

  function set<K extends keyof OpenMatchFormValues>(key: K, value: OpenMatchFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function pickVenue(next: PickedVenue | null) {
    setVenue(next);
    setValues((v) => ({ ...v, venueId: next?.id ?? null }));
  }

  // Un establecimiento de otro municipio dejaría de ser válido (el
  // servidor lo rechazaría): cambiar la ciudad quita la selección.
  function changeCity(city: string) {
    set("city", city);
    if (venue && placeKey(venue.municipality) !== placeKey(city)) pickVenue(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validateOpenMatchForm(values, getBogotaNow());
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await onSubmit(values);
    setSaving(false);
    if (result) setError(result);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        id="om-city"
        label="Ciudad"
        placeholder="Ej. Bogotá"
        value={values.city}
        onChange={(e) => changeCity(e.target.value)}
        list="om-city-suggestions"
        autoComplete="address-level2"
        maxLength={60}
        required
      />
      {citySuggestions.length > 0 && (
        <datalist id="om-city-suggestions">
          {citySuggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="om-date"
          type="date"
          label="Fecha"
          value={values.matchDate}
          min={today}
          max={maxOpenMatchDate(today)}
          onChange={(e) => set("matchDate", e.target.value)}
          required
        />
        <Input
          id="om-time"
          type="time"
          label="Hora tentativa"
          value={values.startTime}
          step={900}
          onChange={(e) => set("startTime", e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="om-level" className="text-sm font-medium text-white/80">Nivel</label>
        <select id="om-level" className={selectClass} value={values.level} onChange={(e) => set("level", e.target.value)}>
          {OPEN_MATCH_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
        <p className="text-xs text-brand-muted">Orientativo, para que se sumen jugadores parecidos.</p>
      </div>

      {mode === "create" && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-white/80">¿Cuántos son ya? (contándote)</legend>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: OPEN_MATCH_MAX_PLAYERS }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={values.playersAlready === n}
                onClick={() => set("playersAlready", n)}
                className={cn(
                  "h-10 rounded-xl border text-sm font-semibold transition-colors",
                  values.playersAlready === n
                    ? "border-brand-primary bg-brand-primary/15 text-brand-primary"
                    : "border-white/10 text-white hover:border-white/30"
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-brand-muted">
            {values.playersAlready === 1
              ? "Solo tú: buscas 3 jugadores."
              : values.playersAlready === OPEN_MATCH_MAX_PLAYERS
                ? "Ya están completos: úsalo para coordinar la cancha."
                : `Tú y ${(values.playersAlready ?? 1) - 1} acompañante${(values.playersAlready ?? 1) - 1 === 1 ? "" : "s"}: buscas ${OPEN_MATCH_MAX_PLAYERS - (values.playersAlready ?? 1)}. Podrás liberar esos cupos después.`}
          </p>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-white/80">Dónde (opcional)</legend>
        <VenuePicker city={values.city} value={venue} onChange={pickVenue} />
        {!venue && (
          <Input
            id="om-venue"
            aria-label="Otro lugar o cancha"
            placeholder="Otro lugar: ej. Club Norte, cancha 2"
            value={values.venueName}
            maxLength={OPEN_MATCH_VENUE_MAX}
            onChange={(e) => set("venueName", e.target.value)}
          />
        )}
        <p className="text-xs text-brand-muted">
          Elegir un lugar no reserva la cancha ni confirma disponibilidad: consúltalo directamente con el establecimiento.
        </p>
      </fieldset>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div>
          <p className="text-sm font-medium text-white">Ya reservé la cancha</p>
          <p className="text-xs text-brand-muted">
            Márcalo cuando la tengas confirmada con el club. Puedes hacerlo antes o después de completar jugadores.
          </p>
        </div>
        <Switch checked={values.courtBooked} onChange={(v) => set("courtBooked", v)} label="Ya reservé la cancha" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="om-comment" className="text-sm font-medium text-white/80">Comentario (opcional)</label>
        <textarea
          id="om-comment"
          rows={2}
          maxLength={OPEN_MATCH_COMMENT_MAX}
          value={values.comment}
          onChange={(e) => set("comment", e.target.value)}
          placeholder="Ej. Partido amistoso, dividimos la cancha."
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-base md:text-sm text-white placeholder:text-brand-muted/60 hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
        />
        <p className="text-xs text-brand-muted">No incluyas teléfonos: el enlace del partido es público.</p>
      </div>

      {mode === "edit" && (
        <p className="text-xs text-amber-300/90">
          Si cambias ciudad, fecha, hora o el lugar, los demás jugadores tendrán que confirmar de nuevo su asistencia.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="lg" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
