import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getNotificationsPaginated } from "@/lib/notifications";
import { resolveClubEntryPath } from "@/lib/utils/navigation";
import { NotificationsListClient } from "./NotificationsListClient";
import { NotificationsBackButton } from "./NotificationsBackButton";

export const metadata: Metadata = {
  title: "Notificaciones | MiPadelClub",
};

// Page size for "Cargar más" — a user-level page (not club-scoped, since a
// user may belong to several clubs), so it lives at the top level rather
// than under (app)/[club]. Deliberately not an unbounded history load.
const PAGE_SIZE = 20;

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login?next=/notifications");

  const [{ items, hasMore }, fallbackHref] = await Promise.all([
    getNotificationsPaginated(supabase, { limit: PAGE_SIZE, offset: 0 }),
    resolveClubEntryPath(supabase, user.id),
  ]);

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-5 py-8 sm:py-10">
        <div className="flex items-center gap-2 mb-6">
          <NotificationsBackButton fallbackHref={fallbackHref} />
          <h1 className="text-2xl font-bold text-white">Notificaciones</h1>
        </div>

        <NotificationsListClient
          initialItems={items}
          initialHasMore={hasMore}
          pageSize={PAGE_SIZE}
        />
      </div>
    </div>
  );
}
