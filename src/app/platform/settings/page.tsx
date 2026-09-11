import { createClient } from "@/lib/supabase/server";
import { PlatformSettingsForm, type PlatformCommercialSettings } from "./PlatformSettingsForm";

export default async function PlatformSettingsPage() {
  const supabase = await createClient();

  // get_platform_commercial_settings added in 20261115000009, not yet in
  // generated types until types:generate runs against a DB with this
  // migration applied (bloqueado hoy — ver CLAUDE.md → Types Generation).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_platform_commercial_settings");
  const settings: PlatformCommercialSettings | null = data?.[0] ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
      <h1 className="text-2xl font-bold text-white mb-1">Configuración</h1>
      <p className="text-sm text-brand-muted mb-8">
        Configuración comercial global — precio base, promo y duración del trial. Los cambios solo afectan
        períodos y pagos futuros; el historial ya generado nunca se recalcula.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          No se pudo cargar la configuración ({error.message}).
        </div>
      )}

      {settings && <PlatformSettingsForm initialSettings={settings} />}
    </div>
  );
}
