"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { RegisterMenu } from "@/components/features/marketing/RegisterMenu";
import { NotificationBell } from "./NotificationBell";
import { createClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/notifications";
import { BrandLogo } from "./BrandLogo";

const navLinks = [
  { label: "Características", href: "#features" },
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "Explorar clubes", href: "/clubs" },
  { label: "Contacto", href: "#contacto" },
];

// Computed server-side by (marketing)/layout.tsx (same identity/entry-path/
// notifications sources the authenticated app already uses — see
// getSidebarIdentity, resolveClubEntryPath, getUnreadNotificationCount/
// getRecentNotifications) and passed down as a plain prop, never refetched
// or re-derived here. null means "no session" — the only signal this
// component needs to pick which CTA set to render.
export interface NavbarAuthState {
  name: string;
  entryPath: string;
  notificationCount: number;
  notificationItems: NotificationRow[];
}

interface NavbarProps {
  authState?: NavbarAuthState | null;
}

export default function Navbar({ authState = null }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  // Same sign-out call AppNav's own handleLogout already uses. router.refresh()
  // (not router.push) because we're already on the right public page — this
  // re-runs the server layout with the now-signless session, which is what
  // flips authState back to null and restores the visitor CTAs below.
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-brand-bg/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 lg:h-20 items-center justify-between">

          <BrandLogo size="lg" priority />

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-brand-muted hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {authState ? (
              <>
                <Link
                  href={authState.entryPath}
                  className="max-w-[160px] truncate text-sm font-semibold text-white hover:text-brand-primary transition-colors"
                >
                  {authState.name}
                </Link>
                <NotificationBell
                  initialCount={authState.notificationCount}
                  initialItems={authState.notificationItems}
                />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5 transition-colors"
                >
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5 transition-colors"
                >
                  Iniciar sesión
                </Link>
                <RegisterMenu
                  playerOnly
                  triggerClassName="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-bg hover:bg-brand-primary/90 transition-colors"
                  triggerContent="Registrarme"
                />
              </>
            )}
          </div>

          <button
            className="md:hidden text-white p-1"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menú"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-brand-surface">
          <div className="px-4 py-5 flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-brand-muted hover:text-white transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {authState ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={authState.entryPath}
                    className="min-w-0 flex-1 truncate text-sm font-semibold text-white"
                    onClick={() => setMobileOpen(false)}
                  >
                    {authState.name}
                  </Link>
                  <NotificationBell
                    initialCount={authState.notificationCount}
                    initialItems={authState.notificationItems}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    handleLogout();
                  }}
                  className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white text-center hover:border-white/30 transition-colors"
                >
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white text-center hover:border-white/30 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  Iniciar sesión
                </Link>
                <RegisterMenu
                  playerOnly
                  triggerClassName="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-bg hover:bg-brand-primary/90 transition-colors"
                  triggerContent="Registrarme"
                />
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
