"use client";

import { useActionState, useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import type { ReservationFormState } from "./actions";

type Court = { id: string; name: string };
type Member = { profile_id: string; full_name: string | null };

type InitialValues = {
  court_id?: string;
  date?: string;
  start_time?: string;
  duration_minutes?: number;
  type?: string;
  title?: string;
  notes?: string;
  player_ids?: string[];
};

interface ReservationFormProps {
  action: (prev: ReservationFormState, formData: FormData) => Promise<ReservationFormState>;
  courts: Court[];
  members: Member[];
  defaultDate: string;
  initialValues?: InitialValues;
  submitLabel?: string;
  cancelHref: string;
  onSuccess?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  inModal?: boolean;
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 disabled:opacity-50";

const selectClass =
  "h-10 w-full rounded-xl border border-white/10 bg-brand-surface px-3 text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 appearance-none cursor-pointer";

const labelClass = "text-sm font-medium text-white/80";

const DURATION_OPTIONS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hora" },
  { value: "90", label: "1 h 30 min" },
  { value: "120", label: "2 horas" },
];

const TYPE_OPTIONS = [
  { value: "match", label: "Partido" },
  { value: "class", label: "Clase" },
  { value: "block", label: "Bloqueo" },
];

export function ReservationForm({
  action,
  courts,
  members,
  defaultDate,
  initialValues,
  submitLabel = "Crear reserva",
  cancelHref,
  onSuccess,
  onDirtyChange,
  inModal,
}: ReservationFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  useEffect(() => {
    if (state?.success) onSuccess?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.success]);

  // ─── Controlled field state ── all values live here, never in DOM ───────────
  // Compute local today (uses local time, not UTC) for min-date constraint
  const localToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const [courtId, setCourtId] = useState(initialValues?.court_id ?? "");
  const [date, setDate] = useState(initialValues?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(
    initialValues?.start_time?.slice(0, 5) ?? ""
  );
  const [duration, setDuration] = useState(
    String(initialValues?.duration_minutes ?? 60)
  );
  const [type, setType] = useState(initialValues?.type ?? "match");
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [checkedPlayers, setCheckedPlayers] = useState<Set<string>>(
    () => new Set(initialValues?.player_ids ?? [])
  );

  function markDirty() { onDirtyChange?.(true); }

  function togglePlayer(id: string) {
    markDirty();
    setCheckedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-lg">
      {/* Cancha */}
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>Cancha</label>
        <select
          name="court_id"
          required
          value={courtId}
          onChange={(e) => { setCourtId(e.target.value); markDirty(); }}
          className={selectClass}
        >
          <option value="" disabled>
            Selecciona una cancha
          </option>
          {courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Fecha + Hora */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Fecha</label>
          <input
            type="date"
            name="date"
            required
            min={localToday}
            value={date}
            onChange={(e) => { setDate(e.target.value); markDirty(); }}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Hora de inicio</label>
          <input
            type="time"
            name="start_time"
            required
            step={900}
            min={date === localToday ? (() => {
              const n = new Date();
              return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
            })() : undefined}
            value={startTime}
            onChange={(e) => { setStartTime(e.target.value); markDirty(); }}
            className={inputClass}
          />
        </div>
      </div>

      {/* Duración + Tipo */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Duración</label>
          <select
            name="duration_minutes"
            required
            value={duration}
            onChange={(e) => { setDuration(e.target.value); markDirty(); }}
            className={selectClass}
          >
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Tipo</label>
          <select
            name="type"
            required
            value={type}
            onChange={(e) => { setType(e.target.value); markDirty(); }}
            className={selectClass}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Título */}
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>
          Título{" "}
          {type !== "block" && (
            <span className="text-brand-muted font-normal">(opcional)</span>
          )}
        </label>
        <input
          type="text"
          name="title"
          required={type === "block"}
          value={title}
          onChange={(e) => { setTitle(e.target.value); markDirty(); }}
          placeholder={type === "block" ? "Ej: Mantenimiento" : "Ej: Liga de verano"}
          className={inputClass}
        />
      </div>

      {/* Notas */}
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>
          Notas <span className="text-brand-muted font-normal">(opcional)</span>
        </label>
        <textarea
          name="notes"
          rows={2}
          value={notes}
          onChange={(e) => { setNotes(e.target.value); markDirty(); }}
          placeholder="Información adicional..."
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none"
        />
      </div>

      {/* Jugadores */}
      {type !== "block" && members.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className={labelClass}>
            Jugadores <span className="text-brand-muted font-normal">(opcional)</span>
          </label>
          <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/5 max-h-48 overflow-y-auto">
            {members.map((m) => (
              <label
                key={m.profile_id}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
              >
                <input
                  type="checkbox"
                  name="players"
                  value={m.profile_id}
                  checked={checkedPlayers.has(m.profile_id)}
                  onChange={() => togglePlayer(m.profile_id)}
                  className="w-4 h-4 rounded accent-brand-primary cursor-pointer"
                />
                <span className="text-sm text-white">
                  {m.full_name ?? "Sin nombre"}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {state?.error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 whitespace-pre-wrap">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={pending} className="flex-1">
          {pending ? "Guardando..." : submitLabel}
        </Button>
        {!inModal && (
          <Link
            href={cancelHref}
            className="h-10 px-5 rounded-xl border border-white/20 text-sm font-medium text-brand-muted hover:text-white hover:border-white/40 transition-colors flex items-center"
          >
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}
