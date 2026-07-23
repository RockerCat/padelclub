import { permanentRedirect } from "next/navigation";

interface Props { params: Promise<{ slug: string }> }

// Old public club URL. The real page now lives at the shorter /[slug] —
// kept here only as a permanent redirect so old shared links/bookmarks
// keep working. Nested routes (/clubs/[slug]/news, .../news/[newsId])
// are untouched — this story only moves the base club page.
export default async function LegacyClubSlugRedirect({ params }: Props) {
  const { slug } = await params;
  permanentRedirect(`/${slug}`);
}
