import type OpenAI from "openai";
import {
  mergeProfileFieldUpdatedAt,
  profileFieldsChanged,
} from "@/lib/profile-field-timestamps";
import { coerceProfile, emptyProfile, mergeProfiles, type UserProfile } from "@/lib/profile";
import { getChatModel, getThrottledOpenAIClient } from "@/lib/openai-client";
import type { SessionData, StoredChatMessage } from "@/lib/session-store";
import { toOpenAIMessages } from "@/lib/session-store";

const CHAT_SYSTEM = `You are a skilled interviewer for a personalized news app. You already have (or will receive) a structured profile snapshot—often partly filled from a questionnaire—plus the live chat.

**Brevity (required for now):** Every reply must be **very short**: at most **2 sentences** and **under 45 words** total. At most **one** question. No bullet lists, no long preamble, no recap of their whole profile—warm but minimal.

Your goals:
- Recommend-relevant understanding: what they read, why, and how deep they like to go.
- **International coverage:** learn which **other countries or regions** they want news from—not only their home location. Ask which nations matter to them (work, family, politics, sport, travel) and what angle (local politics vs culture vs business) if helpful.
- Preferred **native_language** for reading news.
- **Occupation** or day-to-day context only if it helps news relevance (do not push).
- **news_topics** (themes they follow—e.g. tech policy, local housing)—and **hobbies** for breadth.
- **avoid_topics:** if the user says they do not want certain themes (e.g. celebrity gossip, violence), capture those as short tags—**only** from what they say; never invent sensitivities.
- Optional life context (approximate age or life stage) **only if natural**.

Depth and pacing (order matters):
- **Basics first:** Use the profile snapshot to judge what is still missing for a usable news profile. Before you go deep on any one topic, make sure the **core basics** are at least lightly covered: where they are / what geography they care about, what they generally like to read about (including **news_topics** if empty), **other countries or regions** they want international news from, preferred **reading language**, and lightly **occupation** only if useful. If the snapshot shows gaps in those basics, prioritize **one** clear question (or brief prompt) to fill the most important gap—**do not** dive into niche depth on a hobby or a single country until those foundations are reasonably addressed (unless the user explicitly steers you to depth first).
- **Then go deeper:** Once basics are in good shape, **one** short, concrete follow-up only—still within the word limit above.
- When information is thin overall, stay focused on fundamentals; when basics are solid, **narrow in** on one thread (e.g. a single hobby or one foreign country) per turn.
- Usually **one** main follow-up per turn; occasionally **two** if they are tightly related and both serve the same goal (e.g. closing two small basic gaps).

Sensitivity:
- **Never** pressure the user for sensitive data (financial details, passwords, government IDs, medical records, exact street address, etc.).
- Optional personal dimensions (e.g. ethnicity) are **only** if the user brings them up or clearly opts in—**never** insist, never imply they must answer.
- If they decline or sidestep a topic, acknowledge and move on.

Style:
- Do not output JSON or machine-readable blocks—only natural language for the user.`;

const PROFILE_SYSTEM = `You maintain a structured user profile for a news recommendation system.

You will be given:
1) The current profile as JSON (possibly pre-filled from a questionnaire).
2) A transcript of the recent conversation (user and assistant).

Update the profile with any NEW or CORRECTED facts implied by the transcript. Do not invent facts not supported by the conversation.

Output requirements:
- Respond with a single JSON object only. No markdown fences, no commentary.
- Schema (all keys required). Put **only** miscellaneous facts in "etc"—do **not** put occupation, news_topics, or avoid_topics inside "etc"; they must be top-level keys.
  {
    "user_location": string | null,
    "hobbies": string[],
    "international_news_focus": string[],
    "ethnicity": string | null,
    "age": number | null,
    "native_language": string | null,
    "occupation": string | null,
    "news_topics": string[],
    "avoid_topics": string[],
    "etc": object
  }
- "international_news_focus" is an array of country or region names (or short phrases like "EU policy", "West Africa") the user wants news **beyond** their primary location.
- "news_topics" are theme tags for search (e.g. "AI", "climate", "local politics"), distinct from hobbies when possible.
- "avoid_topics" are short tags for themes to down-rank or filter out (user-stated only).
- Use null for unknown scalar fields. Use [] for empty arrays.
- "etc" is only for **other** small facts (e.g. {"sports_teams":["Blazers"]})—never duplicate occupation, news_topics, or avoid_topics there.
- Merge: preserve prior correct values unless the conversation clearly changes them.`;

function buildChatSystemContent(session: SessionData): string {
  const snapshot = JSON.stringify(session.profile ?? emptyProfile());
  const qn = session.questionnaireContext?.trim();
  let out = `${CHAT_SYSTEM}

---
Structured profile so far (questionnaire + chat; do not read this aloud as a checklist—use it to go deeper, skip redundant basics, and respect what is already known):
${snapshot}
---`;
  if (qn) {
    out += `

Questionnaire / intake notes (context for you only; do not tell the user you are "reading a form" unless they mentioned it):
${qn}`;
  }
  return out;
}

function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return t.trim();
}

function parseProfileFromModel(text: string): UserProfile | null {
  const cleaned = stripJsonFences(text);
  try {
    const raw = JSON.parse(cleaned) as unknown;
    return coerceProfile(raw);
  } catch {
    return null;
  }
}

function formatTranscript(
  messages: StoredChatMessage[],
  maxMessages: number,
): string {
  const tail = messages.slice(-maxMessages);
  const lines: string[] = [];
  for (const m of tail) {
    const role = m.role === "user" ? "User" : "Assistant";
    const ts = m.createdAt ? `[${m.createdAt}] ` : "";
    lines.push(`${ts}${role}: ${m.content}`);
  }
  return lines.join("\n\n");
}

async function completeChat(
  model: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  maxTokens: number,
): Promise<string> {
  const client = await getThrottledOpenAIClient();
  const res = await client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.55,
  });
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error("Empty completion from chat model");
  return text;
}

/** User-visible chat: keep completion budget tight so replies stay short. */
const CHAT_MAX_TOKENS = 180;
/** Profile JSON extraction can be longer. */
const PROFILE_EXTRACT_MAX_TOKENS = 1400;

/**
 * Runs one user turn: conversational reply, then profile JSON refresh (second call).
 */
export async function runConversationTurn(
  session: SessionData,
  userText: string,
): Promise<{
  session: SessionData;
  assistantText: string;
  profileUpdateFailed: boolean;
  userMessageAt: string;
  assistantMessageAt: string;
}> {
  const model = getChatModel();

  const trimmed = userText.trim();
  if (!trimmed) {
    throw new Error("Message is empty");
  }

  const userMessageAt = new Date().toISOString();
  const userMessage: StoredChatMessage = {
    role: "user",
    content: trimmed,
    createdAt: userMessageAt,
  };

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildChatSystemContent(session) },
    ...toOpenAIMessages(session.messages),
    { role: "user", content: trimmed },
  ];

  const assistantText = await completeChat(
    model,
    chatMessages,
    CHAT_MAX_TOKENS,
  );

  const assistantMessageAt = new Date().toISOString();
  const assistantMessage: StoredChatMessage = {
    role: "assistant",
    content: assistantText,
    createdAt: assistantMessageAt,
  };

  const workingMessages: StoredChatMessage[] = [
    ...session.messages,
    userMessage,
    assistantMessage,
  ];

  const transcript = formatTranscript(workingMessages, 40);
  const profileJson = JSON.stringify(session.profile ?? emptyProfile());

  const extractorMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: PROFILE_SYSTEM },
    {
      role: "user",
      content: `Current profile JSON:\n${profileJson}\n\nConversation (most recent last; each line may be prefixed with an ISO timestamp):\n${transcript}\n\nReturn the updated profile JSON only.`,
    },
  ];

  let profileUpdateFailed = false;
  let nextProfile = session.profile;
  let profileFieldUpdatedAt = session.profileFieldUpdatedAt ?? {};

  try {
    const rawProfileText = await completeChat(
      model,
      extractorMessages,
      PROFILE_EXTRACT_MAX_TOKENS,
    );
    const parsed = parseProfileFromModel(rawProfileText);
    if (parsed) {
      nextProfile = mergeProfiles(session.profile, parsed);
      const changed = profileFieldsChanged(session.profile, nextProfile);
      if (changed.length > 0) {
        profileFieldUpdatedAt = mergeProfileFieldUpdatedAt(
          profileFieldUpdatedAt,
          changed,
          assistantMessageAt,
        );
      }
    } else {
      profileUpdateFailed = true;
    }
  } catch {
    profileUpdateFailed = true;
  }

  const nextSession: SessionData = {
    ...session,
    messages: workingMessages,
    profile: nextProfile,
    profileFieldUpdatedAt,
  };

  return {
    session: nextSession,
    assistantText,
    profileUpdateFailed,
    userMessageAt,
    assistantMessageAt,
  };
}
