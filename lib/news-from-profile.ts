import type { UserProfile } from "@/lib/profile";

export type NewsArticle = {
  title: string;
  description: string | null;
  url: string;
  source: string | null;
  publishedAt: string | null;
};

/** Build a short search query from profile fields for a news API. */
export function buildNewsQueryFromProfile(profile: UserProfile): string {
  const parts: string[] = [];
  if (profile.user_location) parts.push(profile.user_location);
  for (const h of profile.hobbies.slice(0, 8)) {
    if (h.trim()) parts.push(h.trim());
  }
  for (const c of profile.international_news_focus.slice(0, 8)) {
    if (c.trim()) parts.push(`${c.trim()} news`);
  }
  if (profile.occupation?.trim()) {
    parts.push(profile.occupation.trim());
  }
  for (const t of profile.news_topics.slice(0, 8)) {
    if (t.trim()) parts.push(t.trim());
  }
  const q = parts.join(" OR ").slice(0, 380);
  return q.trim() || "world news";
}

export function mockArticlesForProfile(
  profile: UserProfile,
  query: string,
): NewsArticle[] {
  const loc = profile.user_location ?? "your area";
  const abroad =
    profile.international_news_focus.length > 0
      ? profile.international_news_focus.slice(0, 3).join(", ")
      : "other regions";
  const hobby = profile.hobbies[0] ?? "topics you care about";
  return [
    {
      title: `[Demo] Headlines matching: ${query.slice(0, 80)}${query.length > 80 ? "…" : ""}`,
      description: `No NEWS_API_KEY configured — sample result. Would blend ${loc}, ${hobby}, and coverage for ${abroad}.`,
      url: "https://example.com",
      source: "mock",
      publishedAt: new Date().toISOString(),
    },
    {
      title: `[Demo] International angle: ${abroad}`,
      description:
        "Add NEWS_API_KEY (NewsAPI.org) in .env.local to fetch live articles.",
      url: "https://example.com",
      source: "mock",
      publishedAt: new Date().toISOString(),
    },
  ];
}

type NewsApiArticle = {
  title?: string;
  description?: string | null;
  url?: string;
  source?: { name?: string };
  publishedAt?: string;
};

type NewsApiResponse = {
  status: string;
  articles?: NewsApiArticle[];
  message?: string;
};

export async function fetchNewsArticles(
  apiKey: string,
  profile: UserProfile,
): Promise<{ articles: NewsArticle[]; query: string; source: "newsapi" }> {
  const query = buildNewsQueryFromProfile(profile);
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", query);
  url.searchParams.set("language", "en");
  url.searchParams.set("pageSize", "15");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("apiKey", apiKey);

  const res = await fetch(url.toString());
  const data = (await res.json()) as NewsApiResponse;
  if (!res.ok || data.status === "error") {
    throw new Error(data.message ?? `News API error (${res.status})`);
  }
  const raw = data.articles ?? [];
  const articles: NewsArticle[] = raw.map((a) => ({
    title: a.title ?? "Untitled",
    description: a.description ?? null,
    url: a.url ?? "#",
    source: a.source?.name ?? null,
    publishedAt: a.publishedAt ?? null,
  }));
  return { articles, query, source: "newsapi" };
}
