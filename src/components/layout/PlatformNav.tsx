"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  Building2,
  Users,
  BarChart3,
  CreditCard,
  Settings,
  Lock,
  ArrowLeftRight,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  soon?: boolean;
}

// Dashboard/Clubes/Usuarios are functional today. Estadísticas/Suscripciones/
// Configuración are placeholders reserving their spot in the nav for a later
// story — kept disabled rather than omitted, same pattern AppNav already
// uses for not-yet-built items.
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/platform", icon: LayoutDashboard },
  { label: "Clubes", href: "/platform/clubs", icon: Building2 },
  { label: "Usuarios", href: "/platform/users", icon: Users },
  { label: "Estadísticas", icon: BarChart3, disabled: true, soon: true },
  { label: "Suscripciones", icon: CreditCard, disabled: true, soon: true },
  { label: "Configuración", icon: Settings, disabled: true, soon: true },
];

function PlatformHeader() {
  return (
    <div className="relative overflow-hidden px-4 pt-6 pb-5 shrink-0">
      <div
        className="absolute inset-0 opacity-[0.15] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 25% 0%, var(--color-brand-primary), transparent 65%), radial-gradient(ellipse at 75% 100%, var(--color-brand-secondary), transparent 65%)",
        }}
      />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-brand-primary/15 text-brand-primary ring-1 ring-white/10">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">
            <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>Mi</span>
            <span className="text-white">Padel</span>
            <span className="text-brand-primary">Club</span>
          </p>
          <p className="text-xs text-brand-muted mt-0.5">Platform Admin</p>
        </div>
      </div>
      <div
        className="absolute inset-x-0 bottom-0 h-0.5"
        style={{
          background:
            "linear-gradient(to right, transparent 10%, var(--color-brand-primary) 25%, var(--color-brand-secondary) 75%, transparent 90%)",
        }}
      />
    </div>
  );
}

interface NavContentProps {
  pathname: string;
  onLinkClick: () => void;
  onLogout: () => void;
}

function NavContent({ pathname, onLinkClick, onLogout }: NavContentProps) {
  return (
    <nav className="flex flex-col h-full">
      <PlatformHeader />

      <ul className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          if (item.disabled || !item.href) {
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

          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <li key={item.label} className="relative">
              {isActive && (
                <span className="absolute left-0 inset-y-1 w-0.5 rounded-r-full bg-brand-primary" />
              )}
              <Link
                href={item.href}
                onClick={onLinkClick}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
                  isActive
                    ? "font-semibold bg-brand-primary/15 text-brand-primary"
                    : "text-brand-muted hover:text-white hover:bg-white/5"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="p-3 border-t border-white/10 flex flex-col gap-1">
        <Link
          href="/clubs"
          onClick={onLinkClick}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-white/5 transition-colors"
        >
          <ArrowLeftRight className="w-4 h-4 shrink-0" />
          <span>Volver a Mis clubes</span>
        </Link>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-white/5 transition-colors w-full text-left"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Salir</span>
        </button>
      </div>
    </nav>
  );
}

export function PlatformNav() {
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

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-brand-surface border-r border-white/10 h-screen sticky top-0">
        <NavContent pathname={pathname} onLinkClick={closeMobile} onLogout={handleLogout} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-brand-surface border-b border-white/10 sticky top-0 z-40">
        <div className="flex items-center gap-2.5 min-w-0 mr-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-brand-primary/15 text-brand-primary shrink-0 ring-1 ring-white/10">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-white truncate">Platform Admin</span>
        </div>
        <button
          onClick={() => setMobileOpen((prev) => !prev)}
          className="p-2 rounded-xl text-brand-muted hover:text-white hover:bg-white/5 transition-colors shrink-0"
          aria-label="Abrir menú"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex">
          <div className="absolute inset-0 bg-black/60" onClick={closeMobile} />
          <div className="relative z-10 w-72 max-w-[85vw] bg-brand-surface border-r border-white/10 h-full flex flex-col">
            <NavContent pathname={pathname} onLinkClick={closeMobile} onLogout={handleLogout} />
          </div>
        </div>
      )}
    </>
  );
}
