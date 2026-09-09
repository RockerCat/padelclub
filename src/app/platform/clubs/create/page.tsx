import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PendingClubFields } from "./PendingClubFields";

interface PageProps {
  searchParams: Promise<{ lead?: string }>;
}

// Entrega de Club sigue siendo el único mecanismo de creación asistida —
// ?lead=<leadId> solo prellena esta misma pantalla desde un prospecto
// (Funnel Comercial, /platform/leads/[leadId]), nunca un segundo
// formulario. Si el lead ya fue convertido, redirige directo al club
// existente en vez de arriesgar una segunda conversión accidental.
export default async function PlatformCreatePendingClubPage({ searchParams }: PageProps) {
  const { lead: leadId } = await searchParams;

  let initialName = "";
  if (leadId) {
    const supabase = await createClient();
    // get_platform_lead_detail added in 20261115000001, not yet in
    // generated types until `npm run types:generate` runs against a DB
    // with this migration applied.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.rpc as any)("get_platform_lead_detail", { p_lead_id: leadId });
    const lead = data?.[0];

    if (lead?.converted_club_id) {
      redirect(`/platform/clubs/${lead.converted_club_id}`);
    }

    initialName = lead?.club_name ?? "";
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 md:py-12">
      <Link
        href={leadId ? `/platform/leads/${leadId}` : "/platform/clubs"}
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {leadId ? "Prospecto" : "Clubes"}
      </Link>

      <h1 className="text-xl font-bold text-white mb-1">Crear club</h1>
      <p className="text-sm text-brand-muted mb-8">
        Prepara un club antes de entregárselo a su propietario definitivo (ver &quot;Entrega del club&quot; en el
        detalle del club una vez creado).
      </p>

      <PendingClubFields leadId={leadId} initialName={initialName} />
    </div>
  );
}
