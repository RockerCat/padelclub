"use client";

import { useState } from "react";
import { MapPin, Clock, Banknote, ChevronRight, Layers } from "lucide-react";
import { durationLabel } from "@/lib/durations";
import { buildScheduleSummary, type OperatingHour } from "@/lib/operatingHours";
import type { Club, SportCategory } from "@/types/database";
import { LocationModal } from "./LocationModal";
import { OperationModal } from "./OperationModal";
import { PricingModal, type PricingRuleWithPrices } from "./PricingModal";
import { DefaultPlayerCategoryModal } from "./DefaultPlayerCategoryModal";
import { ArchiveClubButton } from "./ArchiveClubButton";

type ModuleKey = "location" | "operation" | "pricing" | "defaultPlayerCategory";

interface SettingsModulesProps {
  club: Club;
  clubSlug: string;
  initialHours: OperatingHour[];
  role: "OWNER" | "ADMIN";
  pricingRules: PricingRuleWithPrices[];
  pricingCourts: { id: string; name: string }[];
  allowedDurations: number[];
  sportCategories: SportCategory[];
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

// Interactive when onClick is provided (opens the edit modal) vs. a plain,
// non-clickable summary block when it isn't — every module below is
// interactive for both OWNER and ADMIN now; onClick stays optional purely
// so a future view-only card can reuse this same component without a
// second one. Same container, border, radius, spacing and title style
// either way — only the "Editar" affordance and click behavior differ.
function ModuleCard({
  icon: Icon,
  title,
  onClick,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-brand-muted shrink-0" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>

      <div className="flex-1 flex flex-col gap-1">{children}</div>

      {onClick && (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium self-end"
          style={{ color: "var(--club-primary)" }}
        >
          Editar
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      )}
    </>
  );

  if (!onClick) {
    return (
      <div className="flex flex-col text-left gap-3 p-5 rounded-2xl bg-brand-surface border border-white/10">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col text-left gap-3 p-5 rounded-2xl bg-brand-surface border border-white/10 hover:border-brand-primary/25 hover:bg-brand-primary/5 transition-colors"
    >
      {content}
    </button>
  );
}

export function SettingsModules({
  club,
  clubSlug,
  initialHours,
  role,
  pricingRules,
  pricingCourts,
  allowedDurations,
  sportCategories,
}: SettingsModulesProps) {
  const [openModal, setOpenModal] = useState<ModuleKey | null>(null);

  const locationLine = [club.city, club.state, club.country].filter(Boolean).join(", ");
  const schedule = buildScheduleSummary(initialHours);

  const activeRules = pricingRules.filter((r) => r.is_active);
  // Minimum across every configured duration-price of every active rule —
  // there's no single "the" price per rule anymore, each rule can have up
  // to 3 duration prices, so this now reads from the child rows.
  const allActivePrices = activeRules.flatMap((r) => r.club_pricing_rule_prices);
  const minPrice = allActivePrices.length > 0 ? Math.min(...allActivePrices.map((p) => p.price_amount)) : null;
  const pricingCurrency = allActivePrices[0]?.currency ?? "COP";

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ubicación, Operación, Tarifas y Categoría de jugadores son
            configuración operativa — editable tanto por OWNER como por
            ADMIN (horarios, cierres puntuales, tarifas por instrucción del
            OWNER, etc.). Solo "Archivar club" abajo, una acción de
            propiedad/ciclo de vida del club, queda exclusiva de OWNER. */}
        <ModuleCard icon={MapPin} title="Ubicación" onClick={() => setOpenModal("location")}>
          <p className="text-sm text-white/80 truncate">{locationLine || "Sin ubicación configurada"}</p>
        </ModuleCard>

        <ModuleCard icon={Clock} title="Operación" onClick={() => setOpenModal("operation")}>
          {schedule.length === 0 ? (
            <p className="text-xs text-brand-muted/50">Sin horarios configurados</p>
          ) : (
            <p className="text-xs text-white/70">
              {schedule[0].label} <span className="text-brand-muted">· {schedule[0].timeRange}</span>
            </p>
          )}
          <p className="text-xs text-brand-muted truncate">
            Duraciones: {allowedDurations.map((m) => durationLabel(m)).join(", ")}
          </p>
        </ModuleCard>

        <ModuleCard icon={Banknote} title="Tarifas" onClick={() => setOpenModal("pricing")}>
          {pricingRules.length === 0 ? (
            <p className="text-xs text-brand-muted/50">Sin tarifas configuradas</p>
          ) : (
            <>
              <p className="text-sm text-white/80">
                {activeRules.length} {activeRules.length === 1 ? "regla activa" : "reglas activas"}
              </p>
              <p className="text-xs text-brand-muted truncate">
                {minPrice !== null
                  ? `Desde ${formatCurrency(minPrice, pricingCurrency)}`
                  : "Todas las reglas están desactivadas"}
              </p>
            </>
          )}
        </ModuleCard>

        {/* Fase 1 módulo deportivo — solo configura la categoría
            predeterminada, sin puntos, ranking, ciclos ni historial. */}
        <ModuleCard icon={Layers} title="Categoría de jugadores" onClick={() => setOpenModal("defaultPlayerCategory")}>
          {club.default_player_category ? (
            <p className="text-sm text-white/80">Categoría inicial: {club.default_player_category}</p>
          ) : (
            <p className="text-xs text-brand-muted/50">Sin configurar</p>
          )}
        </ModuleCard>
      </div>

      {/* Danger zone — OWNER only, matches the visibility rule every other
          OWNER-only card in this grid already uses. Hidden once the club
          is already archived: the layout's own banner already covers that
          state, and re-archiving would only ever fail. */}
      {role === "OWNER" && !club.archived_at && (
        <div className="mt-4">
          <ArchiveClubButton clubId={club.id} />
        </div>
      )}

      {openModal === "location" && <LocationModal club={club} onClose={() => setOpenModal(null)} />}
      {openModal === "operation" && (
        <OperationModal
          clubId={club.id}
          initialHours={initialHours}
          allowedDurations={allowedDurations}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "pricing" && (
        <PricingModal
          clubId={club.id}
          courts={pricingCourts}
          initialRules={pricingRules}
          allowedDurations={allowedDurations}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "defaultPlayerCategory" && (
        <DefaultPlayerCategoryModal
          clubId={club.id}
          clubSlug={clubSlug}
          currentCategory={club.default_player_category}
          categories={sportCategories}
          onClose={() => setOpenModal(null)}
        />
      )}
    </>
  );
}
