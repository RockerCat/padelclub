"use server";

import { createClient } from "@/lib/supabase/server";

export async function updateLastClub(clubId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("profiles")
    .update({ last_club_id: clubId })
    .eq("id", user.id);
}
