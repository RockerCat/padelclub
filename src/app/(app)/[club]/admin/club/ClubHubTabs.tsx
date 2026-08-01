"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { clubHubTabsForRole, type ClubHubTabKey } from "./clubHubTabsConfig";

interface ClubHubTabsProps {
  active: ClubHubTabKey;
  role: "OWNER" | "ADMIN";
}

// Selector-only — renders no content itself. The active view lives in the
// URL (?tab=) so it survives refresh/back-forward, same pattern as the
// Dashboard's own DashboardTabs (Bloque 1).
export function ClubHubTabs({ active, role }: ClubHubTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabs = clubHubTabsForRole(role);

  function selectTab(key: ClubHubTabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "perfil_publico") params.delete("tab");
    else params.set("tab", key);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div
      role="tablist"
      className={`grid ${tabs.length >= 4 ? "grid-cols-2" : "grid-cols-3"} gap-1 p-1 rounded-2xl bg-brand-surface border border-white/10 mb-4 sm:mb-6 sm:flex sm:w-auto`}
    >
      {tabs.map(({ key, label, mobileLabel, Icon }) => {
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
  );
}
