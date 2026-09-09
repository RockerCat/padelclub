import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LeadDetail, type PlatformLeadDetailRow } from "./LeadDetail";

interface PageProps {
  params: Promise<{ leadId: string }>;
}

export default async function PlatformLeadDetailPage({ params }: PageProps) {
  const { leadId } = await params;
  const supabase = await createClient();

  // get_platform_lead_detail added in 20261115000001, not yet in generated
  // types until `npm run types:generate` runs against a DB with this
  // migration applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_platform_lead_detail", {
    p_lead_id: leadId,
  });
  const lead: PlatformLeadDetailRow | undefined = data?.[0];

  if (!lead && !error) notFound();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
      <Link
        href="/platform/leads"
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Prospectos
      </Link>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          No se pudo cargar el prospecto ({error.message}).
        </div>
      )}

      {lead && <LeadDetail lead={lead} />}
    </div>
  );
}
