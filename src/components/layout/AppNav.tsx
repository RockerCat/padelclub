"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  CalendarDays,
  Users,
  Home,
  User,
  LogOut,
  Lock,
  ArrowLeftRight,
  PlusCircle,
  Building2,
  ChevronDown,
  Trophy,
  Swords,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { clubHubPath } from "@/lib/clubHubPaths";
import { ClubHeader } from "./ClubHeader";
import { NotificationBell } from "./NotificationBell";
import { JoinRequestsListener } from "./JoinRequestsListener";
import { SidebarIdentity } from "./SidebarIdentity";
import { LeaveClubButton } from "./LeaveClubButton";
import type { NotificationRow } from "@/lib/notifications";
import type { SidebarIdentityData } from "@/lib/userIdentity";
import { clubRoleLabel } from "@/lib/roleLabels";
import { CLUB_PRIMARY_COLOR } from "@/lib/constants/clubTheme";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Compact label for the mobile user-menu trigger — "Alex Sosa", never the
// raw club name. getSidebarIdentity() already resolves name → email →
// "Usuario" server-side (never re-queried here); this only further reduces
// an email-shaped fallback ("alex@gmail.com") to its local part ("alex")
// so the button stays short. A real full_name is shown exactly as stored.
function getDisplayName(identity: SidebarIdentityData): string {
  const source = identity.name || identity.email || "";
  if (source.includes("@")) {
    const local = source.slice(0, source.indexOf("@"));
    return local || "Usuario";
  }
  return source || "Usuario";
}

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  soon?: boolean;
  color?: "primary" | "secondary";
  badgeCount?: number;
}

interface AppNavProps {
  club: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
  role: "OWNER" | "ADMIN" | "PLAYER";
  membershipCount: number;
  pendingJoinRequests?: number;
  notificationCount?: number;
  notificationItems?: NotificationRow[];
  identity: SidebarIdentityData;
}

// pendingJoinRequests only ever has a meaningful value for OWNER/ADMIN (the
// layout never queries it for PLAYER), so gating the badge by role here is
// just a safety net — the real exclusion already happens in the layout.
function getNavItems(slug: string, role: AppNavProps["role"], pendingJoinRequests: number): NavItem[] {
  const base: NavItem[] = [];

  if (role === "OWNER") {
    base.push(
      {
        label: "Dashboard",
        href: `/${slug}/dashboard`,
        icon: LayoutDashboard,
        color: "secondary" as const,
      },
      {
        label: "Reservaciones",
        href: `/${slug}/admin/reservations`,
        icon: CalendarDays,
        color: "secondary" as const,
      },
      {
        label: "Jugadores",
        href: `/${slug}/admin/players`,
        icon: Users,
        color: "secondary" as const,
        badgeCount: pendingJoinRequests,
      },
      {
        label: "Ranking",
        href: `/${slug}/ranking`,
        icon: Trophy,
      },
      {
        label: "Torneos",
        href: `/${slug}/admin/tournaments`,
        icon: Swords,
      },
      {
        label: "Club",
        href: clubHubPath(slug),
        icon: Building2,
      }
    );
  } else if (role === "ADMIN") {
    base.push(
      {
        label: "Dashboard",
        href: `/${slug}/dashboard`,
        icon: LayoutDashboard,
        color: "secondary" as const,
      },
      {
        label: "Reservaciones",
        href: `/${slug}/admin/reservations`,
        icon: CalendarDays,
        color: "secondary" as const,
      },
      {
        label: "Jugadores",
        href: `/${slug}/admin/players`,
        icon: Users,
        color: "secondary" as const,
        badgeCount: pendingJoinRequests,
      },
      {
        label: "Ranking",
        href: `/${slug}/ranking`,
        icon: Trophy,
      },
      {
        label: "Torneos",
        href: `/${slug}/admin/tournaments`,
        icon: Swords,
      },
      {
        label: "Club",
        href: clubHubPath(slug),
        icon: Building2,
      }
    );
  } else {
    // PLAYER
    base.push(
      {
        label: "Página del club",
        href: `/${slug}/home`,
        icon: Home,
      },
      {
        label: "Reservaciones",
        href: `/${slug}/reservations`,
        icon: CalendarDays,
      },
      {
        label: "Ranking",
        href: `/${slug}/ranking`,
        icon: Trophy,
      },
      {
        label: "Torneos",
        href: `/${slug}/tournaments`,
        icon: Swords,
      }
    );
  }

  return base;
}

// ─── Mobile tab bar (OWNER/ADMIN only) ─────────────────────────────────────────
// 6 fixed items, same order/labels regardless of role — OWNER's and ADMIN's
// navItems now both carry Dashboard/Jugadores/Reservaciones/Torneos/
// Ranking/Club with identical href/icon (see getNavItems above), so this
// stays a single shared list. There is no overflow menu anymore — every
// personal action (Mi Perfil, cambiar/crear club, Salir) lives in the
// user-name dropdown in the top bar instead (see userMenuOpen below), never
// duplicated here. href/icon are read straight from navItems — the single
// source of truth already used by the desktop sidebar — never a second,
// possibly-drifting hardcoded route list. Dashboard/Reservaciones get a
// shorter mobile-only label ("Inicio"/"Reservas") — the route itself is
// untouched.
const TAB_BAR_LABELS = ["Dashboard", "Jugadores", "Reservaciones", "Torneos", "Ranking", "Club"] as const;
const TAB_BAR_LABEL_OVERRIDES: Record<string, string> = {
  Dashboard: "Inicio",
  Reservaciones: "Reservas",
};

function getTabBarItems(navItems: NavItem[]): NavItem[] {
  const byLabel = new Map(navItems.map((item) => [item.label, item] as const));
  return TAB_BAR_LABELS.map((label) => byLabel.get(label))
    .filter((item): item is NavItem => !!item)
    .map((item) => (TAB_BAR_LABEL_OVERRIDES[item.label] ? { ...item, label: TAB_BAR_LABEL_OVERRIDES[item.label] } : item));
}

function MobileTabBarItem({
  item,
  isActive,
}: {
  item: NavItem;
  isActive: boolean;
}) {
  const Icon = item.icon;
  const accent = item.color === "secondary" ? "var(--club-secondary)" : "var(--club-primary)";

  const inner = (
    <>
      <span
        className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
        style={{
          backgroundColor: isActive
            ? `color-mix(in srgb, ${accent} 18%, transparent)`
            : undefined,
          // lucide-react icons default to stroke="currentColor" — setting
          // color on this wrapper tints the icon without needing a `style`
          // prop on the icon component itself (NavItem["icon"] only accepts
          // `className`, same contract the desktop sidebar already relies on).
          color: isActive ? accent : undefined,
        }}
      >
        <Icon className={cn("w-[18px] h-[18px]", !isActive && "text-brand-muted")} />
      </span>
      <span
        className={cn("text-[10px] leading-none truncate max-w-full", isActive ? "font-semibold" : "text-brand-muted")}
        style={isActive ? { color: accent } : undefined}
      >
        {item.label}
      </span>
    </>
  );

  // Every tab-bar item is a real route now that "Más" is gone — href is
  // always set here (unlike NavItem in general, which also covers the
  // desktop sidebar's disabled/soon entries).
  return (
    <Link
      href={item.href!}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 min-w-0"
    >
      {inner}
    </Link>
  );
}

// ─── NavContent extracted as a standalone component ───────────────────────────

interface NavContentProps {
  club: AppNavProps["club"];
  role: AppNavProps["role"];
  membershipCount: number;
  navItems: NavItem[];
  pathname: string;
  notificationCount: number;
  notificationItems: NotificationRow[];
  identity: SidebarIdentityData;
  onLinkClick: () => void;
  onLogout: () => void;
}

function NavContent({
  club,
  role,
  membershipCount,
  navItems,
  pathname,
  notificationCount,
  notificationItems,
  identity,
  onLinkClick,
  onLogout,
}: NavContentProps) {
  return (
    <nav className="flex flex-col h-full">
      <div className="relative">
        <ClubHeader club={club} role={role} />
        <div className="absolute top-3 right-3">
          <NotificationBell initialCount={notificationCount} initialItems={notificationItems} />
        </div>
      </div>

      {/* Nav items */}
      <ul className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.href
            ? pathname === item.href ||
              pathname.startsWith(item.href + "/")
            : false;
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <li key={item.label}>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-brand-muted/50 cursor-not-allowed select-none">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm flex-1">{item.label}</span>
                  {item.soon && (
                    <span className="text-[10px] font-medium bg-white/5 border border-white/10 text-brand-muted px-1.5 py-0.5 rounded-md flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      Próx.
                    </span>
                  )}
                </div>
              </li>
            );
          }

          const accent =
            item.color === "secondary" ? "var(--club-secondary)" : "var(--club-primary)";

          return (
            <li
              key={item.label}
              className="relative"
              style={{ "--item-accent": accent } as React.CSSProperties}
            >
              {/* Left pill indicator for active item */}
              {isActive && (
                <span
                  className="absolute left-0 inset-y-1 w-0.5 rounded-r-full"
                  style={{ backgroundColor: accent }}
                />
              )}
              <Link
                href={item.href!}
                onClick={onLinkClick}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
                  isActive
                    ? "font-semibold"
                    : "text-brand-muted hover:text-white hover:bg-[color-mix(in_srgb,var(--item-accent)_5%,transparent)]"
                )}
                style={
                  isActive
                    ? {
                        backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`,
                        color: accent,
                      }
                    : undefined
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {!!item.badgeCount && (
                  <span className="text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shrink-0">
                    {item.badgeCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Bottom actions */}
      <div className="p-3 border-t border-white/10 flex flex-col gap-1">
        <SidebarIdentity
          name={identity.name}
          email={identity.email}
          avatarUrl={identity.avatarUrl}
          roleLabel={clubRoleLabel(role)}
        />
        <Link
          href="/profile"
          onClick={onLinkClick}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
            pathname === "/profile"
              ? "text-white bg-brand-primary/5"
              : "text-brand-muted hover:text-white hover:bg-brand-primary/5"
          )}
        >
          <User className="w-4 h-4 shrink-0" />
          <span>Mi Perfil</span>
        </Link>
        {membershipCount >= 2 && (
          <Link
            href="/clubs"
            onClick={onLinkClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4 shrink-0" />
            <span>Cambiar de club</span>
          </Link>
        )}
        {role === "OWNER" && (
          <Link
            href="/clubs/create"
            onClick={onLinkClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Crear otro club</span>
          </Link>
        )}
        {role === "PLAYER" && <LeaveClubButton clubId={club.id} />}
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors w-full text-left"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Salir</span>
        </button>
      </div>
    </nav>
  );
}

// ─── AppNav main component ────────────────────────────────────────────────────

export function AppNav({
  club,
  role,
  membershipCount,
  pendingJoinRequests = 0,
  notificationCount = 0,
  notificationItems = [],
  identity,
}: AppNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  // PLAYER keeps its existing mobile pattern untouched (hamburger + full
  // drawer reusing NavContent) — only OWNER/ADMIN get the new top bar + tab
  // bar below, per this task's explicit scope.
  const [mobileOpen, setMobileOpen] = useState(false);
  // OWNER/ADMIN mobile-only user menu, opened from the name button in the
  // top bar (never an avatar-only trigger) — Mi Perfil/Cambiar de
  // club/Crear otro club (OWNER)/Salir. Separate from mobileOpen (PLAYER's
  // drawer) so neither role's state interferes with the other's UI.
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuTriggerRef = useRef<HTMLButtonElement>(null);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  // Escape closes the user menu and returns focus to its trigger — same
  // accessible-menu behavior as the existing ContextMenu primitive.
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setUserMenuOpen(false);
        userMenuTriggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [userMenuOpen]);

  const navItems = getNavItems(club.slug, role, pendingJoinRequests);
  const tabBarItems = getTabBarItems(navItems);
  const displayName = getDisplayName(identity);

  return (
    <>
      {/* Invisible — keeps the Jugadores badge (and the Jugadores page's
          own list, when that's the active route) live for OWNER/ADMIN.
          PLAYER never sees that badge, so it doesn't need the subscription. */}
      {role !== "PLAYER" && <JoinRequestsListener clubId={club.id} />}

      {/* Desktop sidebar — unchanged for every role */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-brand-surface border-r border-white/10 h-screen sticky top-0">
        <NavContent
          club={club}
          role={role}
          membershipCount={membershipCount}
          navItems={navItems}
          pathname={pathname}
          notificationCount={notificationCount}
          notificationItems={notificationItems}
          identity={identity}
          onLinkClick={closeMobile}
          onLogout={handleLogout}
        />
      </aside>

      {role === "PLAYER" ? (
        <>
          {/* Mobile top bar — PLAYER, unchanged */}
          <div className="md:hidden flex items-center justify-between px-4 py-3 bg-brand-surface border-b border-white/10 sticky top-0 z-40">
            <div className="flex items-center gap-2.5 min-w-0 mr-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden ring-1 ring-white/10"
                style={
                  !club.logo_url
                    ? { backgroundColor: `${CLUB_PRIMARY_COLOR}22`, color: CLUB_PRIMARY_COLOR }
                    : undefined
                }
              >
                {club.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={club.logo_url}
                    alt={`Logo de ${club.name}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getInitials(club.name)
                )}
              </div>
              <span className="text-sm font-semibold text-white truncate">
                {club.name}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <NotificationBell initialCount={notificationCount} initialItems={notificationItems} />
              <button
                onClick={() => setMobileOpen((prev) => !prev)}
                className="p-2 rounded-xl text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors"
                aria-label="Abrir menú"
              >
                {mobileOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile drawer — PLAYER, unchanged */}
          {mobileOpen && (
            <div className="md:hidden fixed inset-0 z-30 flex">
              {/* Overlay */}
              <div
                className="absolute inset-0 bg-black/60"
                onClick={closeMobile}
              />
              {/* Drawer */}
              <div className="relative z-10 w-72 max-w-[85vw] bg-brand-surface border-r border-white/10 h-full flex flex-col">
                <NavContent
                  club={club}
                  role={role}
                  membershipCount={membershipCount}
                  navItems={navItems}
                  pathname={pathname}
                  notificationCount={notificationCount}
                  notificationItems={notificationItems}
                  identity={identity}
                  onLinkClick={closeMobile}
                  onLogout={handleLogout}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Mobile top bar — OWNER/ADMIN: club logo/name/role on the left
              (the club's identity, never the user's — matches PLAYER's own
              header and desktop's ClubHeader), the existing notification
              bell, and a name+chevron trigger on the right for the
              signed-in user's own menu (Mi Perfil/cambiar-crear club/
              Salir) — replaces the hamburger+drawer entirely. */}
          {/* z-50 (not z-40, matching the tab bar below) so this element's
              whole stacking context — including the user-menu overlay/
              panel nested inside it — reliably paints above the bottom tab
              bar regardless of DOM order; a descendant's own z-index can
              never escape its ancestor's stacking context to out-rank a
              sibling, so the wrapper itself must outrank z-40. */}
          <div className="md:hidden sticky top-0 z-50">
            <div
              className="flex items-center justify-between gap-2 px-4 bg-brand-surface border-b border-white/10 pb-3"
              style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
            >
              <div className="flex items-center gap-2.5 min-w-0 mr-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden ring-1 ring-white/10"
                  style={
                    !club.logo_url
                      ? { backgroundColor: `${CLUB_PRIMARY_COLOR}22`, color: CLUB_PRIMARY_COLOR }
                      : undefined
                  }
                >
                  {club.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={club.logo_url}
                      alt={`Logo de ${club.name}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    getInitials(club.name)
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{club.name}</p>
                  <p className="text-[11px] text-brand-muted truncate">{clubRoleLabel(role)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <NotificationBell initialCount={notificationCount} initialItems={notificationItems} />
                <button
                  ref={userMenuTriggerRef}
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  aria-label="Menú de usuario"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  className="flex items-center gap-1 pl-1 pr-1.5 py-1 rounded-full ring-1 ring-white/10 hover:ring-white/30 transition-colors max-w-[130px]"
                >
                  <span className="text-sm font-medium text-white truncate">{displayName}</span>
                  <ChevronDown className={cn("w-4 h-4 text-brand-muted shrink-0 transition-transform", userMenuOpen && "rotate-180")} />
                </button>
              </div>
            </div>

            {userMenuOpen && (
              <>
                {/* Click-away overlay — above the top bar and the tab bar
                    (both z-40) so a tap anywhere else, including over the
                    tab bar, closes the menu instead of navigating; still
                    far below any real modal/panel (z-[400]+). */}
                <div
                  className="fixed inset-0 z-[45]"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div
                  role="menu"
                  aria-label="Menú de usuario"
                  className="absolute right-4 top-full mt-2 z-50 w-64 max-w-[80vw] rounded-2xl border border-white/10 bg-brand-surface shadow-2xl overflow-hidden"
                >
                  <div className="p-2 flex flex-col gap-0.5">
                    <Link
                      href="/profile"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
                        pathname === "/profile"
                          ? "text-white bg-brand-primary/5"
                          : "text-brand-muted hover:text-white hover:bg-brand-primary/5"
                      )}
                    >
                      <User className="w-4 h-4 shrink-0" />
                      <span>Mi Perfil</span>
                    </Link>
                    {membershipCount >= 2 && (
                      <Link
                        href="/clubs"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors"
                      >
                        <ArrowLeftRight className="w-4 h-4 shrink-0" />
                        <span>Cambiar de club</span>
                      </Link>
                    )}
                    {role === "OWNER" && (
                      <Link
                        href="/clubs/create"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors"
                      >
                        <PlusCircle className="w-4 h-4 shrink-0" />
                        <span>Crear otro club</span>
                      </Link>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleLogout();
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors w-full text-left"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span>Salir</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Bottom tab bar — OWNER/ADMIN, mobile only. Fixed, below every
              real modal/panel (z-[400]+) but above ordinary page content. */}
          <nav
            className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch bg-brand-surface border-t border-white/10"
            style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
            aria-label="Navegación principal"
          >
            {tabBarItems.map((item) => (
              <MobileTabBarItem
                key={item.label}
                item={item}
                isActive={
                  item.href ? pathname === item.href || pathname.startsWith(item.href + "/") : false
                }
              />
            ))}
          </nav>
        </>
      )}
    </>
  );
}
