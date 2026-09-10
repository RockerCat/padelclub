import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { deriveCommercialPhase, getCommercialPillContent } from "../../../../shared/commercial/lifecycle";
import { AppNav } from "@/components/layout/AppNav";
import { ClubThemeProvider } from "@/components/layout/ClubThemeProvider";
import { UpdateLastClub } from "@/components/layout/UpdateLastClub";
import Footer from "@/components/layout/Footer";
import { getPendingJoinRequestsCount } from "@/lib/joinRequests";
import { getUnreadNotificationCount, getRecentNotifications } from "@/lib/notifications";
import { getSidebarIdentity } from "@/lib/userIdentity";
import { isClubRole } from "@/types/domain";
import { ClubDeactivatedScreen } from "@/components/layout/ClubDeactivatedScreen";
import { checkProfileIsPlatformAdmin } from "@/lib/platformAdminQuery";
import { SuperadminAccessBanner } from "@/components/layout/SuperadminAccessBanner";

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

  // A club created via platform_create_pending_club is is_active=true from
  // birth (Entrega de Club — see 20261005000001), so this plain lookup
  // already finds it — no special-cased pending-club branch needed.
  //
  // No .eq("is_active", true) here on purpose: an inactive club (SUPERADMIN
  // "Desactivar club") must still resolve for its own OWNER/ADMIN/PLAYER so
  // they can be shown ClubDeactivatedScreen below, instead of a plain
  // notFound() indistinguishable from a wrong/nonexistent slug. RLS's
  // clubs_select_own_member policy already lets an existing member read
  // their own club row regardless of is_active — a non-member still gets
  // zero rows either way, so this is not a new information leak.
  const result = await supabase
    .from("clubs")
    .select("id, name, slug, logo_url, archived_at, is_active")
    .eq("slug", slug)
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

  let role: "OWNER" | "ADMIN" | "PLAYER";
  let isSuperadminAccess = false;

  if (membership) {
    // club_members.role is DB-enforced to exactly these three values (see
    // isClubRole) but that isn't visible to the generated Row type —
    // narrow explicitly instead of an `as` cast that wouldn't actually
    // narrow anything.
    if (!isClubRole(membership.role)) {
      redirect("/unauthorized");
    }
    role = membership.role;
  } else {
    // SUPERADMIN "Entrar al club" — elevated, non-persistent OWNER-
    // equivalent access to an ACTIVE club, never a club_members row.
    // Re-derived fresh on every request from profiles.is_platform_admin +
    // club.is_active — never cached, never a cookie/session flag. Mirrors
    // the same check src/lib/clubAccess.ts (resolveClubAccess) uses for
    // every admin server action; see
    // supabase/migrations/20261008000001_superadmin_club_access.sql for
    // the matching, narrowly-scoped SQL-side additive policies/RPC
    // branches this depends on.
    const isPlatformAdmin = await checkProfileIsPlatformAdmin(supabase, user.id);
    if (!isPlatformAdmin || !club.is_active) {
      redirect("/unauthorized");
    }
    role = "OWNER";
    isSuperadminAccess = true;
  }

  // SUPERADMIN "Desactivar club" — identical screen for OWNER/ADMIN/PLAYER,
  // never a 404 (the club and the caller's membership both genuinely
  // exist). Returned before the Promise.all below so a deactivated club
  // never pays for join-request/notification/identity queries for a
  // screen that's about to replace the whole shell. No {children} here —
  // this is what actually stops every nested page.tsx under [club]/ from
  // ever running its own (redundant) is_active check.
  if (!club.is_active) {
    return <ClubDeactivatedScreen />;
  }

  // Count total active memberships (for "Cambiar de club") and pending join
  // requests (for the Jugadores nav badge, OWNER/ADMIN only) side by side —
  // both are cheap head-count queries, no row data fetched.
  const [{ count }, pendingJoinRequests, notificationCount, notificationItems, identity, commercialAccessResult] =
    await Promise.all([
      supabase
        .from("club_members")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", user.id)
        .eq("is_active", true),
      role === "PLAYER" ? Promise.resolve(0) : getPendingJoinRequestsCount(supabase, club.id),
      getUnreadNotificationCount(supabase),
      getRecentNotifications(supabase),
      getSidebarIdentity(supabase, user.id, user.email ?? null),
      // Comercial v2 / Fase 2 — solo OWNER ve el banner global de abajo;
      // ADMIN/PLAYER nunca lo necesitan, así que ni se pide para ellos.
      // get_club_commercial_access added in 20261115000006, not yet in
      // generated types until `npm run types:generate` runs against a DB
      // with that migration applied.
      role === "OWNER"
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase.rpc as any)("get_club_commercial_access", { p_club_id: club.id })
        : Promise.resolve({ data: null }),
    ]);

  const membershipCount = count ?? 1;
  // Si la RPC todavía no existe (migración no aplicada) o falla por
  // cualquier razón, esto queda en sus valores neutrales y el banner
  // simplemente no se muestra — nunca rompe el shell del club por un fallo
  // de lectura puramente informativa.
  const commercialAccessRow = commercialAccessResult?.data?.[0] ?? null;
  // Comercial v2 / Fase 3 — deriva SOLO qué banner mostrar (trial real vs.
  // gracia post-trial vs. past_due vs. suspended); nunca decide acceso —
  // eso lo sigue haciendo exclusivamente el entitlement server-side ya
  // existente (can_create_booking/can_create_tournament, sin cambios).
  const { phase: commercialPhase, graceDeadline: commercialGraceDeadline } = deriveCommercialPhase({
    status: commercialAccessRow?.commercial_status ?? null,
    trialEndsAt: commercialAccessRow?.trial_ends_at ?? null,
    currentPeriodEnd: commercialAccessRow?.current_period_end ?? null,
  });

  // Pill de suscripción (sidebar) — solo para el OWNER real, nunca para
  // SUPERADMIN con acceso elevado (a diferencia de los banners arriba, que
  // deliberadamente no excluyen isSuperadminAccess — ver CLAUDE.md → Role
  // Philosophy: no exponer información financiera a ese acceso). Reutiliza
  // commercialAccessRow ya fetcheado para los banners, nunca un segundo RPC.
  const subscriptionPill =
    role === "OWNER" && !isSuperadminAccess
      ? (() => {
          const content = getCommercialPillContent({
            status: commercialAccessRow?.commercial_status ?? null,
            trialEndsAt: commercialAccessRow?.trial_ends_at ?? null,
            currentPeriodEnd: commercialAccessRow?.current_period_end ?? null,
          });
          return content ? { label: content.label, tone: content.tone, href: `/${club.slug}/subscription` } : null;
        })()
      : null;

  return (
    <ClubThemeProvider>
      <UpdateLastClub clubId={club.id} />
      {/* Fila sidebar+contenido — recrea el `md:flex-row` que antes vivía
          en ClubThemeProvider, ahora acotado a este único hijo para que el
          Footer (hermano siguiente, ver abajo) quede fuera de la fila y
          abarque todo el ancho, nunca apretado como tercera columna. */}
      <div className="flex flex-col md:flex-row flex-1">
        <AppNav
          club={club}
          role={role}
          membershipCount={membershipCount}
          pendingJoinRequests={pendingJoinRequests}
          notificationCount={notificationCount}
          notificationItems={notificationItems}
          identity={identity}
          isSuperadminAccess={isSuperadminAccess}
          subscriptionPill={subscriptionPill}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          {isSuperadminAccess && (
            <div className="px-4 md:px-6 pt-4">
              <SuperadminAccessBanner clubId={club.id} />
            </div>
          )}

          {/* OWNER-only: the real enforcement is server-side (every write RPC
              rejects an archived club) — this is just visibility, per CLAUDE.md
              → Notifications & Live-Update Principles' spirit of never hiding
              state behind silence. ADMIN/PLAYER learn about it inline, only
              when they actually attempt a blocked operation. */}
          {role === "OWNER" && club.archived_at && (
            <div className="px-4 md:px-6 pt-4">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
                Este club está archivado. Ya no acepta nuevas reservas, solicitudes de ingreso ni invitaciones. Toda la información histórica se conserva.
              </div>
            </div>
          )}

          {/* Comercial v2 — banner global, OWNER-only, visible en todo el
              shell del club (Dashboard, Reservaciones, Jugadores, Ranking,
              Torneos, Club, etc. — cualquier página que renderice dentro de
              este layout, una sola vez por pantalla). Mismo criterio que el
              banner de club archivado justo arriba: la autoridad real es el
              bloqueo server-side (_require_commercial_access dentro de las
              RPCs de creación); esto es únicamente visibilidad, nunca
              bloquea navegación ni oculta contenido. `commercialPhase` solo
              decide COPY (ver shared/commercial/lifecycle.ts) — nunca
              acceso. ADMIN/PLAYER nunca ven ninguno de estos tres — sin
              comportamiento nuevo para SUPERADMIN. El CTA de cada banner
              lleva a /[club]/subscription (Comercial v2 / Fase 3), nunca un
              enlace muerto: la ruta existe y ya tiene un checkout real. */}
          {role === "OWNER" && commercialPhase === "trial_grace" && (
            <div className="px-4 md:px-6 pt-4">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium text-amber-200">Tu período gratuito terminó</p>
                  <p className="mt-0.5">
                    Puedes seguir usando todas las funciones hasta el{" "}
                    {commercialGraceDeadline?.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}.
                    Realiza el pago para mantener activo tu club.
                  </p>
                </div>
                <Link
                  href={`/${club.slug}/subscription`}
                  className="shrink-0 inline-flex items-center h-9 px-4 rounded-lg bg-brand-primary text-brand-bg text-sm font-semibold hover:brightness-110 transition-all"
                >
                  Pagar suscripción
                </Link>
              </div>
            </div>
          )}

          {role === "OWNER" && commercialPhase === "past_due" && (
            <div className="px-4 md:px-6 pt-4">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium text-amber-200">Tienes un pago pendiente</p>
                  <p className="mt-0.5">
                    Todavía tienes acceso completo hasta el{" "}
                    {commercialGraceDeadline?.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                    . Realiza el pago para evitar que tu club se suspenda.
                  </p>
                </div>
                <Link
                  href={`/${club.slug}/subscription`}
                  className="shrink-0 inline-flex items-center h-9 px-4 rounded-lg bg-brand-primary text-brand-bg text-sm font-semibold hover:brightness-110 transition-all"
                >
                  Pagar suscripción
                </Link>
              </div>
            </div>
          )}

          {role === "OWNER" && commercialPhase === "suspended" && (
            <div className="px-4 md:px-6 pt-4">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium text-amber-200">Tu suscripción no está activa</p>
                  <p className="mt-0.5">
                    Algunas funciones están temporalmente limitadas. Reactiva tu suscripción para volver a crear reservas y torneos.
                  </p>
                </div>
                <Link
                  href={`/${club.slug}/subscription`}
                  className="shrink-0 inline-flex items-center h-9 px-4 rounded-lg bg-brand-primary text-brand-bg text-sm font-semibold hover:brightness-110 transition-all"
                >
                  Reactivar suscripción
                </Link>
              </div>
            </div>
          )}

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
      <Footer />
    </ClubThemeProvider>
  );
}
