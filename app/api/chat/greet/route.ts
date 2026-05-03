import { NextResponse } from "next/server";
import { loadSession, saveSession } from "@/lib/session-store";
import { getChatModel, getThrottledOpenAIClient } from "@/lib/openai-client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { sessionId?: string; clear?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const session = await loadSession(sessionId);
    
    const clear = body.clear === true;

    // If the session already has messages and we are NOT clearing, we don't need a greeting
    if (!clear && session.messages && session.messages.length > 0) {
      return NextResponse.json({ reply: null });
    }

    const model = getChatModel();
    const client = await getThrottledOpenAIClient();
    
    const profileJson = JSON.stringify(session.profile);
    
    const res = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are a friendly news assistant. You are greeting a user based on their profile. Keep it very short (1-2 sentences). Ask them what they want to read today, or if they want to adjust their profile. Here is their profile:\n${profileJson}`,
        }
      ],
      max_tokens: 100,
      temperature: 0.6,
    });
    
    const assistantText = res.choices[0]?.message?.content?.trim();
    if (!assistantText) throw new Error("Empty greeting completion");

    // Add greeting to messages
    const assistantMessageAt = new Date().toISOString();
    const nextSession = {
      ...session,
      messages: [
        {
          role: "assistant" as const,
          content: assistantText,
          createdAt: assistantMessageAt,
        }
      ]
    };
    await saveSession(nextSession);

    return NextResponse.json({ reply: assistantText });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
