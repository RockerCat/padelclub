"use client";

import { useState, useEffect, useCallback, useId, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getRecentNotifications,
  getUnreadNotificationCount,
  hrefForNotification,
  formatRelativeNotificationTime,
  type NotificationRow,
} from "@/lib/notifications";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notificationActions";

interface NotificationBellProps {
  initialCount: number;
  initialItems: NotificationRow[];
}

// Realtime is the primary live-update path (see migration
// 20260728000001_realtime_join_requests_notifications.sql); focus/
// visibilitychange refetch and this poll are the mandatory fallback —
// never rely on Realtime alone. Only ticks while the tab is visible.
const POLL_INTERVAL_MS = 45_000;

const isDev = process.env.NODE_ENV === "development";

// Dropdown never shows more than this many rows — the full history lives
// at /notifications. getRecentNotifications fetches one extra row so
// DROPDOWN_LIMIT + 1 items back tells us whether "Ver todas" is worth
// showing, with no separate count query.
const DROPDOWN_LIMIT = 5;

// Persistent reminder cycle while unreadCount > 0 (see the effect below):
// ring for ~4-5s, then hold still for 20s, repeat. RING_ITERATION_MS
// matches the bell-ring keyframe's own tuned timing (globals.css); 4
// iterations of it is the "active phase" duration.
const RING_ITERATION_MS = 1150;
const RING_ITERATIONS = 4; // 4 * 1.15s = 4.6s — within the requested ~4-5s
const RING_ACTIVE_MS = RING_ITERATION_MS * RING_ITERATIONS;
const RING_IDLE_MS = 20_000;

// Reusable across every header that hosts it (currently /clubs' top bar and
// AppNav) — available to OWNER, ADMIN and PLAYER alike, since who can act on
// a notification is entirely decided by the RLS-scoped rows the signed-in
// user gets back, not by anything this component itself gates.
// Desktop-only (matches Tailwind's md breakpoint) — below this, the panel
// keeps its original CSS-anchored behavior untouched.
const DESKTOP_BREAKPOINT_PX = 768;

// Desktop panel geometry: opens to the RIGHT of the bell (the bell sits
// near the sidebar's own right edge, close to the viewport's left side —
// anchoring by `right` there forces the panel to grow further left,
// off-screen). GAP is the gutter between the bell/sidebar and the panel;
// VIEWPORT_MARGIN keeps the panel from touching the opposite edges.
const PANEL_GAP = 12;
const VIEWPORT_MARGIN = 16;
const PANEL_WIDTH = 380;
const PANEL_MAX_HEIGHT_RATIO = 0.7; // matches max-h-[70vh]

export function NotificationBell({ initialCount, initialItems }: NotificationBellProps) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [items, setItems] = useState(initialItems);
  const [, startMarking] = useTransition();
  // Set only on desktop, from the button's real on-screen position. The
  // bell lives inside the sidebar, near the LEFT of the viewport — so the
  // panel opens to its right (left = rect.right + gap), never anchored by
  // `right`, which would force it to grow further left and off-screen.
  // Mobile (below DESKTOP_BREAKPOINT_PX) never sets this and keeps the
  // original absolute/right-0 CSS behavior, since its bell already sits
  // near the viewport's true right edge inside a full-width bar.
  const [desktopPanelPos, setDesktopPanelPos] = useState<{ left: number; top: number } | null>(null);
  // The desktop panel is portaled to document.body (see below) to escape
  // the sidebar's stacking context entirely — but that also escapes
  // ClubThemeProvider's DOM scope, which is what makes text-brand-primary
  // resolve to this specific club's color instead of the platform default.
  // Re-declaring the two custom properties on the portal's own root
  // (read from the button, which is still inside that scope) keeps the
  // "Marcar todas como leídas" link and unread dot in the club's color.
  const [desktopThemeVars, setDesktopThemeVars] = useState<{ primary: string; secondary: string } | null>(null);
  // Drives the bell-ring keyframe (see globals.css) while there's unread
  // mail — the cycle effect below is the only thing that ever flips this.
  const [ringing, setRinging] = useState(false);
  // Read once per mount and kept live via a matchMedia listener (effect
  // below) so a setting change while the app is open takes effect
  // immediately, not just on next reload.
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  // NotificationBell mounts more than once at the same time (desktop
  // sidebar + mobile top bar + mobile drawer all render simultaneously,
  // CSS just hides the inactive ones) — a topic keyed only on user id would
  // let a second instance's supabase.channel() call return the first
  // instance's already-joined channel (RealtimeClient reuses channels by
  // topic string), and calling .on() on that reused, already-subscribed
  // channel is exactly what throws "cannot add postgres_changes callbacks
  // ... after subscribe()". useId() keeps each mounted instance on its own
  // topic so that reuse path is never hit.
  const instanceId = useId();

  // Live-updates reducedMotion if the OS-level setting changes while the
  // tab is open — the cycle effect below reacts to it immediately.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const hasUnread = count > 0;

  // Persistent reminder: while hasUnread stays true, this single effect
  // instance keeps looping ring→idle→ring without ever being re-run (its
  // only deps are the two booleans that gate whether it should run at
  // all) — a fluctuating exact count (new arrival, one marked read) never
  // restarts it, so there is only ever one cycle in flight. It starts
  // immediately on the false→true transition (no initial 20s wait), and
  // its cleanup (dependency change or unmount) clears every pending timer
  // and turns the ring off, satisfying both "detener inmediatamente" and
  // "no continuar después de desmontar/reduced-motion".
  useEffect(() => {
    // Nothing to start — `ringing` is already false here, either from its
    // initial value or from the previous run's own cleanup below (which
    // always fires before this body runs again on a dependency change).
    if (!hasUnread || reducedMotion) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function ringThenWait() {
      if (cancelled) return;
      setRinging(true);
      timer = setTimeout(() => {
        if (cancelled) return;
        setRinging(false);
        timer = setTimeout(ringThenWait, RING_IDLE_MS);
      }, RING_ACTIVE_MS);
    }

    ringThenWait();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setRinging(false);
    };
  }, [hasUnread, reducedMotion]);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const [nextCount, nextItems] = await Promise.all([
      getUnreadNotificationCount(supabase),
      getRecentNotifications(supabase),
    ]);
    setCount(nextCount);
    setItems(nextItems);
  }, []);

  useEffect(() => {
    function refetchIfVisible() {
      if (document.visibilityState === "visible") refetch();
    }
    window.addEventListener("focus", refetchIfVisible);
    document.addEventListener("visibilitychange", refetchIfVisible);
    const interval = setInterval(refetchIfVisible, POLL_INTERVAL_MS);
    return () => {
      window.removeEventListener("focus", refetchIfVisible);
      document.removeEventListener("visibilitychange", refetchIfVisible);
      clearInterval(interval);
    };
  }, [refetch]);

  // Realtime: new/updated own notifications (e.g. a join request just got
  // approved/rejected, or an admin's request list grew) refetch immediately
  // instead of waiting for the next focus/poll. RLS (notifications_select_own)
  // is still the real boundary — this filter is only relevance, not security.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // getUser() is async — if this effect's cleanup already ran (unmount,
    // or a dependency change tore this invocation down) by the time it
    // resolves, skip creating/subscribing a channel nobody will ever clean
    // up, and never call .on()/.subscribe() nor touch state for a stale run.
    let cancelled = false;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      // Build the full .on().on().subscribe() chain in one expression —
      // .subscribe() must be last, after every listener is registered.
      channel = supabase
        .channel(`notifications:${user.id}:${instanceId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `profile_id=eq.${user.id}`,
          },
          (payload) => {
            if (isDev) console.debug("[NotificationBell] INSERT", payload);
            refetch();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `profile_id=eq.${user.id}`,
          },
          (payload) => {
            if (isDev) console.debug("[NotificationBell] UPDATE", payload);
            refetch();
          }
        )
        .subscribe((status, err) => {
          if (isDev) console.debug("[NotificationBell] channel status:", status, err ?? "");
        });
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [refetch, instanceId]);

  function measureDesktopPanelPos() {
    if (window.innerWidth < DESKTOP_BREAKPOINT_PX) {
      setDesktopPanelPos(null);
      setDesktopThemeVars(null);
      return;
    }
    const button = buttonRef.current;
    const rect = button?.getBoundingClientRect();
    if (!button || !rect) return;

    // Opens to the right of the bell — never computed from `right`, which
    // would grow it back toward the (already near) left edge.
    let left = rect.right + PANEL_GAP;
    if (left + PANEL_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      // Only pulled back if it truly doesn't fit to the right — still a
      // leftward *clamp*, never a rightward-growth anchor.
      left = Math.max(VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - PANEL_WIDTH);
    }

    let top = rect.top;
    const estimatedPanelHeight = window.innerHeight * PANEL_MAX_HEIGHT_RATIO;
    if (top + estimatedPanelHeight > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - estimatedPanelHeight);
    }

    setDesktopPanelPos({ left, top });

    const computed = getComputedStyle(button);
    setDesktopThemeVars({
      primary: computed.getPropertyValue("--color-brand-primary").trim(),
      secondary: computed.getPropertyValue("--color-brand-secondary").trim(),
    });
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      refetch();
      measureDesktopPanelPos();
    }
  }

  // Keep the panel correctly anchored if the window is resized while open
  // (e.g. rotating a tablet, resizing a desktop browser).
  useEffect(() => {
    if (!open) return;
    function onResize() {
      measureDesktopPanelPos();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  function handleItemClick(n: NotificationRow) {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
      setCount((c) => Math.max(0, c - 1));
      startMarking(async () => {
        await markNotificationRead(n.id);
      });
    }
    const href = hrefForNotification(n);
    if (href) router.push(href);
  }

  function handleViewAll() {
    setOpen(false);
    router.push("/notifications");
  }

  function handleMarkAllRead() {
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
    setCount(0);
    startMarking(async () => {
      await markAllNotificationsRead();
    });
  }

  // Dropdown caps at DROPDOWN_LIMIT rows — getRecentNotifications fetches
  // one extra so visibleItems.length < items.length tells us there's more
  // without a separate count query.
  const visibleItems = items.slice(0, DROPDOWN_LIMIT);
  const hasMore = items.length > DROPDOWN_LIMIT;

  // Shared between the mobile (inline, absolute) and desktop (portaled,
  // fixed) shells — only the wrapper differs, never the content, so there
  // is exactly one place that renders a notification row.
  const panelChildren = (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <p className="text-sm font-semibold text-white">Notificaciones</p>
        {count > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs text-brand-primary hover:underline"
          >
            Marcar todas como leídas
          </button>
        )}
      </div>

      {visibleItems.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-brand-muted">Sin notificaciones todavía.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/5">
          {visibleItems.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => handleItemClick(n)}
                className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors ${!n.read_at ? "bg-brand-primary/5" : ""}`}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-primary mt-1.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{n.title}</p>
                    <p className="text-xs text-brand-muted mt-0.5">{n.message}</p>
                    <p className="text-[11px] text-brand-muted/60 mt-1">{formatRelativeNotificationTime(n.created_at)}</p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={handleViewAll}
          className="w-full text-center px-4 py-3 text-xs font-medium text-brand-primary hover:underline border-t border-white/10"
        >
          Ver todas las notificaciones
        </button>
      )}
    </>
  );

  // Solid, fully opaque background (bg-[#082735] is a plain hex — no /NN
  // alpha suffix, no backdrop-blur) on both shells; only the positioning
  // wrapper (and, on desktop, a slightly reinforced border) differs.
  const PANEL_SURFACE_CLASSES = "bg-[#082735] rounded-2xl shadow-2xl max-h-[70vh] overflow-y-auto";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label="Notificaciones"
        className="relative p-2 rounded-xl text-brand-muted hover:text-white hover:bg-white/5 transition-colors"
      >
        <Bell
          className="w-5 h-5"
          style={ringing ? { animation: `bell-ring ${RING_ITERATION_MS}ms ease-in-out ${RING_ITERATIONS}` } : undefined}
        />
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (desktopPanelPos ? (
        // Desktop: portaled to document.body — the sidebar (and everything
        // between it and <body>) never gets a chance to clip, dim or
        // out-stack the panel via its own transform/opacity/stacking
        // context, no matter what causes it. A very high z-index on both
        // layers keeps them above anything else in the app, including
        // avatars/cards that might otherwise sit in a higher local context.
        createPortal(
          <>
            <div className="fixed inset-0 z-[999]" onClick={() => setOpen(false)} />
            <div
              className={`fixed w-[380px] max-w-[calc(100vw-2rem)] z-[1000] border border-white/15 ${PANEL_SURFACE_CLASSES}`}
              style={{
                top: desktopPanelPos.top,
                left: desktopPanelPos.left,
                ...(desktopThemeVars
                  ? {
                      "--color-brand-primary": desktopThemeVars.primary,
                      "--color-brand-secondary": desktopThemeVars.secondary,
                    }
                  : {}),
              } as React.CSSProperties}
            >
              {panelChildren}
            </div>
          </>,
          document.body
        )
      ) : (
        // Mobile: unchanged from before this story — inline, absolute,
        // anchored to the bell's own right edge inside a full-width bar.
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] z-50 border border-white/10 ${PANEL_SURFACE_CLASSES}`}>
            {panelChildren}
          </div>
        </>
      ))}
    </div>
  );
}
