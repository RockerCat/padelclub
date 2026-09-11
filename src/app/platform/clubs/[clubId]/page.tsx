import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  Users,
  CalendarDays,
  Megaphone,
  Home,
  Lock,
  UserCog,
  LogIn,
  Building2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button } from "@/components/ui";
import { ClubClaimSection, type ClubClaimStatus } from "./ClubClaimSection";
import { DeactivateClubButton } from "./DeactivateClubButton";
import { ReactivateClubButton } from "./ReactivateClubButton";
import { ChangeSlugButton } from "./ChangeSlugButton";
import { getPlatformCommercialBadge } from "../../../../../shared/commercial/platformBadge";

interface PageProps {
  params: Promise<{ clubId: string }>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currency ?? "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

const LAST_PAYMENT_STATUS_LABEL: Record<string, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  declined: "Rechazado",
  voided: "Anulado",
  error: "Error",
};

type CommercialStatus = {
  has_subscription: boolean;
  status: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_days_remaining: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  payer_name: string | null;
  payer_email: string | null;
  last_payment_at: string | null;
  last_payment_status: string | null;
  base_monthly_price: number | null;
  promo_enabled: boolean | null;
  promo_monthly_price: number | null;
  currency: string | null;
};

// Comercial v2 / Fase 6 — get_platform_subscription_periods /
// get_platform_subscription_payments (20261115000009). Solo lectura, nunca
// exponen raw_response/payload ni permiten editar nada.
type SubscriptionPeriodRow = {
  id: string;
  period_start: string;
  period_end: string;
  base_price: number;
  discount_amount: number;
  final_price: number;
  currency: string;
  status: string;
  created_at: string;
};

type SubscriptionPaymentRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  payment_method: string | null;
  provider_reference: string;
  provider_transaction_id: string | null;
  paid_at: string | null;
  failed_at: string | null;
  created_at: string;
};

const PERIOD_STATUS_LABEL: Record<string, { label: string; variant: "warning" | "success" | "danger" | "default" }> = {
  trial: { label: "Trial", variant: "default" },
  pending: { label: "Pendiente", variant: "warning" },
  paid: { label: "Pagado", variant: "success" },
  failed: { label: "Fallido", variant: "danger" },
  expired: { label: "Vencido", variant: "default" },
};

const PAYMENT_STATUS_BADGE: Record<string, { label: string; variant: "warning" | "success" | "danger" | "default" }> = {
  pending: { label: "Pendiente", variant: "warning" },
  approved: { label: "Aprobado", variant: "success" },
  declined: { label: "Rechazado", variant: "danger" },
  voided: { label: "Anulado", variant: "default" },
  error: { label: "Error", variant: "danger" },
};

function StatBox({
  label,
  value,
  Icon,
}: {
  label: string;
  value: number;
  Icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 text-brand-muted shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-lg font-bold text-white tabular-nums leading-none">{value}</p>
        <p className="text-xs text-brand-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function SoonButton({
  label,
  Icon,
  variant = "secondary",
}: {
  label: string;
  Icon: ComponentType<{ className?: string }>;
  variant?: "secondary" | "danger";
}) {
  return (
    <Button variant={variant} disabled className="justify-between w-full sm:w-auto">
      <span className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        {label}
      </span>
      <span className="text-[10px] font-medium bg-white/10 text-brand-muted px-1.5 py-0.5 rounded-md flex items-center gap-1 ml-2">
        <Lock className="w-2.5 h-2.5" />
        Próximamente
      </span>
    </Button>
  );
}

export default async function PlatformClubDetailPage({ params }: PageProps) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_platform_club_detail", { p_club_id: clubId });
  const club = data?.[0];

  if (!club && !error) notFound();

  const { data: claimStatusRows } = await supabase.rpc("get_club_claim_status", { p_club_id: clubId });
  // SQL restringe status a los valores de ClubClaimStatus; el tipo generado
  // por Supabase no conserva ese union literal.
  const claimStatus: ClubClaimStatus = (claimStatusRows?.[0] ?? null) as unknown as ClubClaimStatus;

  // get_platform_club_commercial_status added in 20261115000005, not yet in
  // generated types until `npm run types:generate` runs against a DB with
  // this migration applied — same documented gap as get_my_profile in
  // src/lib/platformAdminQuery.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: commercialRows } = await (supabase.rpc as any)("get_platform_club_commercial_status", {
    p_club_id: clubId,
  });
  const commercial: CommercialStatus | null = commercialRows?.[0] ?? null;

  // get_platform_subscription_periods/get_platform_subscription_payments
  // added in 20261115000009, not yet in generated types until
  // types:generate runs against a DB with this migration applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: periodRows } = await (supabase.rpc as any)("get_platform_subscription_periods", {
    p_club_id: clubId,
  });
  const periods: SubscriptionPeriodRow[] = periodRows ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: paymentRows } = await (supabase.rpc as any)("get_platform_subscription_payments", {
    p_club_id: clubId,
  });
  const payments: SubscriptionPaymentRow[] = paymentRows ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <Link
        href="/platform/clubs"
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Clubes
      </Link>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          No se pudo cargar el club ({error.message}).
        </div>
      )}

      {club && (
        <>
          {/* ── Información general ─────────────────────────────────── */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden bg-white/5 text-brand-muted ring-1 ring-white/10">
                {club.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={club.logo_url} alt={`Logo de ${club.name}`} className="w-full h-full object-cover" />
                ) : (
                  getInitials(club.name)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-white">{club.name}</h1>
                <p className="text-sm text-brand-muted">/{club.slug}</p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Badge variant={club.is_active ? "success" : "danger"} size="sm">
                    {club.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                  <Badge variant={club.visibility === "public" ? "outline" : "secondary"} size="sm">
                    {club.visibility === "public" ? "Pública" : "Privada"}
                  </Badge>
                  <span className="text-xs text-brand-muted">
                    Creado el {formatDate(club.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Owner ────────────────────────────────────────────────── */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
              Owner
            </h2>
            <p className="text-sm font-medium text-white">{club.owner_name ?? "—"}</p>
            <p className="text-sm text-brand-muted">{club.owner_email ?? "—"}</p>
          </div>

          {/* ── Entrega del club ─────────────────────────────────────── */}
          <ClubClaimSection clubId={club.id} clubSlug={club.slug} initialStatus={claimStatus} />

          {/* ── Estado comercial (Comercial v2 / Fase 1) ────────────────
              Puramente informativo — sin acciones todavía (sin Wompi, sin
              edición manual de estado). Un pending club sin claim todavía
              no tiene fila en club_subscriptions; claim_club() la crea. */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
              Estado comercial
            </h2>
            {!commercial?.has_subscription ? (
              <p className="text-sm text-brand-muted">Sin suscripción comercial inicializada</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Estado</p>
                  {(() => {
                    const badge = getPlatformCommercialBadge({
                      status: commercial.status,
                      trialEndsAt: commercial.trial_ends_at,
                      currentPeriodEnd: commercial.current_period_end,
                    });
                    return (
                      <Badge variant={badge.variant} size="sm">
                        {badge.label}
                      </Badge>
                    );
                  })()}
                </div>
                <div>
                  <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Trial</p>
                  <p className="text-white">
                    {commercial.trial_started_at ? formatDate(commercial.trial_started_at) : "—"}
                    {" → "}
                    {commercial.trial_ends_at ? formatDate(commercial.trial_ends_at) : "—"}
                  </p>
                  {commercial.trial_days_remaining !== null && (
                    <p className="text-xs text-brand-muted/70 mt-0.5">
                      {commercial.trial_days_remaining} días restantes
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Período actual</p>
                  <p className="text-white">
                    {commercial.current_period_start ? formatDate(commercial.current_period_start) : "—"}
                    {" → "}
                    {commercial.current_period_end ? formatDate(commercial.current_period_end) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Próximo cobro</p>
                  <p className="text-white">
                    {commercial.next_billing_at ? formatDate(commercial.next_billing_at) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Payer</p>
                  <p className="text-white">{commercial.payer_name ?? "—"}</p>
                  <p className="text-xs text-brand-muted">{commercial.payer_email ?? "—"}</p>
                </div>
                {/* Comercial v2 / Fase 3 — último resultado de pago, sin
                    abrir la tabla `payments` completa a SUPERADMIN; ni
                    refunds, ni edición, ni aprobación manual acá. */}
                <div>
                  <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Último pago</p>
                  <p className="text-white">
                    {LAST_PAYMENT_STATUS_LABEL[commercial.last_payment_status ?? ""] ?? "—"}
                  </p>
                  {commercial.last_payment_at && (
                    <p className="text-xs text-brand-muted">{formatDate(commercial.last_payment_at)}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Precio configurado</p>
                  <p className="text-white">
                    {formatMoney(commercial.base_monthly_price, commercial.currency)}
                    {commercial.promo_enabled && (
                      <span className="text-brand-muted">
                        {" "}
                        · promo {formatMoney(commercial.promo_monthly_price, commercial.currency)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Períodos (Comercial v2 / Fase 6) — historial de
              subscription_periods, más reciente primero. Solo lectura;
              cada fila conserva su propio snapshot de precio, nunca se
              recalcula si commercial_settings cambia después. ─────────── */}
          {periods.length > 0 && (
            <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
              <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
                Períodos
              </h2>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-brand-muted uppercase tracking-wider">
                      <th className="px-2 py-2 font-medium">Período</th>
                      <th className="px-2 py-2 font-medium">Estado</th>
                      <th className="px-2 py-2 font-medium text-right">Base</th>
                      <th className="px-2 py-2 font-medium text-right">Descuento</th>
                      <th className="px-2 py-2 font-medium text-right">Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((period) => (
                      <tr key={period.id} className="border-t border-white/5">
                        <td className="px-2 py-2 text-white whitespace-nowrap">
                          {formatDate(period.period_start)} → {formatDate(period.period_end)}
                        </td>
                        <td className="px-2 py-2">
                          <Badge variant={PERIOD_STATUS_LABEL[period.status]?.variant ?? "default"} size="sm">
                            {PERIOD_STATUS_LABEL[period.status]?.label ?? period.status}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 text-right text-brand-muted whitespace-nowrap">
                          {formatMoney(period.base_price, period.currency)}
                        </td>
                        <td className="px-2 py-2 text-right text-brand-muted whitespace-nowrap">
                          {formatMoney(period.discount_amount, period.currency)}
                        </td>
                        <td className="px-2 py-2 text-right text-white whitespace-nowrap">
                          {formatMoney(period.final_price, period.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Pagos (Comercial v2 / Fase 6) — historial de payments, más
              reciente primero. Nunca muestra raw_response ni permite
              aprobar/editar/anular un pago desde acá. ─────────────────── */}
          {payments.length > 0 && (
            <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
              <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
                Pagos
              </h2>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-brand-muted uppercase tracking-wider">
                      <th className="px-2 py-2 font-medium">Fecha</th>
                      <th className="px-2 py-2 font-medium">Estado</th>
                      <th className="px-2 py-2 font-medium text-right">Monto</th>
                      <th className="px-2 py-2 font-medium">Método</th>
                      <th className="px-2 py-2 font-medium">Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-t border-white/5">
                        <td className="px-2 py-2 text-white whitespace-nowrap">
                          {formatDate(payment.paid_at ?? payment.failed_at ?? payment.created_at)}
                        </td>
                        <td className="px-2 py-2">
                          <Badge variant={PAYMENT_STATUS_BADGE[payment.status]?.variant ?? "default"} size="sm">
                            {PAYMENT_STATUS_BADGE[payment.status]?.label ?? payment.status}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 text-right text-white whitespace-nowrap">
                          {formatMoney(payment.amount, payment.currency)}
                        </td>
                        <td className="px-2 py-2 text-brand-muted whitespace-nowrap">
                          {payment.payment_method ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-brand-muted whitespace-nowrap font-mono text-xs">
                          {payment.provider_reference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Estadísticas ─────────────────────────────────────────── */}
          <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
            Estadísticas
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
            <StatBox label="Administradores" value={club.admin_count} Icon={ShieldCheck} />
            <StatBox label="Jugadores" value={club.player_count} Icon={Users} />
            <StatBox label="Reservas" value={club.reservation_count} Icon={CalendarDays} />
            <StatBox label="Noticias" value={club.news_count} Icon={Megaphone} />
            <StatBox label="Canchas" value={club.court_count} Icon={Home} />
          </div>

          {/* ── Acciones (deshabilitadas por ahora) ─────────────────── */}
          <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
            Acciones
          </h2>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            {club.is_active ? (
              <DeactivateClubButton clubId={club.id} />
            ) : (
              <ReactivateClubButton clubId={club.id} />
            )}
            <ChangeSlugButton clubId={club.id} currentSlug={club.slug} />
            <SoonButton label="Cambiar Owner" Icon={UserCog} />
            {club.is_active ? (
              <Link
                // A club with zero courts has never been through any setup
                // step (branding/location/hours/tarifas/courts all start
                // blank for both create_club_with_owner and
                // platform_create_pending_club) — court_count === 0 is the
                // one signal already available here without duplicating
                // dashboard/page.tsx's own onboarding-completeness check.
                // ?new=1 is the exact same query param
                // src/app/onboarding/actions.ts already appends after a
                // normal OWNER creates a club — reusing that contract is
                // what makes OnboardingWizard auto-open here too, instead
                // of leaving SUPERADMIN on the collapsed reminder bar a
                // fresh club would otherwise show. Once the club has at
                // least one court, this reverts to a plain link — a
                // returning visit must never re-trigger the wizard, same
                // as it never does for a real OWNER's normal navigation.
                href={club.court_count === 0 ? `/${club.slug}/dashboard?new=1` : `/${club.slug}/dashboard`}
                className="inline-flex items-center justify-between gap-2 h-10 px-4 text-sm font-medium rounded-xl border border-white/20 text-white hover:border-white/40 hover:bg-white/5 active:bg-white/10 transition-all duration-200 w-full sm:w-auto"
              >
                <span className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  Entrar al club
                </span>
              </Link>
            ) : (
              <Button
                variant="secondary"
                disabled
                title="Reactiva el club primero para poder entrar."
                className="justify-between w-full sm:w-auto"
              >
                <span className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  Entrar al club
                </span>
                <span className="text-[10px] font-medium bg-white/10 text-brand-muted px-1.5 py-0.5 rounded-md flex items-center gap-1 ml-2">
                  <Lock className="w-2.5 h-2.5" />
                  Reactiva primero
                </span>
              </Button>
            )}
            <SoonButton label="Administrar administradores" Icon={Building2} />
          </div>
        </>
      )}
    </div>
  );
}
