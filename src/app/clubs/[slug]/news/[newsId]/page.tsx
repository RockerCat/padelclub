import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatNewsDate } from "@/components/clubs/PublicNewsCard";
import { ShareNewsButtons } from "./ShareNewsButtons";

interface Props {
  params: Promise<{ slug: string; newsId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, newsId } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase.from("clubs").select("id").eq("slug", slug).eq("is_active", true).single();
  if (!club) return { title: "Noticia no encontrada | PadelClub" };

  const { data: news } = await supabase
    .from("club_news")
    .select("title, content")
    .eq("id", newsId)
    .eq("club_id", club.id)
    .single();
  if (!news) return { title: "Noticia no encontrada | PadelClub" };

  return {
    title: `${news.title} | PadelClub`,
    description: news.content.slice(0, 150),
  };
}

export default async function ClubNewsDetailPage({ params }: Props) {
  const { slug, newsId } = await params;
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
    .eq("id", newsId)
    .eq("club_id", club.id)
    .single();

  if (!news) notFound();

  const path = `/clubs/${club.slug}/news/${news.id}`;

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="border-b border-white/8 bg-brand-bg/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center">
          <Link
            href={`/clubs/${club.slug}/news`}
            className="flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Noticias de {club.name}
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-10">
        <div className="rounded-2xl overflow-hidden mb-6 bg-white/3 border border-white/8 flex items-center justify-center max-h-[80vh]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={news.image_url} alt={news.title} className="w-full max-h-[80vh] object-contain" />
        </div>

        <p className="text-xs text-brand-muted mb-2">{formatNewsDate(news.published_at)}</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">{news.title}</h1>

        <div className="text-sm text-white/80 leading-relaxed whitespace-pre-line mb-8">
          {news.content}
        </div>

        <ShareNewsButtons title={news.title} path={path} />
      </div>
    </div>
  );
}
