import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // If user already belongs to clubs, send them to the selector instead
  const { count } = await supabase
    .from("club_members")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .eq("is_active", true);

  if ((count ?? 0) > 0) {
    redirect("/clubs");
  }

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-3xl font-black tracking-tight text-white">
            Padel<span className="text-brand-primary">Club</span>
          </span>
          <p className="text-brand-muted text-sm mt-2">
            Configura tu club
          </p>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}
