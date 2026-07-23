import { createClient } from "@/lib/supabase/server";
import { PlatformClubsTable, type PlatformClubRow } from "./PlatformClubsTable";

export default async function PlatformClubsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_platform_clubs_overview");
  const clubs: PlatformClubRow[] = data ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <h1 className="text-2xl font-bold text-white mb-1">Clubes</h1>
      <p className="text-sm text-brand-muted mb-8">
        Todos los clubes registrados en MiPadelClub. Solo consulta.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          No se pudieron cargar los clubes ({error.message}).
        </div>
      )}

      <PlatformClubsTable clubs={clubs} />
    </div>
  );
}
