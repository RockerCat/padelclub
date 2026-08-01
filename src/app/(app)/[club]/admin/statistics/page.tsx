import { redirect } from "next/navigation";

interface StatisticsPageProps {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ period?: string }>;
}

// Estadísticas was folded into the Dashboard as its "Rendimiento" view — see
// CLAUDE.md dashboard reorganization block. This route only redirects now;
// session/club/membership/role are all re-validated by the destination
// itself (/[club]/dashboard), so no auth logic is duplicated here.
export default async function StatisticsPage({ params, searchParams }: StatisticsPageProps) {
  const { club: slug } = await params;
  const { period } = await searchParams;

  const query = period ? `?tab=rendimiento&period=${encodeURIComponent(period)}` : "?tab=rendimiento";
  redirect(`/${slug}/dashboard${query}`);
}
