"use client"

import type { TranslateField } from "@/lib/translate-fields"

export type TranslateRequestItem = {
  articleId: string | number
  sourceLanguage?: string
  parts: { field: TranslateField; text: string }[]
}

export type TranslateBatchResult = Record<string, Record<string, string>>

/** One POST; returns map articleId → { field → text } */
export async function translateItems(
  items: TranslateRequestItem[],
  options: { cacheOnly?: boolean } = {},
): Promise<TranslateBatchResult> {
  if (items.length === 0) return {}
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, cacheOnly: options.cacheOnly === true }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    results?: { articleId: string; translations: Record<string, string> }[]
  }
  if (!res.ok) {
    throw new Error(data.error ?? `Translate request failed (${res.status})`)
  }
  const out: TranslateBatchResult = {}
  for (const row of data.results ?? []) {
    out[row.articleId] = row.translations
  }
  return out
}
