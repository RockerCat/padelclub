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
