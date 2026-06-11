import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/layout/AppNav";
import { ClubThemeProvider } from "@/components/layout/ClubThemeProvider";
import { UpdateLastClub } from "@/components/layout/UpdateLastClub";
import type { ClubRole } from "@/types/database";

interface ClubLayoutProps {
  children: React.ReactNode;
  params: Promise<{ club: string }>;
}

export default async function ClubLayout({ children, params }: ClubLayoutProps) {
  const { club: slug } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("[user]", user?.id);

  if (!user) {
    redirect("/auth/login");
  }

  console.log("[club lookup]", slug);

  // Step 1: resolve slug → club row
  const result = await supabase
    .from("clubs")
    .select("id, name, slug, logo_url, primary_color, secondary_color")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  console.log("[club result]", result);
  console.log("[club data]", result.data);
  console.log("[club error]", result.error);

  const club = result.data;

  if (!club) {
    notFound();
  }

  // Step 2: verify the user is an active member of this club
  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  console.log("[membership]", membership);

  if (!membership) {
    redirect("/unauthorized");
  }

  const role = membership.role as ClubRole;

  // Count total active memberships to decide whether to show "Cambiar de club"
  const { count } = await supabase
    .from("club_members")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const membershipCount = count ?? 1;

  return (
    <ClubThemeProvider
      initialPrimary={club.primary_color}
      initialSecondary={club.secondary_color}
    >
      <UpdateLastClub clubId={club.id} />
      <AppNav club={club} role={role} membershipCount={membershipCount} />
      <main className="flex-1 min-w-0">{children}</main>
    </ClubThemeProvider>
  );
}
