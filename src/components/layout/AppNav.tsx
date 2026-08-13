"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  User,
  LogOut,
  Lock,
  ArrowLeftRight,
  PlusCircle,
  Building2,
  ChevronDown,
  Trophy,
  Swords,
  createLucideIcon,
} from "lucide-react";
import { tennisBall, tennisRacket } from "@lucide/lab";
import { createClient } from "@/lib/supabase/client";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { cn } from "@/lib/utils/cn";
import { clubHubPath } from "@/lib/clubHubPaths";
import { ClubHeader } from "./ClubHeader";
import { NotificationBell } from "./NotificationBell";
import { JoinRequestsListener } from "./JoinRequestsListener";
import { SidebarIdentity } from "./SidebarIdentity";
// LeaveClubButton (./LeaveClubButton) intencionalmente sin importar — ver
// comentario junto a "Salir del club" más abajo: oculto de la navegación,
// componente y funcionalidad intactos.
import { ChangeClubModal } from "./ChangeClubModal";
import { CreateClubModal } from "./CreateClubModal";
import type { NotificationRow } from "@/lib/notifications";
import type { SidebarIdentityData } from "@/lib/userIdentity";
import { clubRoleLabel, PLATFORM_ADMIN_LABEL } from "@/lib/roleLabels";
import { CLUB_PRIMARY_COLOR } from "@/lib/constants/clubTheme";

// "tennis-ball" no es un ícono core de lucide-react — vive en @lucide/lab
// (paquete oficial de Lucide, sin dependencias propias, mismo trazo/
// viewBox/stroke-width que el set principal). createLucideIcon lo
// convierte en un componente con la misma forma que cualquier ícono core
// (acepta className, ref, etc.) para que encaje sin cambios en NavItem.icon
// más abajo. Reemplaza al intento anterior con Volleyball — visualmente no
// se leía como pelota de pádel/tenis.
const TennisBallIcon = createLucideIcon("tennis-ball", tennisBall);

// "tennis-racket" — mismo paquete, mismo trato. Reemplaza a Swords (que se
// leía como dos espadas cruzadas, no una pala) SOLO en el tab "Torneos" del
// PLAYER, más abajo — no existe ningún ícono "padel"/"paddle"/
// "table-tennis"/"ping-pong" en @lucide/lab ni en el set core de
// lucide-react/lucide-react-native; esta es la opción más cercana
// disponible (una sola raqueta/pala, nunca un par).
const TennisRacketIcon = createLucideIcon("tennis-racket", tennisRacket);

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

// Única fuente de "¿esta ruta está activa?" — un item está activo en su
// propia ruta O en cualquier subruta (`${href}/...`), nunca solo por
// igualdad exacta. Antes se repetía este mismo par de comparaciones en
// tres lugares (sidebar de escritorio, tab bar OWNER/ADMIN, y ahora la tab
// bar del PLAYER); centralizado aquí para que los tres midan "activo"
// exactamente igual. Cubre todas las rutas reales del PLAYER sin casos
// especiales: Reservaciones (listado/creación/detalle viven todos en
// `/[club]/reservations`, nunca una subruta — un id de reserva es un query
// param, no un segmento) ya empata por igualdad exacta; Torneos sí tiene
// una subruta real (`/[club]/tournaments/[slug]`) y la cubre el `startsWith`.
function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface NavItem {
  /** Stable identifier — never the display label, which can be dynamic
   *  (the PLAYER "Página del club" item shows the real club name instead
   *  of a fixed copy string). Used for React keys and for the tab-bar
   *  selection lookups below (getTabBarItems), which must never break
   *  just because a label's text changes. */
  id: string;
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
  /** SUPERADMIN elevated "Entrar al club" access — role stays "OWNER" for
   *  capability gating below, but the person's own identity must never
   *  read as "Propietario". Overrides the roleLabel shown next to their
   *  name/avatar everywhere it's computed. */
  isSuperadminAccess?: boolean;
}

// pendingJoinRequests only ever has a meaningful value for OWNER/ADMIN (the
// layout never queries it for PLAYER), so gating the badge by role here is
// just a safety net — the real exclusion already happens in the layout.
// clubName is only used by the PLAYER branch (its "Página del club" item
// shows the real club name instead of a fixed copy string) — always the
// same `club.name` already loaded into AppNavProps.club for every role, so
// this never triggers a new query.
function getNavItems(slug: string, role: AppNavProps["role"], pendingJoinRequests: number, clubName: string): NavItem[] {
  const base: NavItem[] = [];

  if (role === "OWNER") {
    base.push(
      {
        id: "dashboard",
        label: "Dashboard",
        href: `/${slug}/dashboard`,
        icon: LayoutDashboard,
        color: "secondary" as const,
      },
      {
        id: "reservations",
        label: "Reservaciones",
        href: `/${slug}/admin/reservations`,
        icon: CalendarDays,
        color: "secondary" as const,
      },
      {
        id: "players",
        label: "Jugadores",
        href: `/${slug}/admin/players`,
        icon: Users,
        color: "secondary" as const,
        badgeCount: pendingJoinRequests,
      },
      {
        id: "ranking",
        label: "Ranking",
        href: `/${slug}/ranking`,
        icon: Trophy,
      },
      {
        id: "tournaments",
        label: "Torneos",
        href: `/${slug}/admin/tournaments`,
        icon: Swords,
      },
      {
        id: "clubHub",
        label: "Club",
        href: clubHubPath(slug),
        icon: Building2,
      }
    );
  } else if (role === "ADMIN") {
    base.push(
      {
        id: "dashboard",
        label: "Dashboard",
        href: `/${slug}/dashboard`,
        icon: LayoutDashboard,
        color: "secondary" as const,
      },
      {
        id: "reservations",
        label: "Reservaciones",
        href: `/${slug}/admin/reservations`,
        icon: CalendarDays,
        color: "secondary" as const,
      },
      {
        id: "players",
        label: "Jugadores",
        href: `/${slug}/admin/players`,
        icon: Users,
        color: "secondary" as const,
        badgeCount: pendingJoinRequests,
      },
      {
        id: "ranking",
        label: "Ranking",
        href: `/${slug}/ranking`,
        icon: Trophy,
      },
      {
        id: "tournaments",
        label: "Torneos",
        href: `/${slug}/admin/tournaments`,
        icon: Swords,
      },
      {
        id: "clubHub",
        label: "Club",
        href: clubHubPath(slug),
        icon: Building2,
      }
    );
  } else {
    // PLAYER — "clubHome" points at exactly the same /[slug]/home route as
    // before ("Página del club"); only its label (now the real club name)
    // and icon (now a ball, not a house) changed. See CLAUDE.md → this
    // section must never show OWNER/ADMIN's separate "Club" hub (clubHub,
    // above) — different id, different href, never merged.
    base.push(
      {
        id: "dashboard",
        label: "Dashboard",
        href: `/${slug}/dashboard`,
        icon: LayoutDashboard,
      },
      {
        id: "clubHome",
        label: clubName,
        href: `/${slug}/home`,
        icon: TennisBallIcon,
      },
      {
        id: "reservations",
        label: "Reservaciones",
        href: `/${slug}/reservations`,
        icon: CalendarDays,
      },
      {
        id: "ranking",
        label: "Ranking",
        href: `/${slug}/ranking`,
        icon: Trophy,
      },
      {
        id: "tournaments",
        label: "Torneos",
        href: `/${slug}/tournaments`,
        icon: TennisRacketIcon,
      }
    );
  }

  return base;
}

// ─── Mobile tab bar (todos los roles) ──────────────────────────────────────────
// OWNER/ADMIN: 6 items fijos, mismo orden/labels para ambos — sus navItems
// ya traen Dashboard/Jugadores/Reservaciones/Torneos/Ranking/Club con
// href/icon idénticos (ver getNavItems arriba), así que sigue siendo una
// sola lista compartida. Sin menú "Más": toda acción personal (Mi Perfil,
// cambiar/crear club, Salir) vive en el menú de usuario del top bar (ver
// userMenuOpen). Dashboard/Reservaciones usan una etiqueta más corta
// ("Inicio"/"Reservas") solo en esta tab bar — la ruta real no cambia.
//
// PLAYER: 5 items, mismo orden en que ya los devuelve getNavItems
// (Dashboard, Página del club, Reservaciones, Ranking, Torneos) — caben
// todos sin menú "Más" y sin abreviar labels (a diferencia de OWNER/ADMIN,
// que sí las abrevia por tener un ítem más).
//
// Ambos casos leen href/icon directamente de navItems — nunca una segunda
// lista de rutas hardcodeada que pueda desalinearse del sidebar de
// escritorio.
// Ambas listas identifican items por `id` (nunca por `label` — el label de
// "clubHome" ahora es el nombre real del club, no un texto fijo contra el
// que se pueda comparar). El orden de cada arreglo es el orden real de la
// tab bar, deliberadamente distinto del orden del sidebar de escritorio en
// el caso de OWNER/ADMIN (Torneos antes que Ranking aquí).
const OWNER_ADMIN_TAB_BAR_IDS = ["dashboard", "players", "reservations", "tournaments", "ranking", "clubHub"] as const;
const OWNER_ADMIN_TAB_BAR_LABEL_OVERRIDES: Record<string, string> = {
  dashboard: "Inicio",
  reservations: "Reservas",
};

const PLAYER_TAB_BAR_IDS = ["dashboard", "clubHome", "reservations", "ranking", "tournaments"] as const;

function getTabBarItems(navItems: NavItem[], role: AppNavProps["role"]): NavItem[] {
  const byId = new Map(navItems.map((item) => [item.id, item] as const));

  if (role === "PLAYER") {
    return PLAYER_TAB_BAR_IDS.map((id) => byId.get(id)).filter((item): item is NavItem => !!item);
  }

  return OWNER_ADMIN_TAB_BAR_IDS.map((id) => byId.get(id))
    .filter((item): item is NavItem => !!item)
    .map((item) =>
      OWNER_ADMIN_TAB_BAR_LABEL_OVERRIDES[item.id] ? { ...item, label: OWNER_ADMIN_TAB_BAR_LABEL_OVERRIDES[item.id] } : item
    );
}

function MobileTabBarItem({
  item,
  isActive,
  isPending,
  onTap,
}: {
  item: NavItem;
  isActive: boolean;
  // True only for the single item the user just tapped, while its
  // navigation is still in flight (see pendingHref in AppNav) — drives the
  // subtle pulse below, distinct from isActive (which already reflects the
  // tap immediately, before navigation even settles).
  isPending: boolean;
  onTap: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const Icon = item.icon;
  const accent = item.color === "secondary" ? "var(--club-secondary)" : "var(--club-primary)";

  const inner = (
    <>
      <span
        className={cn("w-8 h-8 flex items-center justify-center rounded-xl transition-colors", isPending && "animate-pulse")}
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
      onClick={onTap}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 min-w-0 transition-transform duration-150 active:scale-[0.96]"
    >
      {inner}
    </Link>
  );
}

// Barra fina de progreso durante una navegación de la tab bar mobile —
// indeterminada (el App Router no expone un porcentaje real de carga), se
// monta/desmonta con `active` en vez de solo cambiar opacity, para que la
// animación (nav-progress-sweep, ver globals.css) siempre reinicie limpia
// en cada navegación en vez de continuar desde donde iba la anterior.
// Fixed + z-[60]: por encima del top bar mobile sticky (z-50) y de la tab
// bar (z-40), pero muy por debajo de cualquier modal real (z-[400]+).
function NavProgressBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="md:hidden fixed inset-x-0 z-[60] h-[3px] overflow-hidden bg-white/10"
      style={{ top: "env(safe-area-inset-top)" }}
      role="progressbar"
      aria-label="Cargando"
    >
      <div
        className="nav-progress-fill h-[3px] w-1/3 rounded-full"
        style={{ backgroundColor: "var(--club-primary)" }}
      />
    </div>
  );
}

// ─── NavContent extracted as a standalone component ───────────────────────────

interface NavContentProps {
  club: AppNavProps["club"];
  role: AppNavProps["role"];
  /** Precomputed label — "Superadministrador" for SUPERADMIN elevated
   *  access, otherwise the normal clubRoleLabel(role). */
  roleLabel: string;
  membershipCount: number;
  navItems: NavItem[];
  pathname: string;
  notificationCount: number;
  notificationItems: NotificationRow[];
  identity: SidebarIdentityData;
  onLinkClick: () => void;
  onLogout: () => void;
  // OWNER-only — abre el modal "Cambiar de club" en vez de navegar a
  // /clubs (ver ChangeClubModal). ADMIN/PLAYER conservan el Link a /clubs
  // sin cambios, así que este callback nunca se invoca para ellos.
  onOpenChangeClub: (trigger: HTMLElement) => void;
  // OWNER-only — abre el modal "Crear otro club" en vez de navegar a
  // /clubs/create (ver CreateClubModal).
  onOpenCreateClub: (trigger: HTMLElement) => void;
}

function NavContent({
  club,
  role,
  roleLabel,
  membershipCount,
  navItems,
  pathname,
  notificationCount,
  notificationItems,
  identity,
  onLinkClick,
  onLogout,
  onOpenChangeClub,
  onOpenCreateClub,
}: NavContentProps) {
  return (
    <nav className="flex flex-col h-full">
      <div className="relative">
        <ClubHeader club={club} role={role} roleLabel={roleLabel} />
        <div className="absolute top-3 right-3">
          <NotificationBell initialCount={notificationCount} initialItems={notificationItems} />
        </div>
      </div>

      {/* Nav items */}
      <ul className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.href ? isNavItemActive(pathname, item.href) : false;
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <li key={item.id}>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-brand-muted/50 cursor-not-allowed select-none">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm flex-1 min-w-0 truncate">{item.label}</span>
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
              key={item.id}
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
                <span className="flex-1 min-w-0 truncate">{item.label}</span>
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
          roleLabel={roleLabel}
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
        {/* OWNER/ADMIN: sin cambios — sigue oculto con una sola membresía. */}
        {membershipCount >= 2 &&
          (role === "OWNER" ? (
            <button
              type="button"
              onClick={(e) => {
                onLinkClick();
                onOpenChangeClub(e.currentTarget);
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors w-full text-left"
            >
              <ArrowLeftRight className="w-4 h-4 shrink-0" />
              <span>Cambiar de club</span>
            </button>
          ) : role === "ADMIN" ? (
            <Link
              href="/clubs"
              onClick={onLinkClick}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors"
            >
              <ArrowLeftRight className="w-4 h-4 shrink-0" />
              <span>Cambiar de club</span>
            </Link>
          ) : null)}
        {role === "OWNER" && (
          <button
            type="button"
            onClick={(e) => {
              onLinkClick();
              onOpenCreateClub(e.currentTarget);
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors w-full text-left"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Crear otro club</span>
          </button>
        )}
        {/* PLAYER: "Cambiar de club" siempre visible (a diferencia de OWNER/
            ADMIN, nunca condicionado a membershipCount — un PLAYER con una
            sola membresía hoy puede querer unirse a otro club desde aquí
            mismo) y siempre hacia /clubs, nunca el modal de OWNER. */}
        {role === "PLAYER" && (
          <Link
            href="/clubs"
            onClick={onLinkClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4 shrink-0" />
            <span>Cambiar de club</span>
          </Link>
        )}
        {/* "Salir del club" (LeaveClubButton) queda oculto temporalmente de
            la navegación del PLAYER por decisión de producto — el
            componente y su server action siguen intactos en
            ./LeaveClubButton, solo se retira este render. Restaurar:
            `{role === "PLAYER" && <LeaveClubButton clubId={club.id} />}`. */}
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
  isSuperadminAccess = false,
}: AppNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  // Computed once, used everywhere a role label is shown next to the
  // person's own identity or the club-relationship header — SUPERADMIN
  // elevated access must never read as "Propietario" (see AppNavProps.
  // isSuperadminAccess). `role` itself stays "OWNER" for every capability
  // check below, unaffected.
  const effectiveRoleLabel = isSuperadminAccess ? PLATFORM_ADMIN_LABEL : clubRoleLabel(role);
  // Menú de usuario mobile — compartido por los tres roles (cada uno monta
  // su propio trigger/panel, nunca los dos a la vez, ver los dos bloques
  // "role === PLAYER ? ... : ..." más abajo): Mi Perfil/Cambiar de
  // club/Crear otro club (OWNER)/Salir para OWNER/ADMIN; Mi Perfil/Cambiar
  // de club/Salir para PLAYER.
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuTriggerRef = useRef<HTMLButtonElement>(null);

  // Feedback de navegación de la tab bar mobile — el href recién tocado,
  // mientras su navegación sigue en curso. Impulsa tres cosas a la vez: (1)
  // el tab destino se ve "activo" al instante (ver effectiveNavPath más
  // abajo), sin esperar a que pathname realmente cambie; (2) la barra de
  // progreso superior (NavProgressBar); (3) bloquear un segundo tap al
  // mismo destino mientras el primero sigue en curso (ver handleTabTap).
  // Se limpia solo cuando pathname efectivamente cambia (la navegación ya
  // se resolvió, sea al destino tocado o a cualquier otro — atrás del
  // navegador incluido) — y, como red de seguridad ante una navegación que
  // nunca resuelve (error, fetch colgado), con un timeout corto para que la
  // barra y el estado "activo" nunca queden pegados indefinidamente.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset pendingHref the moment pathname actually changes — the
  // React-recommended "adjusting state when a prop changes" pattern (calling
  // setState directly during render, not inside a useEffect), since this is
  // a pure render-time derivation from pathname, not a sync with an external
  // system. A stray leftover safety-net timeout (see handleTabTap below)
  // later calling setPendingHref(null) again is harmless once this already
  // ran — never touches a newer pendingHref, since handleTabTap always
  // clears/replaces pendingTimeoutRef.current before setting a new one.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setPendingHref(null);
  }

  useEffect(() => {
    return () => {
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
    };
  }, []);

  const handleTabTap = useCallback(
    (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Clic modificado (abrir en pestaña nueva, etc.) — dejar el
      // comportamiento nativo del navegador intacto, sin estado propio.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      // Ya estamos en ese destino — Link no dispara una navegación real,
      // así que no hay nada que reflejar como pendiente.
      if (href === pathname) return;
      // Segundo tap al mismo destino mientras el primero sigue en curso —
      // ignorarlo, nunca disparar una segunda navegación duplicada.
      if (pendingHref === href) {
        e.preventDefault();
        return;
      }
      setPendingHref(href);
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = setTimeout(() => setPendingHref(null), 8000);
    },
    [pathname, pendingHref]
  );

  // Con una navegación en curso, el tab tocado debe leerse "activo" de
  // inmediato aunque pathname todavía no haya cambiado — nunca se
  // recalcula isNavItemActive contra pathname directamente en la tab bar
  // mobile mientras hay un pendingHref.
  const effectiveNavPath = pendingHref ?? pathname;

  // "Cambiar de club" / "Crear otro club" — ambos OWNER-only (ver CLAUDE.md
  // → Role Philosophy: OWNER es el único rol que puede pertenecer a varios
  // clubes como propietario). Un único estado (nunca dos booleanos
  // independientes) garantiza que jamás queden ambos modales montados a la
  // vez — incluida la transición interna desde "Cambiar de club" hacia
  // "Crear otro club" (ver ChangeClubModal → onCreateClub). clubModalTriggerRef
  // guarda el elemento que originó la secuencia — el botón del sidebar de
  // escritorio o el del menú de usuario mobile, nunca ambos a la vez — para
  // devolverle el foco al cerrar; la transición interna change→create
  // deliberadamente no lo reescribe, así el foco vuelve al disparador
  // original y no a un botón intermedio que ya no existe.
  const [activeClubModal, setActiveClubModal] = useState<"change" | "create" | null>(null);
  const clubModalTriggerRef = useRef<HTMLElement | null>(null);

  function handleOpenChangeClub(trigger: HTMLElement) {
    clubModalTriggerRef.current = trigger;
    setActiveClubModal("change");
  }

  function handleOpenCreateClub(trigger: HTMLElement) {
    clubModalTriggerRef.current = trigger;
    setActiveClubModal("create");
  }

  function handleCreateClubFromChangeModal() {
    // Transición interna — mismo trigger original, nunca se reescribe.
    setActiveClubModal("create");
  }

  function handleCloseClubModal() {
    setActiveClubModal(null);
    clubModalTriggerRef.current?.focus();
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  // Ningún rol tiene ya un drawer mobile que cerrar (PLAYER lo tenía; se
  // retiró en este mismo cambio) — se mantiene como no-op porque NavContent
  // (compartido, sidebar de escritorio de los tres roles) sigue exigiendo
  // un onLinkClick por contrato, y tocar esa interfaz no aporta nada aquí.
  function closeMobile() {}

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

  const navItems = getNavItems(club.slug, role, pendingJoinRequests, club.name);
  const tabBarItems = getTabBarItems(navItems, role);
  const displayName = getDisplayName(identity);

  return (
    <>
      {/* Invisible — keeps the Jugadores badge (and the Jugadores page's
          own list, when that's the active route) live for OWNER/ADMIN.
          PLAYER never sees that badge, so it doesn't need the subscription. */}
      {role !== "PLAYER" && <JoinRequestsListener clubId={club.id} />}

      {/* Barra global de progreso de navegación — un único punto de montaje
          para los tres roles, ver NavProgressBar arriba. */}
      <NavProgressBar active={pendingHref !== null} />

      {/* Desktop sidebar — unchanged for every role */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-brand-surface border-r border-white/10 h-screen sticky top-0">
        <NavContent
          club={club}
          role={role}
          roleLabel={effectiveRoleLabel}
          membershipCount={membershipCount}
          navItems={navItems}
          pathname={pathname}
          notificationCount={notificationCount}
          notificationItems={notificationItems}
          identity={identity}
          onLinkClick={closeMobile}
          onLogout={handleLogout}
          onOpenChangeClub={handleOpenChangeClub}
          onOpenCreateClub={handleOpenCreateClub}
        />
      </aside>

      {role === "PLAYER" ? (
        <>
          {/* Mobile top bar — PLAYER, mismo patrón aprobado para OWNER/ADMIN
              (bloque análogo más abajo): identidad del CLUB a la izquierda
              (logo/nombre/rol — nunca la del usuario), campana + trigger de
              usuario a la derecha. Reemplaza por completo el hamburger +
              drawer lateral que tenía antes. Estructura/clases idénticas al
              bloque OWNER/ADMIN a propósito (mismo patrón visual), pero
              mantenidas como bloques separados en vez de un componente
              compartido — así ningún cambio aquí puede tocar, ni por
              accidente, la navegación de OWNER/ADMIN, que queda intacta. */}
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
                  <p className="text-[11px] text-brand-muted truncate">{effectiveRoleLabel}</p>
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
                  className="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full ring-1 ring-white/10 hover:ring-white/30 transition-colors max-w-[160px]"
                >
                  <PlayerAvatar player={{ id: null, full_name: identity.name, avatar_url: identity.avatarUrl }} size="sm" />
                  <span className="text-sm font-medium text-white truncate">{displayName}</span>
                  <ChevronDown className={cn("w-4 h-4 text-brand-muted shrink-0 transition-transform", userMenuOpen && "rotate-180")} />
                </button>
              </div>
            </div>

            {userMenuOpen && (
              <>
                {/* Click-away overlay — igual patrón que OWNER/ADMIN: por
                    encima del top bar y de la tab bar (ambos z-40/z-50),
                    muy por debajo de cualquier modal real. */}
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
                    {/* Siempre visible para PLAYER (nunca condicionado a
                        membershipCount, a diferencia de OWNER/ADMIN) y
                        siempre hacia /clubs — nunca "Salir del club", que
                        queda oculto (ver comentario junto a LeaveClubButton
                        en NavContent). */}
                    <Link
                      href="/clubs"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors"
                    >
                      <ArrowLeftRight className="w-4 h-4 shrink-0" />
                      <span>Cambiar de club</span>
                    </Link>
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

          {/* Bottom tab bar — PLAYER, mobile only. Mismo componente
              (MobileTabBarItem) y misma estructura que la tab bar
              OWNER/ADMIN, solo con los 5 items de tabBarItems (ver
              getTabBarItems) en vez de 6 — se distribuyen parejo por el
              `flex-1` que ya trae ese componente, sin cambios. */}
          <nav
            className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch bg-brand-surface border-t border-white/10"
            style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
            aria-label="Navegación principal"
          >
            {tabBarItems.map((item) => (
              <MobileTabBarItem
                key={item.id}
                item={item}
                isActive={item.href ? isNavItemActive(effectiveNavPath, item.href) : false}
                isPending={pendingHref !== null && item.href === pendingHref}
                onTap={item.href ? handleTabTap(item.href) : () => {}}
              />
            ))}
          </nav>
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
                  <p className="text-[11px] text-brand-muted truncate">{effectiveRoleLabel}</p>
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
                    {membershipCount >= 2 &&
                      (role === "OWNER" ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(e) => {
                            setUserMenuOpen(false);
                            handleOpenChangeClub(e.currentTarget);
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors w-full text-left"
                        >
                          <ArrowLeftRight className="w-4 h-4 shrink-0" />
                          <span>Cambiar de club</span>
                        </button>
                      ) : (
                        <Link
                          href="/clubs"
                          role="menuitem"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors"
                        >
                          <ArrowLeftRight className="w-4 h-4 shrink-0" />
                          <span>Cambiar de club</span>
                        </Link>
                      ))}
                    {role === "OWNER" && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          setUserMenuOpen(false);
                          handleOpenCreateClub(e.currentTarget);
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-primary/5 transition-colors w-full text-left"
                      >
                        <PlusCircle className="w-4 h-4 shrink-0" />
                        <span>Crear otro club</span>
                      </button>
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
                key={item.id}
                item={item}
                isActive={item.href ? isNavItemActive(effectiveNavPath, item.href) : false}
                isPending={pendingHref !== null && item.href === pendingHref}
                onTap={item.href ? handleTabTap(item.href) : () => {}}
              />
            ))}
          </nav>
        </>
      )}

      {/* OWNER-only — un único modal montado a la vez (activeClubModal),
          para ambos triggers (sidebar de escritorio y menú de usuario
          mobile) y para la transición interna "Cambiar de club" → "Crear
          otro club". */}
      {activeClubModal === "change" && (
        <ChangeClubModal
          currentClubId={club.id}
          currentClubSlug={club.slug}
          onClose={handleCloseClubModal}
          onCreateClub={handleCreateClubFromChangeModal}
        />
      )}
      {activeClubModal === "create" && <CreateClubModal onClose={handleCloseClubModal} />}
    </>
  );
}
