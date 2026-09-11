import { createClient } from "@/lib/supabase/server";
import { PlatformSubscriptionsTable, type PlatformSubscriptionRow } from "./PlatformSubscriptionsTable";

export default async function PlatformSubscriptionsPage() {
  const supabase = await createClient();

  // get_platform_clubs_overview ya trae el estado comercial de cada club
  // (extendida en 20261115000009) — esta pantalla reutiliza exactamente la
  // misma RPC que /platform/clubs, nunca una segunda consulta casi
  // idéntica. Cast angosto y documentado: los tipos generados no reflejan
  // las columnas comerciales nuevas hasta correr types:generate (bloqueado
  // hoy, ver CLAUDE.md).
  const { data, error } = await supabase.rpc("get_platform_clubs_overview");
  const clubs = (data ?? []) as unknown as PlatformSubscriptionRow[];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <h1 className="text-2xl font-bold text-white mb-1">Suscripciones</h1>
      <p className="text-sm text-brand-muted mb-8">
        Estado comercial de cada club — incluye clubes legacy sin suscripción. Es de solo lectura: el ciclo
        comercial (trial, pagos, suspensión) sigue su propio curso automático, nunca se modifica desde acá.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          No se pudieron cargar las suscripciones ({error.message}).
        </div>
      )}

      <PlatformSubscriptionsTable clubs={clubs} />
    </div>
  );
}
