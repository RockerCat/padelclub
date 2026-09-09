import { createClient } from "@/lib/supabase/server";
import { PlatformLeadsTable, type PlatformLeadRow } from "./PlatformLeadsTable";

export default async function PlatformLeadsPage() {
  const supabase = await createClient();

  // get_platform_leads_overview added in 20261115000001, not yet in
  // generated types until `npm run types:generate` runs against a DB with
  // this migration applied — same documented gap as get_my_profile in
  // src/lib/platformAdminQuery.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_platform_leads_overview");
  const leads: PlatformLeadRow[] = data ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <h1 className="text-2xl font-bold text-white mb-1">Prospectos</h1>
      <p className="text-sm text-brand-muted mb-8">
        Solicitudes de demo recibidas desde mipadel.club. Contáctalos por WhatsApp y da seguimiento hasta la entrega del club.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          No se pudieron cargar los prospectos ({error.message}).
        </div>
      )}

      <PlatformLeadsTable leads={leads} />
    </div>
  );
}
