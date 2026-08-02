import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkProfileIsPlatformAdmin } from "@/lib/platformAdminQuery";

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ club: string }>;
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  console.log("[user]", user?.id);
  console.log("[club lookup]", slug);

  // A club created via platform_create_pending_club is is_active=true from
  // birth (Entrega de Club — see 20261005000001), so this plain lookup
  // already finds it — no special-cased pending-club branch needed.
  const result = await supabase
    .from("clubs")
    .select("id")
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

  // Step 2: verify the user is an active member and not a PLAYER
  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  console.log("[membership]", membership);

  if (!membership) {
    // SUPERADMIN "Entrar al club" — same elevated-access fallback as
    // [club]/layout.tsx (the parent already granted access; this nested
    // layout must not re-reject it with its own independent membership
    // check). The query above already filters is_active = true, so a
    // found `club` row here is guaranteed active.
    const isPlatformAdmin = await checkProfileIsPlatformAdmin(supabase, user.id);
    if (!isPlatformAdmin) {
      redirect("/unauthorized");
    }
    return <>{children}</>;
  }

  if (membership.role === "PLAYER") {
    redirect(`/${slug}`);
  }

  return <>{children}</>;
}
