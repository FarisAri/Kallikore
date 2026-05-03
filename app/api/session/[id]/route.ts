import { NextResponse } from "next/server";
import { loadSession } from "@/lib/session-store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    const session = await loadSession(id);
    return NextResponse.json({
      sessionId: session.id,
      messages: session.messages,
      profile: session.profile,
      profileFieldUpdatedAt: session.profileFieldUpdatedAt,
      questionnaireContext: session.questionnaireContext,
      updatedAt: session.updatedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
