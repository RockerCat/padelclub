import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ club: string }>;
}

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: membership } = await supabase
    .from("club_members")
    .select("role, clubs!inner(slug)")
    .eq("clubs.slug", slug)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) {
    notFound();
  }

  // PLAYERs do not have access to the admin panel
  if (membership.role === "PLAYER") {
    redirect(`/${slug}`);
  }

  return <>{children}</>;
}
