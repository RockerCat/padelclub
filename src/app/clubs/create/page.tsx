import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/app/onboarding/OnboardingForm";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/layout/BrandLogo";

export default async function CreateClubPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login?next=/clubs/create");

  // Solo un OWNER existente puede crear un club adicional. Los clubes nuevos
  // se incorporan por /demo → Entrega de Club → claim_club(); una cuenta sin
  // tipo, PLAYER, ADMIN o SUPERADMIN nunca llega a este formulario. La
  // autoridad real es create_club_with_owner (20261115000011), que rechaza
  // lo mismo en base de datos — esto solo evita mostrar un formulario que
  // fallaría.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- get_my_profile added in 20261114000002, not yet in generated types until `npm run types:generate` runs against a DB with this migration applied.
  const { data: myProfile } = await (supabase.rpc as any)("get_my_profile");
  if (myProfile?.[0]?.account_type !== "OWNER") redirect("/clubs");

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <BrandLogo size="md" className="justify-center" />
          <p className="text-brand-muted text-sm mt-2">Nuevo club</p>
        </div>

        {/* Back */}
        <Link
          href="/clubs"
          className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Mis clubes
        </Link>

        {/* Reuse the same form and action used in onboarding */}
        <OnboardingForm />
      </div>
    </div>
  );
}
