"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { DASHBOARD_TABS, type DashboardTabKey } from "./dashboardTabsConfig";

interface DashboardTabsProps {
  active: DashboardTabKey;
  operacion: React.ReactNode;
  rendimiento: React.ReactNode;
  actividad: React.ReactNode;
  canchas: React.ReactNode;
}

// Every view's content is already server-rendered above (same data, same
// queries, same calculations as before) — this just toggles which one shows.
// The active view lives in the URL (?tab=) so it survives any per-view
// navigation (e.g. Rendimiento's own period selector) instead of snapping
// back to the default.
export function DashboardTabs({ active, operacion, rendimiento, actividad, canchas }: DashboardTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectTab(key: DashboardTabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "operacion") params.delete("tab");
    else params.set("tab", key);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const content =
    active === "rendimiento" ? rendimiento : active === "actividad" ? actividad : active === "canchas" ? canchas : operacion;

  return (
    <div>
      {/* Mobile: 2×2 grid, no horizontal scroll. Desktop: compact horizontal
          tabs (sm:flex), same underlying list/order. */}
      <div
        role="tablist"
        className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-brand-surface border border-white/10 mb-4 sm:mb-6 sm:flex sm:w-auto"
      >
        {DASHBOARD_TABS.map(({ key, label, mobileLabel, Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(key)}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 py-2.5 sm:px-4 rounded-xl text-xs sm:text-sm transition-colors ${
                isActive ? "font-semibold" : "text-brand-muted hover:text-white"
              }`}
              style={
                isActive
                  ? { backgroundColor: "color-mix(in srgb, var(--club-primary) 18%, transparent)", color: "var(--club-primary)" }
                  : undefined
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="leading-none sm:hidden truncate">{mobileLabel}</span>
              <span className="hidden sm:inline whitespace-nowrap">{label}</span>
            </button>
          );
        })}
      </div>

      {content}
    </div>
  );
}
