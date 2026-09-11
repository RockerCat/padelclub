import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
import { PlatformClubsTable, type PlatformClubRow } from "./PlatformClubsTable";

export default async function PlatformClubsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_platform_clubs_overview");
  // get_platform_clubs_overview fue extendida en 20261115000009 con
  // columnas comerciales (commercial_status/trial_ends_at/
  // current_period_end); los tipos generados no las reflejan hasta correr
  // types:generate, bloqueado hoy (ver CLAUDE.md → Types Generation). Cast
  // angosto y documentado sobre el mismo dato real que la RPC ya devuelve.
  const clubs = (data ?? []) as unknown as PlatformClubRow[];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-bold text-white">Clubes</h1>
        <Link href="/platform/clubs/create">
          <Button size="sm">
            <Plus className="w-4 h-4" />
            Crear club
          </Button>
        </Link>
      </div>
      <p className="text-sm text-brand-muted mb-8">
        Todos los clubes registrados en MiPadelClub. Consulta, o prepara un club nuevo para su entrega.
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
