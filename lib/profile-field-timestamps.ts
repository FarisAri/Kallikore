import type { UserProfile } from "@/lib/profile";

/** Top-level profile keys we record last-updated times for (model / merge). */
export const PROFILE_TIMESTAMP_KEYS = [
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
] as const;

export type ProfileTimestampKey = (typeof PROFILE_TIMESTAMP_KEYS)[number];

export type ProfileFieldUpdatedAt = Partial<
  Record<ProfileTimestampKey, string>
>;

function arraysShallowEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function profileFieldsChanged(
  prev: UserProfile,
  next: UserProfile,
): ProfileTimestampKey[] {
  const changed: ProfileTimestampKey[] = [];
  if (prev.user_location !== next.user_location) {
    changed.push("user_location");
  }
  if (!arraysShallowEqual(prev.hobbies, next.hobbies)) {
    changed.push("hobbies");
  }
  if (
    !arraysShallowEqual(
      prev.international_news_focus,
      next.international_news_focus,
    )
  ) {
    changed.push("international_news_focus");
  }
  if (prev.ethnicity !== next.ethnicity) {
    changed.push("ethnicity");
  }
  if (prev.age !== next.age) {
    changed.push("age");
  }
  if (prev.native_language !== next.native_language) {
    changed.push("native_language");
  }
  if (prev.occupation !== next.occupation) {
    changed.push("occupation");
  }
  if (!arraysShallowEqual(prev.news_topics, next.news_topics)) {
    changed.push("news_topics");
  }
  if (!arraysShallowEqual(prev.avoid_topics, next.avoid_topics)) {
    changed.push("avoid_topics");
  }
  if (JSON.stringify(prev.etc) !== JSON.stringify(next.etc)) {
    changed.push("etc");
  }
  return changed;
}

export function mergeProfileFieldUpdatedAt(
  existing: ProfileFieldUpdatedAt,
  changedKeys: ProfileTimestampKey[],
  iso: string,
): ProfileFieldUpdatedAt {
  const out: ProfileFieldUpdatedAt = { ...existing };
  for (const k of changedKeys) {
    out[k] = iso;
  }
  return out;
}

/** When creating a session from questionnaire seed, stamp fields that are already filled. */
export function initialProfileFieldTimestamps(
  profile: UserProfile,
  iso: string,
): ProfileFieldUpdatedAt {
  const out: ProfileFieldUpdatedAt = {};
  if (profile.user_location?.trim()) out.user_location = iso;
  if (profile.hobbies.length > 0) out.hobbies = iso;
  if (profile.international_news_focus.length > 0) {
    out.international_news_focus = iso;
  }
  if (profile.ethnicity?.trim()) out.ethnicity = iso;
  if (profile.age != null) out.age = iso;
  if (profile.native_language?.trim()) out.native_language = iso;
  if (profile.occupation?.trim()) out.occupation = iso;
  if (profile.news_topics.length > 0) out.news_topics = iso;
  if (profile.avoid_topics.length > 0) out.avoid_topics = iso;
  if (Object.keys(profile.etc).length > 0) out.etc = iso;
  return out;
}
