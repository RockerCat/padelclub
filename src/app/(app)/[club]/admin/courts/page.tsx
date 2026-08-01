import { redirect } from "next/navigation";

interface CourtsPageProps {
  params: Promise<{ club: string }>;
}

// Canchas (the list/index) was folded into the Dashboard as its "Canchas"
// view — see CLAUDE.md dashboard reorganization block. This route only
// redirects now; session/club/membership/role are all re-validated by the
// destination itself (/[club]/dashboard), so no auth logic is duplicated
// here. Court sub-routes ([id], new) are unaffected and keep working as-is.
export default async function CourtsPage({ params }: CourtsPageProps) {
  const { club: slug } = await params;
  redirect(`/${slug}/dashboard?tab=canchas`);
}
