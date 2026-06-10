import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/layout/AppNav";
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

  if (!user) {
    redirect("/auth/login");
  }

  // Query the user's membership for this club
  const { data: membership } = await supabase
    .from("club_members")
    .select("role, clubs!inner(id, name, slug, logo_url, primary_color, secondary_color)")
    .eq("clubs.slug", slug)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) {
    notFound();
  }

  // clubs comes back as an object due to the !inner join + .single()
  const club = membership.clubs as unknown as {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
  };

  const role = membership.role as ClubRole;

  return (
    <div
      className="min-h-screen flex"
      style={
        {
          "--color-club-primary": club.primary_color,
          "--color-club-secondary": club.secondary_color,
        } as React.CSSProperties
      }
    >
      <AppNav club={club} role={role} />
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
