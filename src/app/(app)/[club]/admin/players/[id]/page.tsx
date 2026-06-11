import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, CardContent } from "@/components/ui";
import { ArrowLeft } from "lucide-react";
import { MemberActions } from "./MemberActions";

interface MemberDetailPageProps {
  params: Promise<{ club: string; id: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  PLAYER: "Jugador",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default async function MemberDetailPage({ params }: MemberDetailPageProps) {
  const { club: slug, id: memberId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!club) notFound();

  const { data: callerMembership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!callerMembership) redirect("/unauthorized");
  if (!["OWNER", "ADMIN"].includes(callerMembership.role)) redirect(`/${slug}`);

  const callerRole = callerMembership.role as "OWNER" | "ADMIN";

  // Load the target member
  const { data: member } = await supabase
    .from("club_members")
    .select("id, club_id, profile_id, role, is_active, joined_at, profiles(full_name, avatar_url, phone)")
    .eq("id", memberId)
    .eq("club_id", club.id)
    .single();

  if (!member) notFound();

  const profile = member.profiles as { full_name: string | null; avatar_url: string | null; phone: string | null } | null;
  const name = profile?.full_name ?? "Sin nombre";
  const initials = getInitials(profile?.full_name ?? null);
  const isSelf = member.profile_id === user.id;
  const memberRole = member.role as "OWNER" | "ADMIN" | "PLAYER";

  const backHref =
    memberRole === "PLAYER" ? `/${slug}/admin/players` : `/${slug}/admin/team`;
  const backLabel = memberRole === "PLAYER" ? "Jugadores" : "Equipo del club";

  return (
    <div className="p-6 md:p-10">
      {/* Back */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </Link>

      {/* Header */}
      <div className="flex items-start gap-5 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-brand-primary/15 border border-brand-primary/20 flex items-center justify-center shrink-0">
          <span className="text-xl font-bold text-brand-primary">{initials}</span>
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl font-bold text-white">{name}</h1>
            <Badge
              variant={
                memberRole === "OWNER" ? "primary" : memberRole === "ADMIN" ? "secondary" : "outline"
              }
            >
              {ROLE_LABELS[memberRole]}
            </Badge>
            <Badge variant={member.is_active ? "success" : "default"}>
              {member.is_active ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          {isSelf && (
            <p className="text-xs text-brand-muted">Esta es tu cuenta.</p>
          )}
        </div>
      </div>

      {/* Info */}
      <Card variant="default" className="mb-6 max-w-xl">
        <CardHeader>
          <h2 className="text-sm font-semibold text-white">Información</h2>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3">
            {profile?.phone && (
              <div className="flex justify-between text-sm">
                <dt className="text-brand-muted">Teléfono</dt>
                <dd className="text-white">{profile.phone}</dd>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <dt className="text-brand-muted">Miembro desde</dt>
              <dd className="text-white">{formatDate(member.joined_at)}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-brand-muted">Rol</dt>
              <dd className="text-white">{ROLE_LABELS[memberRole]}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-brand-muted">Estado</dt>
              <dd>{member.is_active ? <span className="text-emerald-400">Activo</span> : <span className="text-brand-muted">Inactivo</span>}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Actions */}
      <MemberActions
        clubId={club.id}
        clubSlug={slug}
        memberId={member.id}
        memberRole={memberRole}
        isActive={member.is_active}
        callerRole={callerRole}
        isSelf={isSelf}
      />
    </div>
  );
}
