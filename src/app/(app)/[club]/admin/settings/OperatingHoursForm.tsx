"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { saveOperatingHours } from "./actions";
import {
  DAY_NAMES,
  generateTimeOptions,
  validateOperatingHours,
  type OperatingHour,
} from "@/lib/operatingHours";

// Display order: Mon → Sun
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// 24h-only options, no native AM/PM time picker — see generateTimeOptions().
const TIME_OPTIONS = generateTimeOptions(30);

interface OperatingHoursFormProps {
  clubId: string;
  initialHours: OperatingHour[];
}

const timeSelectClass =
  "h-9 w-[90px] rounded-lg border bg-white/5 px-2 text-sm text-white transition-colors focus:outline-none focus:ring-1 focus:ring-brand-primary/50 focus:border-brand-primary/50 disabled:opacity-30 disabled:cursor-not-allowed";

function TimeSelect({
  value,
  disabled,
  hasError,
  onChange,
}: {
  value: string;
  disabled: boolean;
  hasError: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={timeSelectClass}
      style={{
        borderColor: hasError ? "#EF4444" : disabled ? "transparent" : "rgba(255,255,255,0.15)",
      }}
    >
      <option value="" className="bg-[#001A24]">—</option>
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t} className="bg-[#001A24]">
          {t}
        </option>
      ))}
    </select>
  );
}

export function OperatingHoursForm({ clubId, initialHours }: OperatingHoursFormProps) {
  const router = useRouter();
  const [hours, setHours] = useState<OperatingHour[]>(initialHours);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; error?: string }>({});

  const dayErrors = validateOperatingHours(hours);
  const hasErrors = dayErrors.size > 0;

  function updateDay(dayOfWeek: number, patch: Partial<OperatingHour>) {
    setHours((prev) =>
      prev.map((h) => (h.day_of_week === dayOfWeek ? { ...h, ...patch } : h))
    );
    setResult({});
  }

  function handleSave() {
    if (hasErrors) return;
    startTransition(async () => {
      const r = await saveOperatingHours(clubId, hours);
      setResult(r);
      if (r.success) router.refresh();
    });
  }

  return (
    <div>
      <p className="text-xs text-brand-muted mb-4">
        Define cuándo está abierto el club. Se usa para calcular la ocupación de canchas.
      </p>
      <div>
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[340px]">
            {/* Header */}
            <div className="grid grid-cols-[1fr_48px_90px_90px] gap-3 px-3 pb-2 border-b border-white/[0.06]">
              <span className="text-[11px] font-semibold text-brand-muted uppercase tracking-wider">Día</span>
              <span className="text-[11px] font-semibold text-brand-muted uppercase tracking-wider text-center">Abierto</span>
              <span className="text-[11px] font-semibold text-brand-muted uppercase tracking-wider">Apertura</span>
              <span className="text-[11px] font-semibold text-brand-muted uppercase tracking-wider">Cierre</span>
            </div>

            {/* Rows */}
            {DAY_ORDER.map((dayNum, idx) => {
              const h = hours.find((x) => x.day_of_week === dayNum)!;
              const dayError = dayErrors.get(dayNum);
              return (
                <div
                  key={dayNum}
                  className={`px-3 py-2.5 ${idx % 2 === 1 ? "bg-white/[0.02]" : ""} ${
                    idx > 0 ? "border-t border-white/[0.04]" : ""
                  }`}
                >
                  <div className="grid grid-cols-[1fr_48px_90px_90px] gap-3 items-center">
                    {/* Day name */}
                    <span className="text-sm text-white">{DAY_NAMES[dayNum]}</span>

                    {/* Toggle */}
                    <div className="flex justify-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={h.is_open}
                        onClick={() => updateDay(dayNum, { is_open: !h.is_open })}
                        className="relative w-9 h-5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
                        style={{
                          backgroundColor: h.is_open
                            ? "var(--club-primary, #B7E000)"
                            : "rgba(255,255,255,0.15)",
                        }}
                      >
                        <span
                          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                          style={{ left: h.is_open ? "calc(100% - 18px)" : "2px" }}
                        />
                      </button>
                    </div>

                    {/* Opens at */}
                    <TimeSelect
                      value={h.opens_at?.slice(0, 5) ?? ""}
                      disabled={!h.is_open}
                      hasError={!!dayError}
                      onChange={(value) => updateDay(dayNum, { opens_at: value })}
                    />

                    {/* Closes at */}
                    <TimeSelect
                      value={h.closes_at?.slice(0, 5) ?? ""}
                      disabled={!h.is_open}
                      hasError={!!dayError}
                      onChange={(value) => updateDay(dayNum, { closes_at: value })}
                    />
                  </div>

                  {dayError && (
                    <p className="text-[11px] text-red-400 mt-1.5">
                      {DAY_NAMES[dayNum]}: {dayError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Feedback */}
        {result.error && (
          <p className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {result.error}
          </p>
        )}
        {result.success && (
          <p className="mt-4 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
            Horarios guardados correctamente.
          </p>
        )}

        <div className="mt-5">
          <Button type="button" loading={isPending} disabled={hasErrors} onClick={handleSave}>
            Guardar horarios
          </Button>
        </div>
      </div>
    </div>
  );
}
