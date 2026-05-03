import { NextResponse } from "next/server";
import { runConversationTurn } from "@/lib/conversation-bot";
import { loadSession, saveSession } from "@/lib/session-store";

export const runtime = "nodejs";

type Body = {
  sessionId?: string;
  message?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  const message = body.message?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (!process.env.NVIDIA_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Server missing NVIDIA_API_KEY. Add it to .env.local (see .env.example).",
      },
      { status: 503 },
    );
  }

  try {
    const session = await loadSession(sessionId);
    const {
      session: next,
      assistantText,
      profileUpdateFailed,
      userMessageAt,
      assistantMessageAt,
    } = await runConversationTurn(session, message);
    await saveSession(next);
    return NextResponse.json({
      reply: assistantText,
      profile: next.profile,
      profileFieldUpdatedAt: next.profileFieldUpdatedAt,
      userMessageAt,
      assistantMessageAt,
      profileUpdateFailed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
