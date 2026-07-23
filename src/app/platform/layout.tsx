import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { PlatformNav } from "@/components/layout/PlatformNav";

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

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <PlatformNav />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
