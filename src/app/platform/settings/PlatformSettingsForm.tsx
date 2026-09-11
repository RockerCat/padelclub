"use client";

import { useState, useTransition } from "react";
import { Info } from "lucide-react";
import { Button, Input, Switch, Toast } from "@/components/ui";
import { updateCommercialSettings } from "./actions";

export type PlatformCommercialSettings = {
  base_monthly_price: number;
  promo_enabled: boolean;
  promo_monthly_price: number | null;
  trial_days: number;
  currency: string;
  updated_at: string;
  updated_by_name: string | null;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PlatformSettingsForm({ initialSettings }: { initialSettings: PlatformCommercialSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [baseMonthlyPrice, setBaseMonthlyPrice] = useState(String(initialSettings.base_monthly_price));
  const [promoEnabled, setPromoEnabled] = useState(initialSettings.promo_enabled);
  const [promoMonthlyPrice, setPromoMonthlyPrice] = useState(
    initialSettings.promo_monthly_price != null ? String(initialSettings.promo_monthly_price) : ""
  );
  const [trialDays, setTrialDays] = useState(String(initialSettings.trial_days));
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);

    const parsedBase = Number(baseMonthlyPrice);
    const parsedTrial = Number(trialDays);
    const parsedPromo = promoMonthlyPrice.trim() === "" ? null : Number(promoMonthlyPrice);

    if (baseMonthlyPrice.trim() === "" || Number.isNaN(parsedBase) || parsedBase < 0) {
      setError("El precio base debe ser un número mayor o igual a 0.");
      return;
    }
    if (trialDays.trim() === "" || Number.isNaN(parsedTrial) || !Number.isInteger(parsedTrial) || parsedTrial <= 0) {
      setError("Los días de trial deben ser un entero mayor a 0.");
      return;
    }
    if (parsedPromo !== null && (Number.isNaN(parsedPromo) || parsedPromo < 0)) {
      setError("El precio promo debe ser un número mayor o igual a 0.");
      return;
    }
    if (promoEnabled && (parsedPromo === null || parsedPromo > parsedBase)) {
      setError("Con la promo activa, el precio promo es obligatorio y no puede superar el precio base.");
      return;
    }

    startTransition(async () => {
      const result = await updateCommercialSettings({
        baseMonthlyPrice: parsedBase,
        promoEnabled,
        promoMonthlyPrice: parsedPromo,
        trialDays: parsedTrial,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSettings({
        ...settings,
        base_monthly_price: parsedBase,
        promo_enabled: promoEnabled,
        promo_monthly_price: parsedPromo,
        trial_days: parsedTrial,
        updated_at: new Date().toISOString(),
      });
      setToast("Configuración guardada.");
    });
  }

  return (
    <>
      <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-4">
          Precios y trial
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Input
            label="Precio base mensual (COP)"
            type="number"
            min={0}
            step={1}
            value={baseMonthlyPrice}
            onChange={(e) => setBaseMonthlyPrice(e.target.value)}
          />
          <Input
            label="Días de trial"
            type="number"
            min={1}
            step={1}
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Switch checked={promoEnabled} onChange={setPromoEnabled} label="Promo activa" />
          <span className="text-sm text-white/80">Promo activa</span>
        </div>

        <Input
          label="Precio promo mensual (COP)"
          type="number"
          min={0}
          step={1}
          value={promoMonthlyPrice}
          onChange={(e) => setPromoMonthlyPrice(e.target.value)}
          hint="Se conserva aunque desactives la promo — no se borra automáticamente."
        />

        <div className="mt-4">
          <label className="text-sm font-medium text-white/50">Moneda</label>
          <p className="text-sm text-brand-muted mt-1.5">
            {settings.currency} — el sistema solo soporta COP por ahora, no es editable.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-brand-muted">
            Última actualización: {formatDateTime(settings.updated_at)}
            {settings.updated_by_name ? ` · ${settings.updated_by_name}` : ""}
          </p>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </div>

      <div className="bg-brand-surface border border-white/10 rounded-2xl p-6">
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3 flex items-center gap-2">
          <Info className="w-3.5 h-3.5" />
          Reglas del lifecycle (informativo, no editable)
        </h2>
        <ul className="text-sm text-brand-muted space-y-1.5">
          <li>Gracia después del trial: <span className="text-white">14 días</span> antes de suspender.</li>
          <li>Gracia después de un período vencido (past due): <span className="text-white">30 días</span> antes de suspender.</li>
        </ul>
        <p className="text-xs text-brand-muted/70 mt-3">
          Estos valores están fijos en el código del ciclo comercial (shared/commercial/lifecycle.ts y
          run_commercial_lifecycle_transitions) — no forman parte de esta configuración todavía.
        </p>
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
