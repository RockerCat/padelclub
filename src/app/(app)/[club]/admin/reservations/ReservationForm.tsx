"use client";

import { useActionState, useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { getAvailableSlots } from "./actions";
import type { ReservationFormState } from "./actions";
import { durationOptions } from "@/lib/durations";

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
  clubId: string;
  allowedDurations: number[];
  initialValues?: InitialValues;
  submitLabel?: string;
  cancelHref: string;
  onSuccess?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  inModal?: boolean;
  editingReservationId?: string;
  clubSlug?: string;
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 disabled:opacity-50";

const selectClass =
  "h-10 w-full rounded-xl border border-white/10 bg-brand-surface px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 appearance-none cursor-pointer";

const labelClass = "text-sm font-medium text-white/80";

const TYPE_OPTIONS = [
  { value: "match", label: "Partido" },
  { value: "class", label: "Clase" },
  { value: "block", label: "Bloqueo" },
];

// ─── TimeSlotPicker ───────────────────────────────────────────────────────────

function TimeSlotPicker({
  value,
  onChange,
  slots,
  loading,
  closed,
  hasCourtAndDate,
}: {
  value: string;
  onChange: (v: string) => void;
  slots: string[];
  loading: boolean;
  closed: boolean;
  hasCourtAndDate: boolean;
}) {
  return (
    <div>
      {/* Always render hidden input so formData always has start_time */}
      <input type="hidden" name="start_time" value={value} />

      {!hasCourtAndDate ? (
        <p className="text-sm text-brand-muted/50 py-2">
          Selecciona cancha y fecha para ver horarios disponibles
        </p>
      ) : closed ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-brand-muted">
          Club cerrado este día
        </div>
      ) : loading ? (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-brand-muted">
          No hay horarios disponibles para esta fecha.
        </div>
      ) : (
        <div
          className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-[180px] overflow-y-auto pr-0.5"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}
        >
          {slots.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => onChange(slot)}
              className={`h-9 rounded-lg text-[13px] font-medium transition-colors ${
                slot === value
                  ? "bg-brand-primary text-brand-bg font-semibold"
                  : "border border-white/10 text-brand-muted hover:border-brand-primary/40 hover:text-white bg-white/[0.03]"
              }`}
            >
              {slot}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ReservationForm ──────────────────────────────────────────────────────────

export function ReservationForm({
  action,
  courts,
  members,
  defaultDate,
  clubId,
  allowedDurations,
  initialValues,
  submitLabel = "Crear reserva",
  cancelHref,
  onSuccess,
  onDirtyChange,
  inModal,
  editingReservationId,
  clubSlug,
}: ReservationFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const durations = durationOptions(allowedDurations);

  useEffect(() => {
    if (state?.success) onSuccess?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.success]);

  // Local today for min-date constraint
  const localToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // Default duration: use initial value if allowed, otherwise first allowed duration
  const defaultDuration = (() => {
    const initial = initialValues?.duration_minutes;
    if (initial && allowedDurations.includes(initial)) return String(initial);
    return String(allowedDurations[0] ?? 60);
  })();

  const [courtId, setCourtId] = useState(initialValues?.court_id ?? "");
  const [date, setDate] = useState(initialValues?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(
    initialValues?.start_time?.slice(0, 5) ?? ""
  );
  const [duration, setDuration] = useState(defaultDuration);
  const [type, setType] = useState(initialValues?.type ?? "match");
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [checkedPlayers, setCheckedPlayers] = useState<Set<string>>(
    () => new Set(initialValues?.player_ids ?? [])
  );

  // Available time slots
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(
    !!(initialValues?.court_id && (initialValues?.date ?? defaultDate))
  );
  const [slotsClosed, setSlotsClosed] = useState(false);

  // Refetch slots whenever court, date, or duration changes
  useEffect(() => {
    if (!courtId || !date) {
      setSlots([]);
      setSlotsLoading(false);
      setSlotsClosed(false);
      return;
    }
    setSlotsLoading(true);
    let cancelled = false;
    getAvailableSlots(clubId, courtId, date, Number(duration), editingReservationId).then(
      ({ slots: s, closed }) => {
        if (cancelled) return;
        setSlots(s);
        setSlotsClosed(closed);
        setSlotsLoading(false);
        // If the selected time is no longer in the new slot list, reset it
        setStartTime((prev) => (s.includes(prev) ? prev : ""));
      }
    );
    return () => { cancelled = true; };
  }, [courtId, date, duration, clubId, editingReservationId]);

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

  function handleSlotSelect(slot: string) {
    setStartTime(slot);
    markDirty();
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

      {/* Fecha */}
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

      {/* Hora de inicio */}
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>Hora de inicio</label>
        <TimeSlotPicker
          value={startTime}
          onChange={handleSlotSelect}
          slots={slots}
          loading={slotsLoading}
          closed={slotsClosed}
          hasCourtAndDate={!!(courtId && date)}
        />
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
            {durations.map((o) => (
              <option key={o.minutes} value={String(o.minutes)}>
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
            disabled={!!editingReservationId}
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
          disabled={!!editingReservationId}
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
          disabled={!!editingReservationId}
          value={notes}
          onChange={(e) => { setNotes(e.target.value); markDirty(); }}
          placeholder="Información adicional..."
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none disabled:opacity-50"
        />
      </div>

      {editingReservationId && (
        <p className="text-xs text-brand-muted/70 -mt-2">
          Tipo, título, notas y jugadores no se pueden editar por ahora — solo cancha, fecha, hora y duración.
        </p>
      )}

      {/* Jugadores */}
      {type !== "block" && (
        <div className="flex flex-col gap-2">
          <label className={labelClass}>
            Jugadores <span className="text-brand-muted font-normal">(opcional)</span>
          </label>
          {members.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4">
              <p className="text-sm text-brand-muted">
                No hay jugadores registrados todavía.
              </p>
              {clubSlug && (
                <p className="text-sm text-brand-muted/60 mt-1">
                  Puedes invitar jugadores desde la sección{" "}
                  <a
                    href={`/${clubSlug}/admin/players`}
                    className="text-brand-primary hover:underline"
                  >
                    Jugadores
                  </a>
                  .
                </p>
              )}
            </div>
          ) : (
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
                    disabled={!!editingReservationId}
                    className="w-4 h-4 rounded accent-brand-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className="text-sm text-white">
                    {m.full_name ?? "Sin nombre"}
                  </span>
                </label>
              ))}
            </div>
          )}
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
