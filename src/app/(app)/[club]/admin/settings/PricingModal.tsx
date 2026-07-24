"use client";

import { useState, useEffect, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { SettingsModuleModal } from "./SettingsModuleModal";
import { Button, Input, Switch } from "@/components/ui";
import {
  createPricingRule,
  updatePricingRule,
  togglePricingRuleActive,
  type PricingRuleFormState,
} from "./actions";
import { generateTimeOptions, DAY_NAMES } from "@/lib/operatingHours";
import { durationLabel } from "@/lib/durations";
import type { PricingRule, PricingRulePrice } from "@/types/database";

// Same 30-minute, 24h-only time options as OperatingHoursForm — one
// convention for "pick a time" across all of Configuración.
const TIME_OPTIONS = generateTimeOptions(30);
// Mon → Sun display order, matches OperatingHoursForm exactly.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Shape returned by page.tsx's nested select — only the parent-rule columns
// actually selected there (the legacy price_per_hour/currency columns are
// deliberately not fetched) plus the embedded per-duration child prices.
// There is no single "the" price for a rule anymore, so every consumer of
// a rule's price works off this array of durations.
export type PricingRuleWithPrices = Pick<
  PricingRule,
  | "id"
  | "club_id"
  | "court_id"
  | "name"
  | "days_of_week"
  | "start_time"
  | "end_time"
  | "display_order"
  | "is_active"
  | "created_at"
  | "updated_at"
> & {
  club_pricing_rule_prices: Pick<PricingRulePrice, "duration_minutes" | "price_amount" | "currency">[];
};

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function formatDays(days: number[]): string {
  return [...days]
    .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
    .map((d) => DAY_NAMES[d].slice(0, 3))
    .join(", ");
}

const selectClass =
  "h-10 w-full rounded-xl border border-white/10 bg-brand-surface px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 appearance-none cursor-pointer";

interface PricingModalProps {
  clubId: string;
  courts: { id: string; name: string }[];
  initialRules: PricingRuleWithPrices[];
  allowedDurations: number[];
  onClose: () => void;
}

type View = { mode: "list" } | { mode: "form"; rule: PricingRuleWithPrices | null };

// initialRules is used directly as the render source — no local copy — so
// router.refresh() after any mutation (create/edit/toggle) flows the fresh
// server data straight back through this still-mounted modal, exactly like
// AllowedDurationsForm/OperatingHoursForm already do elsewhere in this file.
export function PricingModal({ clubId, courts, initialRules: rules, allowedDurations, onClose }: PricingModalProps) {
  const [view, setView] = useState<View>({ mode: "list" });

  if (view.mode === "form") {
    return (
      <SettingsModuleModal title={view.rule ? "Editar tarifa" : "Nueva tarifa"} onClose={onClose} size="lg">
        <PricingRuleForm
          clubId={clubId}
          courts={courts}
          rule={view.rule}
          allowedDurations={allowedDurations}
          onCancel={() => setView({ mode: "list" })}
          onSaved={() => setView({ mode: "list" })}
        />
      </SettingsModuleModal>
    );
  }

  return (
    <SettingsModuleModal
      title="Tarifas"
      onClose={onClose}
      size="lg"
      footer={
        <Button type="button" onClick={() => setView({ mode: "form", rule: null })}>
          <Plus className="w-4 h-4" />
          Nueva tarifa
        </Button>
      }
    >
      <PricingRulesList
        clubId={clubId}
        courts={courts}
        rules={rules}
        onEdit={(rule) => setView({ mode: "form", rule })}
      />
    </SettingsModuleModal>
  );
}

// ─── Rules list ───────────────────────────────────────────────────────────────

function PricingRulesList({
  clubId,
  courts,
  rules,
  onEdit,
}: {
  clubId: string;
  courts: { id: string; name: string }[];
  rules: PricingRuleWithPrices[];
  onEdit: (rule: PricingRuleWithPrices) => void;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function courtName(courtId: string | null) {
    if (!courtId) return "General (todas las canchas)";
    return courts.find((c) => c.id === courtId)?.name ?? "Cancha eliminada";
  }

  function handleToggle(rule: PricingRuleWithPrices, nextActive: boolean) {
    setToggleError(null);
    setPendingId(rule.id);
    startTransition(async () => {
      const result = await togglePricingRuleActive(clubId, rule.id, nextActive);
      if (result.error) setToggleError(result.error);
      else router.refresh();
      setPendingId(null);
    });
  }

  if (rules.length === 0) {
    return <p className="text-sm text-brand-muted">No hay tarifas configuradas todavía.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {toggleError && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {toggleError}
        </p>
      )}
      {rules.map((rule) => (
        <div
          key={rule.id}
          className={`rounded-xl border p-4 flex flex-col gap-2.5 transition-opacity ${
            rule.is_active ? "border-white/10 bg-white/[0.03]" : "border-white/5 bg-white/[0.01] opacity-60"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{rule.name}</p>
              <p className="text-xs text-brand-muted truncate">{courtName(rule.court_id)}</p>
            </div>
            <Switch
              checked={rule.is_active}
              onChange={(next) => handleToggle(rule, next)}
              disabled={isPending && pendingId === rule.id}
              label={rule.is_active ? "Desactivar" : "Activar"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-brand-muted">{formatDays(rule.days_of_week)}</span>
            <span className="text-brand-muted/50">·</span>
            <span className="text-brand-muted">
              {rule.start_time.slice(0, 5)} – {rule.end_time.slice(0, 5)}
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            {[...rule.club_pricing_rule_prices]
              .sort((a, b) => a.duration_minutes - b.duration_minutes)
              .map((p) => (
                <div key={p.duration_minutes} className="flex items-center justify-between text-xs">
                  <span className="text-brand-muted">{durationLabel(p.duration_minutes)}</span>
                  <span className="text-white font-medium">{formatCurrency(p.price_amount, p.currency)}</span>
                </div>
              ))}
          </div>

          <button
            type="button"
            onClick={() => onEdit(rule)}
            className="self-end inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: "var(--club-primary)" }}
          >
            <Pencil className="w-3 h-3" />
            Editar
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Create / edit form ───────────────────────────────────────────────────────

function PricingRuleForm({
  clubId,
  courts,
  rule,
  allowedDurations,
  onCancel,
  onSaved,
}: {
  clubId: string;
  courts: { id: string; name: string }[];
  rule: PricingRuleWithPrices | null;
  allowedDurations: number[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const boundAction = rule ? updatePricingRule.bind(null, clubId, rule.id) : createPricingRule.bind(null, clubId);
  const [state, formAction, pending] = useActionState<PricingRuleFormState, FormData>(boundAction, {});
  const [selectedDays, setSelectedDays] = useState<Set<number>>(() => new Set(rule?.days_of_week ?? []));
  const currentCurrency = rule?.club_pricing_rule_prices[0]?.currency ?? "COP";
  function priceFor(minutes: number): number | undefined {
    return rule?.club_pricing_rule_prices.find((p) => p.duration_minutes === minutes)?.price_amount;
  }

  // Root cause of the stale-list bug: this effect used to only call
  // onSaved() (switch the view back to "list"), never router.refresh() —
  // so PricingModal kept rendering the same `initialRules` prop it was
  // mounted with, from before the edit. Supabase was correct; the client
  // just never asked the Server Component to re-fetch. router.refresh()
  // here re-runs page.tsx, which flows fresh pricingRules back down through
  // SettingsModules into this still-mounted modal (no local copy to
  // resync) — same fix already used by handleToggle below and by
  // AllowedDurationsForm/OperatingHoursForm elsewhere in this file. This
  // also updates the Tarifas card summary (active count / min price /
  // currency), since SettingsModules recomputes those from the same fresh
  // prop on every render.
  useEffect(() => {
    if (state.success) {
      router.refresh();
      onSaved();
    }
  }, [state.success, router, onSaved]);

  function toggleDay(day: number) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Nombre" name="name" defaultValue={rule?.name ?? ""} placeholder="Ej: Horario diurno" required />

      <div>
        <p className="text-sm font-medium text-white/80 mb-2">Días</p>
        <div className="flex flex-wrap gap-1.5">
          {DAY_ORDER.map((day) => {
            const checked = selectedDays.has(day);
            return (
              <label
                key={day}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
                  checked
                    ? "border-brand-primary text-brand-primary bg-brand-primary/10"
                    : "border-white/10 text-brand-muted hover:border-white/30 hover:text-white"
                }`}
              >
                <input
                  type="checkbox"
                  name="days_of_week"
                  value={day}
                  checked={checked}
                  onChange={() => toggleDay(day)}
                  className="sr-only"
                />
                {DAY_NAMES[day].slice(0, 3)}
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Hora de inicio</label>
          <select name="start_time" defaultValue={rule?.start_time?.slice(0, 5) ?? ""} className={selectClass} required>
            <option value="" disabled>—</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/80">Hora de fin</label>
          <select name="end_time" defaultValue={rule?.end_time?.slice(0, 5) ?? ""} className={selectClass} required>
            <option value="" disabled>—</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-brand-muted -mt-2">
        Usa 00:00 como hora de fin para &quot;hasta medianoche&quot;.
      </p>

      {/* One required price field per duration the CLUB currently allows
          (clubs.allowed_reservation_durations) — never a fixed 60/90/120
          set, and never a single "por hora" field. Platino Pádel, with
          only 90 enabled, sees exactly one field here. */}
      <div className="grid grid-cols-2 gap-4">
        {allowedDurations.map((minutes) => (
          <Input
            key={minutes}
            label={`Precio · ${durationLabel(minutes)}`}
            name={`price_${minutes}`}
            type="number"
            min="0"
            step="1"
            defaultValue={priceFor(minutes)}
            required
          />
        ))}
        <Input label="Moneda" name="currency" defaultValue={currentCurrency} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-white/80">Cancha</label>
        <select name="court_id" defaultValue={rule?.court_id ?? ""} className={selectClass}>
          <option value="">General (todas las canchas)</option>
          {courts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <Input
        label="Orden de visualización"
        name="display_order"
        type="number"
        min="0"
        step="1"
        defaultValue={rule?.display_order ?? 0}
        hint="Reglas con un número menor se muestran primero."
      />

      {state?.error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={pending} className="flex-1">
          {rule ? "Guardar cambios" : "Crear tarifa"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
