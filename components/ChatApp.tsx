"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProfileFieldUpdatedAt } from "@/lib/profile-field-timestamps";
import type { UserProfile } from "@/lib/profile";

type UiMessage = {
  role: "user" | "assistant";
  content: string;
  /** ISO time when the message was stored (server); legacy sessions may omit. */
  createdAt?: string;
};

type NewsArticle = {
  title: string;
  description: string | null;
  url: string;
  source: string | null;
  publishedAt: string | null;
};

const STORAGE_KEY = "kallikore_session_id";

const SAMPLE_QUESTIONNAIRE_JSON = `{
  "user_location": "Portland, Oregon",
  "hobbies": ["cycling", "climate policy", "indie games"],
  "international_news_focus": ["Japan", "Germany", "Nigeria"],
  "native_language": "English",
  "age": null,
  "ethnicity": null,
  "occupation": "software",
  "news_topics": ["AI"],
  "avoid_topics": ["celebrity gossip", "graphic violence"],
  "etc": {}
}`;

function formatMsgTime(iso?: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function emptyProfile(): UserProfile {
  return {
    user_location: null,
    hobbies: [],
    international_news_focus: [],
    ethnicity: null,
    age: null,
    native_language: null,
    occupation: null,
    news_topics: [],
    avoid_topics: [],
    etc: {},
  };
}

async function postSession(body: Record<string, unknown> = {}) {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Could not create session (${res.status})`);
  }
  return (await res.json()) as {
    sessionId: string;
    profile: UserProfile;
    profileFieldUpdatedAt: ProfileFieldUpdatedAt;
  };
}

export function ChatApp() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [profileFieldUpdatedAt, setProfileFieldUpdatedAt] =
    useState<ProfileFieldUpdatedAt>({});
  const [questionnaireContext, setQuestionnaireContext] = useState<
    string | null
  >(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [warnProfile, setWarnProfile] = useState(false);
  const [seedNotes, setSeedNotes] = useState("");
  const [seedJson, setSeedJson] = useState(SAMPLE_QUESTIONNAIRE_JSON);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsPayload, setNewsPayload] = useState<{
    mode: string;
    query: string;
    message?: string;
    articles: NewsArticle[];
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const hydrateFromServer = useCallback(
    async (sid: string) => {
      const res = await fetch(`/api/session/${encodeURIComponent(sid)}`);
      if (!res.ok) return false;
      const data = (await res.json()) as {
        sessionId: string;
        messages: { role: string; content: unknown; createdAt?: string }[];
        profile: UserProfile;
        profileFieldUpdatedAt?: ProfileFieldUpdatedAt;
        questionnaireContext?: string | null;
      };
      setSessionId(data.sessionId);
      const ui: UiMessage[] = [];
      for (const m of data.messages) {
        if (m.role !== "user" && m.role !== "assistant") continue;
        const c =
          typeof m.content === "string"
            ? m.content
            : String(m.content ?? "");
        ui.push({
          role: m.role,
          content: c,
          createdAt:
            typeof m.createdAt === "string" ? m.createdAt : undefined,
        });
      }
      setMessages(ui);
      setProfile(data.profile ?? emptyProfile());
      setProfileFieldUpdatedAt(data.profileFieldUpdatedAt ?? {});
      setQuestionnaireContext(
        typeof data.questionnaireContext === "string"
          ? data.questionnaireContext
          : null,
      );
      return true;
    },
    [],
  );

  const bootstrap = useCallback(async () => {
    setBootError(null);
    try {
      const existing =
        typeof window !== "undefined"
          ? window.localStorage.getItem(STORAGE_KEY)
          : null;

      if (existing && (await hydrateFromServer(existing))) {
        return;
      }
      if (existing) window.localStorage.removeItem(STORAGE_KEY);

      const { sessionId: sid, profile: p, profileFieldUpdatedAt: ts } =
        await postSession({});
      window.localStorage.setItem(STORAGE_KEY, sid);
      setSessionId(sid);
      setMessages([]);
      setProfile(p ?? emptyProfile());
      setProfileFieldUpdatedAt(ts ?? {});
      setQuestionnaireContext(null);
    } catch (e) {
      setBootError(e instanceof Error ? e.message : "Failed to start session");
    }
  }, [hydrateFromServer]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const newChat = async () => {
    setLoading(true);
    setBootError(null);
    setNewsPayload(null);
    setNewsError(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      const { sessionId: sid, profile: p, profileFieldUpdatedAt: ts } =
        await postSession({});
      window.localStorage.setItem(STORAGE_KEY, sid);
      setSessionId(sid);
      setMessages([]);
      setProfile(p ?? emptyProfile());
      setProfileFieldUpdatedAt(ts ?? {});
      setQuestionnaireContext(null);
      setWarnProfile(false);
    } catch (e) {
      setBootError(e instanceof Error ? e.message : "Failed to reset");
    } finally {
      setLoading(false);
    }
  };

  const applyQuestionnaireSeed = async () => {
    setSeedError(null);
    setLoading(true);
    try {
      let initialProfile: unknown = {};
      const trimmed = seedJson.trim();
      if (trimmed) {
        initialProfile = JSON.parse(trimmed) as unknown;
        if (!initialProfile || typeof initialProfile !== "object") {
          throw new Error("Profile JSON must be an object.");
        }
      }
      window.localStorage.removeItem(STORAGE_KEY);
      const { sessionId: sid, profile: p, profileFieldUpdatedAt: ts } =
        await postSession({
          initialProfile,
          questionnaireNotes: seedNotes.trim() || undefined,
        });
      window.localStorage.setItem(STORAGE_KEY, sid);
      setSessionId(sid);
      setMessages([]);
      setProfile(p ?? emptyProfile());
      setProfileFieldUpdatedAt(ts ?? {});
      setQuestionnaireContext(seedNotes.trim() || null);
      setWarnProfile(false);
      setNewsPayload(null);
    } catch (e) {
      setSeedError(
        e instanceof Error ? e.message : "Invalid JSON or request failed",
      );
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !sessionId || loading) return;
    setInput("");
    setLoading(true);
    setWarnProfile(false);
    setMessages((m) => [...m, { role: "user", content: text }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = (await res.json()) as {
        reply?: string;
        profile?: UserProfile;
        profileFieldUpdatedAt?: ProfileFieldUpdatedAt;
        userMessageAt?: string;
        assistantMessageAt?: string;
        profileUpdateFailed?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setMessages((m) => {
        if (m.length === 0) return m;
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last?.role !== "user") return m;
        copy[copy.length - 1] = {
          ...last,
          createdAt: data.userMessageAt ?? last.createdAt,
        };
        copy.push({
          role: "assistant",
          content: data.reply ?? "",
          createdAt: data.assistantMessageAt,
        });
        return copy;
      });
      if (data.profile) setProfile(data.profile);
      if (data.profileFieldUpdatedAt) {
        setProfileFieldUpdatedAt(data.profileFieldUpdatedAt);
      }
      if (data.profileUpdateFailed) setWarnProfile(true);
    } catch (e) {
      const errIso = new Date().toISOString();
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Sorry — something went wrong: ${e instanceof Error ? e.message : "unknown error"}`,
          createdAt: errIso,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const queryNews = async () => {
    if (!sessionId || newsLoading) return;
    setNewsLoading(true);
    setNewsError(null);
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = (await res.json()) as {
        mode?: string;
        query?: string;
        message?: string;
        articles?: NewsArticle[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `News request failed (${res.status})`);
      }
      setNewsPayload({
        mode: data.mode ?? "unknown",
        query: data.query ?? "",
        message: data.message,
        articles: data.articles ?? [],
      });
    } catch (e) {
      setNewsError(e instanceof Error ? e.message : "News request failed");
      setNewsPayload(null);
    } finally {
      setNewsLoading(false);
    }
  };

  if (bootError && !sessionId) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-sm text-red-300/90">{bootError}</p>
        <button
          type="button"
          onClick={() => void bootstrap()}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
        Starting session…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-0 px-3 pb-4 pt-3 sm:px-6 sm:pt-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
            Personalized news — profile chat
          </h1>
          <p className="mt-1 max-w-xl text-xs text-[var(--muted)] sm:text-sm">
            Refine your profile in chat (optionally after a questionnaire). Ask
            for deeper angles on topics you care about, including news from other
            countries.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void newChat()}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text)] hover:border-[var(--accent-dim)] disabled:opacity-50 sm:text-sm"
        >
          New conversation
        </button>
      </header>

      <details className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-4 py-3 text-sm backdrop-blur-sm">
        <summary className="cursor-pointer font-medium text-[var(--text)]">
          Questionnaire pre-fill (optional)
        </summary>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Paste partial profile JSON from your questionnaire, plus optional notes.
          Starting a seeded session replaces the current chat and creates a new
          session id.
        </p>
        <label className="mt-3 block text-xs font-medium text-[var(--muted)]">
          Questionnaire notes (free text, shown only to the model as context)
        </label>
        <textarea
          value={seedNotes}
          onChange={(e) => setSeedNotes(e.target.value)}
          rows={2}
          placeholder="e.g. User completed onboarding v2; prefers short reads."
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[#0f1219] px-3 py-2 text-xs text-[var(--text)] placeholder:text-[var(--muted)]"
        />
        <label className="mt-3 block text-xs font-medium text-[var(--muted)]">
          Initial profile JSON (partial object is fine)
        </label>
        <textarea
          value={seedJson}
          onChange={(e) => setSeedJson(e.target.value)}
          rows={10}
          spellCheck={false}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[#0f1219] px-3 py-2 font-mono text-[11px] leading-relaxed text-emerald-100/90 sm:text-xs"
        />
        {seedError && (
          <p className="mt-2 text-xs text-red-300/90">{seedError}</p>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={() => void applyQuestionnaireSeed()}
          className="mt-3 rounded-lg bg-[#2a3f6b] px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Apply questionnaire &amp; new session
        </button>
      </details>

      <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_320px] lg:gap-6">
        <div className="flex min-h-0 flex-col gap-3">
          <section
            className="flex min-h-[380px] flex-1 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 shadow-xl shadow-black/20 backdrop-blur-sm lg:min-h-[480px]"
            aria-label="Chat"
          >
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              {questionnaireContext && messages.length === 0 && (
                <p className="rounded-lg bg-[#1a2233] px-3 py-2 text-xs text-[var(--muted)] ring-1 ring-[var(--border)]">
                  Questionnaire context is loaded for the model (not shown in
                  chat history).
                </p>
              )}
              {messages.length === 0 && (
                <p className="text-sm text-[var(--muted)]">
                  The assistant sees your profile snapshot each turn—including{" "}
                  <span className="text-[var(--text)]">
                    international_news_focus
                  </span>{" "}
                  when set—so it can dig into specifics instead of only asking
                  generic questions.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={`${i}-${m.role}`}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[85%] sm:text-[15px] ${
                      m.role === "user"
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[#1e2433] text-[var(--text)] ring-1 ring-[var(--border)]"
                    }`}
                  >
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider opacity-70">
                      {m.role === "user" ? "You" : "Assistant"}
                    </span>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    {formatMsgTime(m.createdAt) && (
                      <time
                        dateTime={m.createdAt}
                        className={`mt-2 block text-[10px] opacity-60 ${
                          m.role === "user" ? "text-white/90" : "text-[var(--muted)]"
                        }`}
                      >
                        {formatMsgTime(m.createdAt)}
                      </time>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-[#1e2433] px-4 py-2.5 text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
                    Thinking…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-[var(--border)] p-3 sm:p-4">
              {warnProfile && (
                <p className="mb-2 text-xs text-amber-200/90">
                  Profile JSON could not be parsed from the model; previous
                  profile kept for this turn.
                </p>
              )}
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="msg">
                  Message
                </label>
                <textarea
                  id="msg"
                  rows={2}
                  value={input}
                  disabled={loading}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                  className="min-h-[44px] flex-1 resize-none rounded-lg border border-[var(--border)] bg-[#0f1219] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-60"
                />
                <button
                  type="button"
                  disabled={loading || !input.trim()}
                  onClick={() => void send()}
                  className="self-end rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </div>
          </section>

          <section
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 p-4 shadow-lg shadow-black/15 backdrop-blur-sm"
            aria-label="News API"
          >
            <h2 className="text-sm font-semibold text-[var(--text)]">
              News API
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Uses your current profile to build a search query. Set{" "}
              <code className="text-emerald-200/90">NEWS_API_KEY</code> in{" "}
              <code className="text-emerald-200/90">.env.local</code> (NewsAPI.org)
              for live results; otherwise you get demo placeholders.
            </p>
            <button
              type="button"
              disabled={newsLoading || !sessionId}
              onClick={() => void queryNews()}
              className="mt-3 w-full rounded-lg border border-[var(--accent-dim)] bg-[#1a2744] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#223252] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {newsLoading ? "Querying…" : "Query news API"}
            </button>
            {newsError && (
              <p className="mt-2 text-xs text-red-300/90">{newsError}</p>
            )}
            {newsPayload && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-[var(--muted)]">
                  Mode:{" "}
                  <span className="text-[var(--text)]">{newsPayload.mode}</span>
                  {" · "}
                  Query:{" "}
                  <span className="text-[var(--text)]">{newsPayload.query}</span>
                </p>
                {newsPayload.message && (
                  <p className="text-xs text-amber-200/90">{newsPayload.message}</p>
                )}
                <ul className="max-h-64 space-y-3 overflow-y-auto pr-1 text-sm">
                  {newsPayload.articles.map((a, idx) => (
                    <li
                      key={`${a.url}-${idx}`}
                      className="rounded-lg bg-[#0f1219] p-3 ring-1 ring-[var(--border)]"
                    >
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[var(--accent)] hover:underline"
                      >
                        {a.title}
                      </a>
                      {a.description && (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {a.description}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        {a.source ?? "source unknown"}
                        {a.publishedAt
                          ? ` · ${new Date(a.publishedAt).toLocaleString()}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        <aside
          className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 p-4 shadow-lg shadow-black/15 backdrop-blur-sm lg:max-h-[calc(100vh-8rem)]"
          aria-label="Live profile"
        >
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Profile (JSON)
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Top-level fields include{" "}
            <code className="text-emerald-200/90">international_news_focus</code>,{" "}
            <code className="text-emerald-200/90">occupation</code>, and{" "}
            <code className="text-emerald-200/90">news_topics</code>,{" "}
            <code className="text-emerald-200/90">avoid_topics</code>; only misc.
            facts belong in <code className="text-emerald-200/90">etc</code>.
          </p>
          <pre className="mt-3 max-h-[min(240px,35vh)] flex-shrink-0 overflow-auto rounded-lg bg-[#0f1219] p-3 text-[11px] leading-relaxed text-emerald-100/90 ring-1 ring-[var(--border)] sm:text-xs">
            {JSON.stringify(profile, null, 2)}
          </pre>
          <h3 className="mt-4 text-xs font-semibold text-[var(--text)]">
            Field last updated (ISO)
          </h3>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">
            Timestamps when each profile slice last changed (questionnaire seed or
            model merge). Arrays are one timestamp for the whole list.
          </p>
          <pre className="mt-2 max-h-[min(200px,28vh)] flex-1 overflow-auto rounded-lg bg-[#0f1219] p-3 text-[10px] leading-relaxed text-amber-100/90 ring-1 ring-[var(--border)] sm:text-[11px] lg:min-h-0">
            {JSON.stringify(profileFieldUpdatedAt, null, 2)}
          </pre>
        </aside>
      </div>
    </div>
  );
}
