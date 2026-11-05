"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, LogOut, Swords, Building2, User, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { BrandLogo } from "./BrandLogo";
import { NotificationBell } from "./NotificationBell";
import { ClubThemeProvider } from "./ClubThemeProvider";
import Footer from "./Footer";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import type { PlayerShellContext } from "@/lib/playerShell";

// Navegación personal "Mi Pádel" — global, nunca ligada a un club. Cuatro
// destinos fijos; el contexto de cada club (reservas, torneos, ranking,
// dashboard del club) sigue viviendo en AppNav bajo /[club]/..., con un
// regreso explícito a Mi Pádel. Misma estética que AppNav (superficie,
// bordes, acento cian, tab bar móvil con áreas seguras) sin compartir su
// código: así ningún cambio aquí puede alterar la navegación de un club.

interface ShellItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Prefijos adicionales que cuentan como "activo". */
  match: string[];
}

const ITEMS: ShellItem[] = [
  { href: "/mi-padel", label: "Inicio", icon: Home, match: ["/mi-padel"] },
  { href: "/partidos", label: "Partidos", icon: Swords, match: ["/partidos"] },
  { href: "/clubs", label: "Clubes", icon: Building2, match: ["/clubs"] },
  { href: "/profile", label: "Mi perfil", icon: User, match: ["/profile"] },
];

function isActive(pathname: string, item: ShellItem): boolean {
  return item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function PlayerShell({ context, children }: { context: PlayerShellContext; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <ClubThemeProvider>
      <div className="flex flex-1 flex-col md:flex-row">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-brand-surface md:flex">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-4">
            <BrandLogo size="sm" />
            <NotificationBell initialCount={context.notificationCount} initialItems={context.notificationItems} />
          </div>
          <p className="px-5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Mi Pádel</p>
          <nav className="flex flex-col gap-1 p-3" aria-label="Navegación personal">
            {ITEMS.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    active ? "bg-brand-primary/10 font-semibold text-brand-primary" : "text-brand-muted hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-1 border-t border-white/10 p-3">
            <div className="flex items-center gap-3 px-3 py-2">
              <PlayerAvatar player={{ id: null, full_name: context.name, avatar_url: context.avatarUrl }} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{context.name}</p>
                <p className="text-[11px] text-brand-muted">Jugador</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-brand-muted transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Salir
            </button>
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="sticky top-0 z-50 md:hidden">
          <div
            className="flex items-center justify-between gap-2 border-b border-white/10 bg-brand-surface px-4 pb-3"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <BrandLogo size="sm" />
            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell initialCount={context.notificationCount} initialItems={context.notificationItems} />
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Salir"
                className="rounded-full p-2 text-brand-muted ring-1 ring-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <main className="min-w-0 flex-1">{children}</main>

        {/* Mobile bottom tab bar — 4 destinos, áreas seguras respetadas;
            ClubThemeProvider ya reserva el espacio inferior (pb-28). */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/10 bg-brand-surface md:hidden"
          style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
          aria-label="Navegación personal"
        >
          {ITEMS.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 active:scale-[0.96]"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                    active ? "bg-brand-primary/15 text-brand-primary" : "text-brand-muted"
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className={cn("max-w-full truncate text-[10px] leading-none", active ? "font-semibold text-brand-primary" : "text-brand-muted")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
      <Footer />
    </ClubThemeProvider>
  );
}
