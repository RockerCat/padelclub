"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getNotificationsPaginated,
  hrefForNotification,
  formatRelativeNotificationTime,
  type NotificationRow,
} from "@/lib/notifications";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notificationActions";
import { JoinRequestNotificationActions } from "@/components/layout/JoinRequestNotificationActions";

interface NotificationsListClientProps {
  initialItems: NotificationRow[];
  initialHasMore: boolean;
  pageSize: number;
}

// Same read/write path as NotificationBell (getNotificationsPaginated,
// markNotificationRead, markAllNotificationsRead from @/lib/notifications
// and @/lib/notificationActions) — one source of truth, so a bell mounted
// elsewhere picks up a read-here change through its own existing Realtime
// UPDATE subscription instead of this page needing any parallel state.
export function NotificationsListClient({ initialItems, initialHasMore, pageSize }: NotificationsListClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [, startMarking] = useTransition();

  const unreadCount = items.filter((n) => !n.read_at).length;

  async function handleLoadMore() {
    setLoadingMore(true);
    const supabase = createClient();
    const { items: nextItems, hasMore: nextHasMore } = await getNotificationsPaginated(supabase, {
      limit: pageSize,
      offset: items.length,
    });
    setItems((prev) => [...prev, ...nextItems]);
    setHasMore(nextHasMore);
    setLoadingMore(false);
  }

  function handleMarkAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    startMarking(async () => {
      await markAllNotificationsRead();
    });
  }

  function markRead(n: NotificationRow) {
    if (n.read_at) return;
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
    startMarking(async () => {
      await markNotificationRead(n.id);
    });
  }

  function handleItemClick(n: NotificationRow) {
    markRead(n);
    const href = hrefForNotification(n);
    if (href) router.push(href);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end min-h-[1.25rem]">
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-sm text-brand-primary hover:underline"
          >
            Marcar todas como leídas
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-brand-surface px-6 py-14 flex flex-col items-center text-center">
          <p className="text-sm text-brand-muted">No tienes notificaciones todavía.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleItemClick(n)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleItemClick(n);
                  }
                }}
                className={`w-full text-left px-4 sm:px-5 py-4 rounded-2xl border border-white/10 bg-brand-surface hover:border-white/20 transition-colors cursor-pointer ${!n.read_at ? "bg-brand-primary/5 border-brand-primary/20" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${!n.read_at ? "bg-brand-primary" : "bg-transparent"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white break-words">{n.title}</p>
                      </div>
                      <p className="text-xs text-brand-muted/60 shrink-0 whitespace-nowrap">
                        {formatRelativeNotificationTime(n.created_at)}
                      </p>
                    </div>
                    <p className="text-sm text-brand-muted mt-1 break-words">{n.message}</p>
                    {n.clubs && (
                      <p className="text-xs text-brand-muted/60 mt-1.5">{n.clubs.name}</p>
                    )}
                    {n.type === "join_request_created" && (
                      <div className="mt-2.5">
                        <JoinRequestNotificationActions notification={n} onResolved={() => markRead(n)} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-2 w-full py-3 rounded-xl border border-white/10 text-sm font-medium text-brand-muted hover:text-white hover:border-white/20 hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          {loadingMore ? "Cargando…" : "Cargar más"}
        </button>
      )}
    </div>
  );
}
