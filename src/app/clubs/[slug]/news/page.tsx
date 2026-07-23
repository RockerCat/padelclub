import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PublicNewsCard, type PublicNewsCardItem } from "@/components/clubs/PublicNewsCard";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("clubs").select("name").eq("slug", slug).eq("is_active", true).single();
  if (!data) return { title: "Club no encontrado | MiPadelClub" };
  return { title: `Noticias de ${data.name} | MiPadelClub` };
}

export default async function ClubNewsListPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!club) notFound();

  const { data: news } = await supabase
    .from("club_news")
    .select("id, title, content, image_url, published_at")
    .eq("club_id", club.id)
    .order("published_at", { ascending: false });

  const newsList = (news ?? []) as PublicNewsCardItem[];

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="border-b border-white/8 bg-brand-bg/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center">
          <Link
            href={`/${club.slug}`}
            className="flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a {club.name}
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 py-10">
        <h1 className="text-2xl font-bold text-white mb-6">Noticias de {club.name}</h1>

        {newsList.length === 0 ? (
          <p className="text-sm text-brand-muted">Este club todavía no ha publicado noticias.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {newsList.map((item) => (
              <PublicNewsCard key={item.id} clubSlug={club.slug} news={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
