/**
 * Canonical user profile for news personalization.
 * Prefer top-level fields; `etc` is only for miscellaneous facts the model picks up.
 */
export type UserProfile = {
  user_location: string | null;
  hobbies: string[];
  /** Countries or regions outside the user's own where they want news coverage. */
  international_news_focus: string[];
  ethnicity: string | null;
  age: number | null;
  native_language: string | null;
  occupation: string | null;
  /** Themes or beats for news search (e.g. "AI", "local politics"). */
  news_topics: string[];
  /** Topics or themes the user does not want surfaced (for filtering / ranking). */
  avoid_topics: string[];
  etc: Record<string, unknown>;
};

export function emptyProfile(): UserProfile {
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

export function mergeProfiles(
  previous: UserProfile,
  incoming: Partial<UserProfile> | null,
): UserProfile {
  if (!incoming) return previous;
  const next: UserProfile = {
    user_location:
      incoming.user_location !== undefined
        ? incoming.user_location
        : previous.user_location,
    hobbies:
      incoming.hobbies !== undefined
        ? [...incoming.hobbies]
        : [...previous.hobbies],
    international_news_focus:
      incoming.international_news_focus !== undefined
        ? [...incoming.international_news_focus]
        : [...previous.international_news_focus],
    ethnicity:
      incoming.ethnicity !== undefined
        ? incoming.ethnicity
        : previous.ethnicity,
    age: incoming.age !== undefined ? incoming.age : previous.age,
    native_language:
      incoming.native_language !== undefined
        ? incoming.native_language
        : previous.native_language,
    occupation:
      incoming.occupation !== undefined
        ? incoming.occupation
        : previous.occupation,
    news_topics:
      incoming.news_topics !== undefined
        ? [...incoming.news_topics]
        : [...previous.news_topics],
    avoid_topics:
      incoming.avoid_topics !== undefined
        ? [...incoming.avoid_topics]
        : [...previous.avoid_topics],
    etc:
      incoming.etc !== undefined && typeof incoming.etc === "object"
        ? { ...previous.etc, ...incoming.etc }
        : { ...previous.etc },
  };
  return next;
}

export function coerceProfile(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const hobbies = o.hobbies;
  const intl = o.international_news_focus;
  const etcRaw = o.etc;
  const etcNested: Record<string, unknown> =
    etcRaw && typeof etcRaw === "object" && !Array.isArray(etcRaw)
      ? { ...(etcRaw as Record<string, unknown>) }
      : {};

  const occupation =
    typeof o.occupation === "string"
      ? o.occupation
      : typeof etcNested.occupation === "string"
        ? etcNested.occupation
        : null;
  delete etcNested.occupation;

  const newsTopicsTop = Array.isArray(o.news_topics)
    ? o.news_topics.filter((t): t is string => typeof t === "string")
    : [];
  const newsTopicsEtc = Array.isArray(etcNested.news_topics)
    ? (etcNested.news_topics as unknown[]).filter(
        (t): t is string => typeof t === "string",
      )
    : [];
  const news_topics =
    newsTopicsTop.length > 0 ? newsTopicsTop : newsTopicsEtc;
  delete etcNested.news_topics;

  const avoidTopicsTop = Array.isArray(o.avoid_topics)
    ? o.avoid_topics.filter((t): t is string => typeof t === "string")
    : [];
  const avoidTopicsEtc = Array.isArray(etcNested.avoid_topics)
    ? (etcNested.avoid_topics as unknown[]).filter(
        (t): t is string => typeof t === "string",
      )
    : [];
  const avoid_topics =
    avoidTopicsTop.length > 0 ? avoidTopicsTop : avoidTopicsEtc;
  delete etcNested.avoid_topics;

  return {
    user_location:
      typeof o.user_location === "string" ? o.user_location : null,
    hobbies: Array.isArray(hobbies)
      ? hobbies.filter((h): h is string => typeof h === "string")
      : [],
    international_news_focus: Array.isArray(intl)
      ? intl.filter((h): h is string => typeof h === "string")
      : [],
    ethnicity: typeof o.ethnicity === "string" ? o.ethnicity : null,
    age: typeof o.age === "number" && Number.isFinite(o.age) ? o.age : null,
    native_language:
      typeof o.native_language === "string" ? o.native_language : null,
    occupation,
    news_topics,
    avoid_topics,
    etc: etcNested,
  };
}

/** Normalize profile loaded from disk (older sessions without new fields). */
export function normalizeStoredProfile(raw: unknown): UserProfile {
  return mergeProfiles(emptyProfile(), coerceProfile(raw));
}

/** Merge questionnaire / partial JSON into a valid starting profile. */
export function seedProfileFromQuestionnaire(partial: unknown): UserProfile {
  const base = emptyProfile();
  if (!partial || typeof partial !== "object") return base;
  const merged = { ...base, ...(partial as Record<string, unknown>) };
  return coerceProfile(merged) ?? base;
}
