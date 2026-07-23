import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getNotificationsPaginated } from "@/lib/notifications";
import { NotificationsListClient } from "./NotificationsListClient";

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

  const { items, hasMore } = await getNotificationsPaginated(supabase, { limit: PAGE_SIZE, offset: 0 });

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-5 py-8 sm:py-10">
        <h1 className="text-2xl font-bold text-white mb-6">Notificaciones</h1>

        <NotificationsListClient
          initialItems={items}
          initialHasMore={hasMore}
          pageSize={PAGE_SIZE}
        />
      </div>
    </div>
  );
}
