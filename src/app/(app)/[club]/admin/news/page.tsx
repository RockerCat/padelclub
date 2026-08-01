import { redirect } from "next/navigation";
import { clubHubPath } from "@/lib/clubHubPaths";

interface NewsPageProps {
  params: Promise<{ club: string }>;
}

// Noticias administrativas se movieron al hub "Club" (vista "Noticias") —
// ver CLAUDE.md, bloque de reorganización #2. Session/club/membership/rol se
// revalidan en el propio hub. El detalle público de una noticia
// (/clubs/[slug]/news/[newsSlug]) no se toca.
export default async function NewsPage({ params }: NewsPageProps) {
  const { club: slug } = await params;
  redirect(clubHubPath(slug, "noticias"));
}
