"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  CalendarDays,
  Settings,
  Users,
  Home,
  User,
  LogOut,
  Lock,
  ArrowLeftRight,
  PlusCircle,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { ClubHeader } from "./ClubHeader";

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
    primary_color: string;
  };
  role: "OWNER" | "ADMIN" | "PLAYER";
  membershipCount: number;
  pendingJoinRequests?: number;
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
        label: "Canchas",
        href: `/${slug}/admin/courts`,
        icon: Home,
      },
      {
        label: "Jugadores",
        href: `/${slug}/admin/players`,
        icon: Users,
        color: "secondary" as const,
        badgeCount: pendingJoinRequests,
      },
      {
        label: "Equipo",
        href: `/${slug}/admin/team`,
        icon: ShieldCheck,
      },
      {
        label: "Reservaciones",
        href: `/${slug}/admin/reservations`,
        icon: CalendarDays,
        color: "secondary" as const,
      },
      {
        label: "Configuración",
        href: `/${slug}/admin/settings`,
        icon: Settings,
      }
    );
  } else if (role === "ADMIN") {
    base.push(
      {
        label: "Reservaciones",
        href: `/${slug}/admin/reservations`,
        icon: CalendarDays,
        color: "secondary" as const,
      },
      {
        label: "Canchas",
        href: `/${slug}/admin/courts`,
        icon: Home,
      },
      {
        label: "Jugadores",
        href: `/${slug}/admin/players`,
        icon: Users,
        color: "secondary" as const,
        badgeCount: pendingJoinRequests,
      }
    );
  } else {
    // PLAYER
    base.push({
      label: "Reservaciones",
      href: `/${slug}/reservations`,
      icon: CalendarDays,
    });
  }

  return base;
}

// ─── NavContent extracted as a standalone component ───────────────────────────

interface NavContentProps {
  club: AppNavProps["club"];
  role: AppNavProps["role"];
  membershipCount: number;
  navItems: NavItem[];
  pathname: string;
  onLinkClick: () => void;
  onLogout: () => void;
}

function NavContent({
  club,
  role,
  membershipCount,
  navItems,
  pathname,
  onLinkClick,
  onLogout,
}: NavContentProps) {
  return (
    <nav className="flex flex-col h-full">
      <ClubHeader club={club} role={role} />

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
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-brand-muted/50 cursor-not-allowed select-none">
          <User className="w-4 h-4 shrink-0" />
          <span className="text-sm flex-1">Mi Perfil</span>
          <span className="text-[10px] font-medium bg-white/5 border border-white/10 text-brand-muted px-1.5 py-0.5 rounded-md flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" />
            Próx.
          </span>
        </div>
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

export function AppNav({ club, role, membershipCount, pendingJoinRequests = 0 }: AppNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  const navItems = getNavItems(club.slug, role, pendingJoinRequests);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-brand-surface border-r border-white/10 h-screen sticky top-0">
        <NavContent
          club={club}
          role={role}
          membershipCount={membershipCount}
          navItems={navItems}
          pathname={pathname}
          onLinkClick={closeMobile}
          onLogout={handleLogout}
        />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-brand-surface border-b border-white/10 sticky top-0 z-40">
        <span className="text-sm font-semibold text-white truncate mr-2">
          {club.name}
        </span>
        <button
          onClick={() => setMobileOpen((prev) => !prev)}
          className="p-2 rounded-xl text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors shrink-0"
          aria-label="Abrir menú"
        >
          {mobileOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Mobile drawer */}
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
              onLinkClick={closeMobile}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}
    </>
  );
}
