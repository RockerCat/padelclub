import { redirect } from "next/navigation";

interface AdminPageProps {
  params: Promise<{ club: string }>;
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { club: slug } = await params;
  redirect(`/${slug}/admin/settings`);
}
