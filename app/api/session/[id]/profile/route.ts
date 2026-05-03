import { NextResponse } from "next/server";
import { profileFieldsChanged, mergeProfileFieldUpdatedAt } from "@/lib/profile-field-timestamps";
import { coerceProfile } from "@/lib/profile";
import { loadSession, saveSession } from "@/lib/session-store";

export const runtime = "nodejs";

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const nextProfile = coerceProfile((body as { profile?: unknown }).profile);
  if (!nextProfile) {
    return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
  }

  try {
    const session = await loadSession(id);
    const now = new Date().toISOString();
    const changed = profileFieldsChanged(session.profile, nextProfile);
    const profileFieldUpdatedAt = mergeProfileFieldUpdatedAt(
      session.profileFieldUpdatedAt ?? {},
      changed,
      now,
    );
    const nextSession = {
      ...session,
      profile: nextProfile,
      profileFieldUpdatedAt,
      updatedAt: now,
    };
    await saveSession(nextSession);
    return NextResponse.json({
      sessionId: nextSession.id,
      profile: nextProfile,
      profileFieldUpdatedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
