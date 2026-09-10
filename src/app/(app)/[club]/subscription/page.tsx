import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveClubAccess } from "@/lib/clubAccess";
import { Badge } from "@/components/ui";
import { CheckoutForm } from "./CheckoutForm";
import { deriveCommercialPhase, type CommercialPhase } from "../../../../../shared/commercial/lifecycle";

interface SubscriptionPageProps {
  params: Promise<{ club: string }>;
}

// Fase 4 — timeZone explícito: esta página es un Server Component (corre
// en el runtime del servidor, no en el navegador del OWNER) y toda fecha
// acá es comercial (trial/período/gracia) — sin timeZone, toLocaleDateString
// usa la zona del proceso servidor (UTC en Vercel), no la de Bogotá, y
// podía mostrar un día distinto cerca de la medianoche (mismo patrón ya
// usado en RecentActivitySection.tsx/SportEvolutionSection.tsx).
function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" });
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: currency ?? "COP", maximumFractionDigits: 0 }).format(
    amount
  );
}

// no_subscription = club legacy sin fila en club_subscriptions — la regla
// comercial vigente (ver CLAUDE.md → Commercial Subscription Principles,
// get_club_commercial_access: "sin fila → allowed") es que este club
// conserva acceso comercial completo, exactamente igual que uno con
// status='active'. El badge y el mensaje de abajo reflejan eso
// explícitamente ("Activo" + acceso confirmado) en vez del "Sin
// suscripción" ambiguo que había antes, que podía leerse como una alerta
// para el OWNER cuando en realidad no hay ninguna acción pendiente.
const PHASE_LABEL: Record<CommercialPhase, { text: string; variant: "warning" | "success" | "danger" | "default" }> = {
  no_subscription: { text: "Activo", variant: "success" },
  trial: { text: "En prueba", variant: "warning" },
  trial_grace: { text: "Período gratuito terminado", variant: "warning" },
  active: { text: "Activa", variant: "success" },
  past_due: { text: "Pago pendiente", variant: "warning" },
  suspended: { text: "Suspendida", variant: "danger" },
  unrecognized: { text: "—", variant: "default" },
};

// Solo el OWNER real puede ver/gestionar la suscripción de su club — nunca
// ADMIN/PLAYER, nunca acceso elevado de SUPERADMIN (mover dinero real nunca
// depende de un bypass operativo, mismo criterio que create_pending_payment).
export default async function SubscriptionPage({ params }: SubscriptionPageProps) {
  const { club: slug } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase.from("clubs").select("id, name, slug").eq("slug", slug).eq("is_active", true).single();
  if (!club) notFound();

  const access = await resolveClubAccess(supabase, club.id);
  if (!access.authorized) redirect("/unauthorized");
  if (access.role !== "OWNER" || access.isSuperadminAccess) redirect(`/${slug}/dashboard`);

  // get_my_club_subscription/get_my_club_payments added in 20261115000007,
  // not yet in generated types until `npm run types:generate` runs against
  // a DB with this migration applied.
  const [{ data: subscriptionRows }, { data: paymentRows }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("get_my_club_subscription", { p_club_id: club.id }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("get_my_club_payments", { p_club_id: club.id, p_limit: 10 }),
  ]);

  const subscription = subscriptionRows?.[0] ?? null;
  const payments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    payment_method: string | null;
    paid_at: string | null;
    failed_at: string | null;
    created_at: string;
  }> = paymentRows ?? [];

  const { phase, graceDeadline } = deriveCommercialPhase({
    status: subscription?.status ?? null,
    trialEndsAt: subscription?.trial_ends_at ?? null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
  });

  const canPay = phase === "trial" || phase === "trial_grace" || phase === "past_due" || phase === "suspended";
  const payLabel = phase === "suspended" ? "Reactivar suscripción" : "Pagar suscripción";
  const badge = PHASE_LABEL[phase];

  const price = subscription?.promo_enabled && subscription?.promo_monthly_price != null
    ? subscription.promo_monthly_price
    : subscription?.base_monthly_price ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
      <Link
        href={`/${slug}/dashboard`}
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Dashboard
      </Link>

      <h1 className="text-xl font-bold text-white mb-1">Suscripción</h1>
      <p className="text-sm text-brand-muted mb-8">Estado comercial de {club.name}.</p>

      <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Estado</h2>
          <Badge variant={badge.variant} size="sm">{badge.text}</Badge>
        </div>

        {/* Un club legacy (no_subscription) no tiene un precio propio
            asociado todavía — mostrar el precio base/promo actual de
            commercial_settings acá se leería como "esto es lo que este club
            paga", que no es cierto para ningún club sin fila en
            club_subscriptions. Se omite todo el grid (no solo el precio)
            para no dejar una celda vacía a su lado. */}
        {phase !== "no_subscription" && (
          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div>
              <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Precio mensual</p>
              <p className="text-white">{formatMoney(price, subscription?.currency ?? "COP")}</p>
            </div>
            {phase === "trial" && (
              <div>
                <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Trial hasta</p>
                <p className="text-white">{formatDate(subscription?.trial_ends_at ?? null)}</p>
              </div>
            )}
            {(phase === "trial_grace" || phase === "past_due") && (
              <div>
                <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Fecha límite de pago</p>
                <p className="text-white">{graceDeadline ? formatDate(graceDeadline.toISOString()) : "—"}</p>
              </div>
            )}
            {phase === "active" && (
              <div>
                <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Vigente hasta</p>
                <p className="text-white">{formatDate(subscription?.current_period_end ?? null)}</p>
              </div>
            )}
          </div>
        )}

        {phase === "trial_grace" && (
          <p className="text-sm text-amber-300 bg-amber-400/5 border border-amber-400/20 rounded-xl px-4 py-3 mb-4">
            Tu período gratuito terminó. Puedes seguir usando todas las funciones hasta el{" "}
            {graceDeadline ? formatDate(graceDeadline.toISOString()) : "—"}. Realiza el pago para mantener activo tu club.
          </p>
        )}
        {phase === "past_due" && (
          <p className="text-sm text-amber-300 bg-amber-400/5 border border-amber-400/20 rounded-xl px-4 py-3 mb-4">
            Tu pago está pendiente. Puedes seguir usando todas las funciones hasta el{" "}
            {graceDeadline ? formatDate(graceDeadline.toISOString()) : "—"}, cuando el club se suspenderá si no se
            registra el pago.
          </p>
        )}
        {phase === "suspended" && (
          <p className="text-sm text-red-300 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
            Tu suscripción no está activa. Reactívala para volver a crear reservas y torneos.
          </p>
        )}
        {phase === "no_subscription" && (
          <p className="text-sm text-brand-muted">
            Tu club conserva acceso completo a todas las funciones. Todavía no tiene una suscripción comercial
            asociada — esto es normal para clubes existentes desde antes de este sistema y no requiere ninguna
            acción de tu parte.
          </p>
        )}

        {canPay && <CheckoutForm clubId={club.id} clubSlug={slug} label={payLabel} />}
      </div>

      {payments.length > 0 && (
        <div className="bg-brand-surface border border-white/10 rounded-2xl p-6">
          <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">Historial de pagos</h2>
          <div className="flex flex-col divide-y divide-white/5">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="text-white">{formatMoney(p.amount, p.currency)}</p>
                  <p className="text-xs text-brand-muted">{formatDate(p.created_at)}</p>
                </div>
                <Badge
                  variant={
                    p.status === "approved" ? "success" : p.status === "pending" ? "warning" : "danger"
                  }
                  size="sm"
                >
                  {p.status === "approved"
                    ? "Aprobado"
                    : p.status === "pending"
                      ? "Pendiente"
                      : p.status === "declined"
                        ? "Rechazado"
                        : p.status === "voided"
                          ? "Anulado"
                          : "Error"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
