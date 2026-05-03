/** Shared client/server: only translate when we have a confident non-English BCP-47 primary tag. */
export function shouldTranslateFromLanguage(lang: string | undefined): boolean {
  if (lang == null || lang === "") return false
  const base = lang.toLowerCase().split("-")[0]
  if (base === "unknown") return false
  return base !== "en"
}
