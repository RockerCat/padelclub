import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { PlatformNav } from "@/components/layout/PlatformNav";
import Footer from "@/components/layout/Footer";
import { getSidebarIdentity } from "@/lib/userIdentity";

interface PlatformLayoutProps {
  children: React.ReactNode;
}

export default async function PlatformLayout({ children }: PlatformLayoutProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  if (!(await isPlatformAdmin())) {
    redirect("/unauthorized");
  }

  const identity = await getSidebarIdentity(supabase, user.id, user.email ?? null);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-col md:flex-row flex-1">
        <PlatformNav identity={identity} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      <Footer />
    </div>
  );
}
