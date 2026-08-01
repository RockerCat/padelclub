import Link from "next/link";
import { CalendarDays, UserPlus, ClipboardList, Swords, Megaphone, type LucideIcon } from "lucide-react";
import type { ActivityItem, ActivityType } from "./activity";

// Plain Server Component — the feed is read-only, no client interactivity
// needed. Absolute dates only (never "hace 2 días"), per Vista 3 spec.

const MONTH_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatAbsolute(d: Date): string {
  const day = d.getDate();
  const month = MONTH_ES[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

const TYPE_ICON: Record<ActivityType, LucideIcon> = {
  reservation: CalendarDays,
  join_request: ClipboardList,
  player: UserPlus,
  tournament: Swords,
  news: Megaphone,
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-brand-muted py-3">
        Todavía no hay actividad reciente para mostrar.
      </p>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-white/[0.04]">
      {items.map((item) => {
        const Icon = TYPE_ICON[item.type];
        const content = (
          <div className="flex items-start gap-3 px-1 py-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "color-mix(in srgb, var(--club-primary) 15%, transparent)", color: "var(--club-primary)" }}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white truncate">{item.title}</p>
                <span className="text-[11px] text-brand-muted shrink-0">{formatAbsolute(item.date)}</span>
              </div>
              <p className="text-sm text-brand-muted mt-0.5 truncate">{item.description}</p>
            </div>
          </div>
        );

        return item.href ? (
          <Link
            key={item.id}
            href={item.href}
            className="rounded-xl hover:bg-white/[0.03] transition-colors -mx-1"
          >
            {content}
          </Link>
        ) : (
          <div key={item.id}>{content}</div>
        );
      })}
    </div>
  );
}
