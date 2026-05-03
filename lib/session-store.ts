import fs from "fs/promises";
import path from "path";
import { emptyProfile, normalizeStoredProfile, type UserProfile } from "@/lib/profile";
import type { ProfileFieldUpdatedAt } from "@/lib/profile-field-timestamps";

/** Persisted chat turn; `createdAt` is when the message was stored (user send / assistant reply). */
export type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type SessionData = {
  id: string;
  messages: StoredChatMessage[];
  profile: UserProfile;
  /** ISO time per profile key when that field last changed (questionnaire or extractor). */
  profileFieldUpdatedAt: ProfileFieldUpdatedAt;
  /** Free-text notes from a questionnaire; included in the model system context. */
  questionnaireContext: string | null;
  updatedAt: string;
};

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

function sessionPath(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe || safe !== id) {
    throw new Error("Invalid session id");
  }
  return path.join(SESSIONS_DIR, `${safe}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

function normalizeStoredMessages(
  raw: unknown,
  fallbackIso: string,
): StoredChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const role = o.role;
    const content = o.content;
    const createdAt =
      typeof o.createdAt === "string" && o.createdAt.length > 0
        ? o.createdAt
        : fallbackIso;
    if (
      (role === "user" || role === "assistant") &&
      typeof content === "string"
    ) {
      out.push({ role, content, createdAt });
    }
  }
  return out;
}

function normalizeProfileFieldUpdatedAt(
  raw: unknown,
): ProfileFieldUpdatedAt {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: ProfileFieldUpdatedAt = {};
  for (const k of [
    "user_location",
    "hobbies",
    "international_news_focus",
    "ethnicity",
    "age",
    "native_language",
    "occupation",
    "news_topics",
    "avoid_topics",
    "etc",
  ] as const) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

export async function loadSession(id: string): Promise<SessionData> {
  await ensureDir();
  try {
    const raw = await fs.readFile(sessionPath(id), "utf8");
    const parsed = JSON.parse(raw) as SessionData & {
      questionnaireContext?: string | null;
      profileFieldUpdatedAt?: unknown;
    };
    if (!parsed.messages || !Array.isArray(parsed.messages)) {
      throw new Error("bad messages");
    }
    const fallbackIso = parsed.updatedAt ?? new Date().toISOString();
    return {
      id: parsed.id,
      messages: normalizeStoredMessages(parsed.messages, fallbackIso),
      profile: normalizeStoredProfile(parsed.profile),
      profileFieldUpdatedAt: normalizeProfileFieldUpdatedAt(
        parsed.profileFieldUpdatedAt,
      ),
      questionnaireContext:
        typeof parsed.questionnaireContext === "string"
          ? parsed.questionnaireContext
          : null,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return {
      id,
      messages: [],
      profile: emptyProfile(),
      profileFieldUpdatedAt: {},
      questionnaireContext: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function saveSession(data: SessionData): Promise<void> {
  await ensureDir();
  const next: SessionData = {
    ...data,
    questionnaireContext: data.questionnaireContext ?? null,
    profileFieldUpdatedAt: data.profileFieldUpdatedAt ?? {},
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    sessionPath(data.id),
    JSON.stringify(next, null, 2),
    "utf8",
  );
}

/** Strip to plain {role, content} for OpenAI chat completions. */
export function toOpenAIMessages(
  messages: StoredChatMessage[],
): { role: "user" | "assistant"; content: string }[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}
