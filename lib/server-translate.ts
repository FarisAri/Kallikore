import { createHash } from "crypto"
import fs from "fs/promises"
import path from "path"
import { shouldTranslateFromLanguage } from "@/lib/translation-policy"
import type { TranslateField, TranslatePart } from "@/lib/translate-fields"

const CACHE_DIR = path.join(process.cwd(), "data", "translate-cache")
const MAX_FIELD_CHARS = 28_000

function cacheFileForKey(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`)
}

async function readCache(key: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(cacheFileForKey(key), "utf8")
    const j = JSON.parse(raw) as { t?: string }
    return typeof j.t === "string" ? j.t : null
  } catch {
    return null
  }
}

async function writeCache(key: string, translated: string): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(cacheFileForKey(key), JSON.stringify({ t: translated }), "utf8")
}

function stableCacheKey(
  articleId: string,
  field: string,
  sourceBase: string,
  text: string,
): string {
  return createHash("sha256")
    .update(`${articleId}\0${field}\0${sourceBase}\0${text}`, "utf8")
    .digest("hex")
}

async function googleTranslateBatch(
  texts: string[],
  sourceBase: string,
): Promise<string[]> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY is not set")
  }
  if (texts.length === 0) return []

  const body: Record<string, unknown> = {
    q: texts,
    target: "en",
    format: "text",
  }
  if (sourceBase && sourceBase !== "unknown") {
    body.source = sourceBase
  }

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`Google Translate failed (${res.status}): ${errText.slice(0, 500)}`)
  }

  const data = (await res.json()) as {
    data?: { translations?: { translatedText?: string }[] }
  }
  const rows = data?.data?.translations
  if (!Array.isArray(rows) || rows.length !== texts.length) {
    throw new Error("Invalid Google Translate response shape")
  }
  return rows.map((r, i) => (typeof r.translatedText === "string" ? r.translatedText : texts[i]))
}

/**
 * Translate requested fields for one article; uses disk cache per (article, field, source, text).
 */
export async function translateArticleFields(
  articleId: string,
  sourceLanguage: string | undefined,
  parts: TranslatePart[],
  options: { cacheOnly?: boolean } = {},
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!shouldTranslateFromLanguage(sourceLanguage)) {
    for (const p of parts) {
      out[p.field] = p.text
    }
    return out
  }

  const sourceBase = sourceLanguage!.toLowerCase().split("-")[0]
  const pending: { field: TranslateField; text: string; key: string }[] = []

  for (const p of parts) {
    const text = (p.text ?? "").slice(0, MAX_FIELD_CHARS)
    if (!text) {
      out[p.field] = ""
      continue
    }
    const key = stableCacheKey(articleId, p.field, sourceBase, text)
    const hit = await readCache(key)
    if (hit != null) {
      out[p.field] = hit
    } else {
      pending.push({ field: p.field, text, key })
    }
  }

  if (pending.length === 0) {
    return out
  }

  if (options.cacheOnly) {
    for (const row of pending) {
      out[row.field] = row.text
    }
    return out
  }

  const translated = await googleTranslateBatch(
    pending.map((x) => x.text),
    sourceBase,
  )

  for (let i = 0; i < pending.length; i++) {
    const row = pending[i]!
    const t = translated[i] ?? row.text
    out[row.field] = t
    await writeCache(row.key, t)
  }

  return out
}
