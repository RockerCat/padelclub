import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  // Step 1: resolve slug → club id
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
    redirect("/unauthorized");
  }

  if (membership.role === "PLAYER") {
    redirect(`/${slug}`);
  }

  return <>{children}</>;
}
