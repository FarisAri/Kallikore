import { NextResponse } from "next/server";
import {
  buildNewsQueryFromProfile,
  fetchNewsArticles,
  mockArticlesForProfile,
} from "@/lib/news-from-profile";
import { loadSession } from "@/lib/session-store";

export const runtime = "nodejs";

type Body = { sessionId?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const session = await loadSession(sessionId);
    const query = buildNewsQueryFromProfile(session.profile);
    const apiKey = process.env.NEWS_API_KEY?.trim();

    if (!apiKey) {
      const articles = mockArticlesForProfile(session.profile, query);
      return NextResponse.json({
        mode: "mock",
        message:
          "NEWS_API_KEY is not set. Showing placeholder results. Add a NewsAPI.org key to .env.local to fetch live articles.",
        query,
        articles,
      });
    }

    const { articles, source } = await fetchNewsArticles(apiKey, session.profile);
    return NextResponse.json({
      mode: "live",
      source,
      query,
      articles,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
