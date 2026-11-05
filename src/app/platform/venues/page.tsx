import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
import { platformListPadelVenues } from "@/lib/directory";
import { PlatformVenuesTable } from "./PlatformVenuesTable";

// Directorio de establecimientos (SUPERADMIN). El layout de /platform ya
// exige is_platform_admin; platform_list_padel_venues lo vuelve a exigir.
export default async function PlatformVenuesPage() {
  const supabase = await createClient();
  const { data, error } = await platformListPadelVenues(supabase);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-bold text-white">Directorio</h1>
        <Link href="/platform/venues/new">
          <Button size="sm">
            <Plus className="w-4 h-4" />
            Nuevo establecimiento
          </Button>
        </Link>
      </div>
      <p className="text-sm text-brand-muted mb-8">
        Lugares donde se juega pádel, con información comercial pública verificada. No son clientes del SaaS salvo que
        estén vinculados a un club.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          No se pudo cargar el directorio ({error.message}). Si la migración 20261117000001 aún no está aplicada, este
          módulo no tiene datos todavía.
        </div>
      )}

      <PlatformVenuesTable venues={data ?? []} />
    </div>
  );
}
