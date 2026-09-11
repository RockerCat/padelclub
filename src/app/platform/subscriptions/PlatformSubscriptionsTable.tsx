"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CreditCard } from "lucide-react";
import { Badge, FilterDropdown } from "@/components/ui";
import {
  getPlatformCommercialBadge,
  PLATFORM_COMMERCIAL_FILTER_OPTIONS,
  type PlatformBadgeVariant,
} from "../../../../shared/commercial/platformBadge";
import { deriveCommercialPhase, type CommercialPhase } from "../../../../shared/commercial/lifecycle";

export type PlatformSubscriptionRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  owner_name: string | null;
  owner_email: string | null;
  has_subscription: boolean;
  commercial_status: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  payer_name: string | null;
  payer_email: string | null;
  last_payment_status: string | null;
  last_payment_at: string | null;
  last_payment_amount: number | null;
  last_payment_currency: string | null;
};

type FilterValue = "all" | CommercialPhase;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currency ?? "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

const LAST_PAYMENT_STATUS_LABEL: Record<string, { text: string; variant: PlatformBadgeVariant }> = {
  approved: { text: "Aprobado", variant: "success" },
  pending: { text: "Pendiente", variant: "warning" },
  declined: { text: "Rechazado", variant: "danger" },
  voided: { text: "Anulado", variant: "default" },
  error: { text: "Error", variant: "danger" },
};

function phaseOf(row: PlatformSubscriptionRow): CommercialPhase {
  return deriveCommercialPhase({
    status: row.commercial_status,
    trialEndsAt: row.trial_ends_at,
    currentPeriodEnd: row.current_period_end,
  }).phase;
}

export function PlatformSubscriptionsTable({ clubs }: { clubs: PlatformSubscriptionRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const metrics = useMemo(() => {
    const counts: Record<CommercialPhase, number> = {
      no_subscription: 0,
      trial: 0,
      trial_grace: 0,
      active: 0,
      past_due: 0,
      suspended: 0,
      unrecognized: 0,
    };
    for (const club of clubs) counts[phaseOf(club)]++;
    return counts;
  }, [clubs]);

  const filtered = clubs.filter((club) => {
    if (filter !== "all" && phaseOf(club) !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      club.name.toLowerCase().includes(q) ||
      club.slug.toLowerCase().includes(q) ||
      (club.owner_name ?? "").toLowerCase().includes(q) ||
      (club.owner_email ?? "").toLowerCase().includes(q) ||
      (club.payer_name ?? "").toLowerCase().includes(q) ||
      (club.payer_email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Resumen operacional — conteos simples, nunca MRR/ARR/forecasting. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total", value: clubs.length },
          { label: "Legacy", value: metrics.no_subscription },
          { label: "En trial", value: metrics.trial + metrics.trial_grace },
          { label: "Activos", value: metrics.active },
          { label: "Pago pendiente", value: metrics.past_due },
          { label: "Suspendidos", value: metrics.suspended },
        ].map((m) => (
          <div key={m.label} className="bg-brand-surface border border-white/10 rounded-2xl p-4">
            <p className="text-xl font-bold text-white tabular-nums leading-none">{m.value}</p>
            <p className="text-xs text-brand-muted mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            placeholder="Buscar por club, slug, owner o payer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-white/10 bg-white/5 text-base md:text-sm text-white placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 transition-colors"
          />
        </div>
        <FilterDropdown
          label="Estado comercial"
          value={filter}
          defaultValue="all"
          options={PLATFORM_COMMERCIAL_FILTER_OPTIONS}
          onChange={setFilter}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-brand-surface border border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <CreditCard className="w-5 h-5 text-brand-muted" />
          </div>
          <p className="text-sm font-medium text-white mb-1">Sin resultados</p>
          <p className="text-xs text-brand-muted">Ningún club coincide con los filtros actuales.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-brand-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-brand-muted uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Club</th>
                <th className="px-4 py-3 font-medium">Owner / Payer</th>
                <th className="px-4 py-3 font-medium">Estado comercial</th>
                <th className="px-4 py-3 font-medium">Trial</th>
                <th className="px-4 py-3 font-medium">Período actual</th>
                <th className="px-4 py-3 font-medium">Próximo cobro</th>
                <th className="px-4 py-3 font-medium">Último pago</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((club) => {
                const badge = getPlatformCommercialBadge({
                  status: club.commercial_status,
                  trialEndsAt: club.trial_ends_at,
                  currentPeriodEnd: club.current_period_end,
                });
                const lastPayment = club.last_payment_status
                  ? LAST_PAYMENT_STATUS_LABEL[club.last_payment_status] ?? { text: club.last_payment_status, variant: "default" as const }
                  : null;

                return (
                  <tr
                    key={club.id}
                    onClick={() => router.push(`/platform/clubs/${club.id}`)}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="text-white font-medium whitespace-nowrap">{club.name}</p>
                      <p className="text-xs text-brand-muted">/{club.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white whitespace-nowrap">{club.owner_name ?? "—"}</p>
                      {club.payer_email && club.payer_email !== club.owner_email && (
                        <p className="text-xs text-brand-muted">Paga: {club.payer_name ?? club.payer_email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={badge.variant} size="sm">
                        {badge.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-brand-muted whitespace-nowrap">
                      {club.trial_started_at || club.trial_ends_at
                        ? `${formatDate(club.trial_started_at)} → ${formatDate(club.trial_ends_at)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-brand-muted whitespace-nowrap">
                      {club.current_period_start || club.current_period_end
                        ? `${formatDate(club.current_period_start)} → ${formatDate(club.current_period_end)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-brand-muted whitespace-nowrap">
                      {formatDate(club.next_billing_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lastPayment ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant={lastPayment.variant} size="sm">
                            {lastPayment.text}
                          </Badge>
                          <span className="text-xs text-brand-muted">
                            {formatMoney(club.last_payment_amount, club.last_payment_currency)} ·{" "}
                            {formatDate(club.last_payment_at)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-brand-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
