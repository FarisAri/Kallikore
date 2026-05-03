import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { initialProfileFieldTimestamps } from "@/lib/profile-field-timestamps";
import { seedProfileFromQuestionnaire } from "@/lib/profile";
import { saveSession, type SessionData } from "@/lib/session-store";

export const runtime = "nodejs";

type CreateBody = {
  initialProfile?: unknown;
  questionnaireNotes?: string;
};

export async function POST(req: Request) {
  let body: CreateBody = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = randomUUID();
  const profile = seedProfileFromQuestionnaire(body.initialProfile);
  const questionnaireContext =
    typeof body.questionnaireNotes === "string"
      ? body.questionnaireNotes.trim() || null
      : null;

  const now = new Date().toISOString();
  const profileFieldUpdatedAt = initialProfileFieldTimestamps(profile, now);

  const session: SessionData = {
    id,
    messages: [],
    profile,
    profileFieldUpdatedAt,
    questionnaireContext,
    updatedAt: now,
  };
  await saveSession(session);
  return NextResponse.json({
    sessionId: id,
    profile,
    profileFieldUpdatedAt,
  });
}
