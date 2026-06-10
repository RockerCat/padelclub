import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ClubRole } from "@/types/database";

interface ClubHomePageProps {
  params: Promise<{ club: string }>;
}

export default async function ClubHomePage({ params }: ClubHomePageProps) {
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
    .select("role, clubs!inner(id, name, slug)")
    .eq("clubs.slug", slug)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) {
    notFound();
  }

  const club = membership.clubs as unknown as { id: string; name: string; slug: string };
  const role = membership.role as ClubRole;

  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">
        Bienvenido/a a {club.name}
      </h1>
      <p className="text-brand-muted mb-8">
        {role === "OWNER"
          ? "Eres el propietario de este club."
          : role === "ADMIN"
          ? "Tienes acceso de administrador."
          : "Eres miembro de este club."}
      </p>

      <div className="flex flex-wrap gap-3">
        {(role === "OWNER" || role === "ADMIN") && (
          <Link
            href={`/${slug}/admin/settings`}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-brand-primary text-brand-bg text-sm font-semibold hover:brightness-110 transition-all"
          >
            Panel de administración
          </Link>
        )}
        {role === "OWNER" && (
          <Link
            href={`/${slug}/dashboard`}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-white/20 text-white text-sm font-semibold hover:border-white/40 hover:bg-white/5 transition-all"
          >
            Dashboard
          </Link>
        )}
        {role === "PLAYER" && (
          <span className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-white/10 text-brand-muted text-sm font-semibold cursor-not-allowed">
            Reservaciones — Próximamente
          </span>
        )}
      </div>
    </div>
  );
}
