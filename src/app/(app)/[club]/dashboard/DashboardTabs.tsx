"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { DASHBOARD_TABS, type DashboardTabKey } from "./dashboardTabsConfig";

interface DashboardTabsProps {
  active: DashboardTabKey;
  proxima: React.ReactNode;
  historico: React.ReactNode;
  actividad: React.ReactNode;
}

// All three tabs' content is already server-rendered above (same data, same
// queries, same calculations as before) — this just toggles which one shows.
// The active tab lives in the URL (?tab=) so it survives the historical
// range selector's own navigation instead of snapping back to the default.
export function DashboardTabs({ active, proxima, historico, actividad }: DashboardTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectTab(key: DashboardTabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "proxima") params.delete("tab");
    else params.set("tab", key);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const content = active === "historico" ? historico : active === "actividad" ? actividad : proxima;

  return (
    <div>
      <div
        role="tablist"
        className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-brand-surface border border-white/10 mb-4 sm:mb-6 sm:inline-flex sm:w-auto"
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
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1.5 py-2 sm:px-4 rounded-xl text-[11px] sm:text-sm transition-colors ${
                isActive ? "font-semibold" : "text-brand-muted hover:text-white"
              }`}
              style={
                isActive
                  ? { backgroundColor: "color-mix(in srgb, var(--club-primary) 18%, transparent)", color: "var(--club-primary)" }
                  : undefined
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="leading-none sm:hidden">{mobileLabel}</span>
              <span className="hidden sm:inline whitespace-nowrap">{label}</span>
            </button>
          );
        })}
      </div>

      {content}
    </div>
  );
}
