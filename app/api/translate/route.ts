import { NextResponse } from "next/server"
import { translateArticleFields } from "@/lib/server-translate"
import type { TranslateField, TranslatePart } from "@/lib/translate-fields"

export const runtime = "nodejs"

const ALLOWED_FIELDS = new Set<TranslateField>([
  "title",
  "summary",
  "content",
  "ai_reason",
])

type ItemIn = {
  articleId?: unknown
  sourceLanguage?: unknown
  parts?: unknown
}

type TranslateBody = {
  items?: unknown
  cacheOnly?: unknown
}

function normalizeParts(raw: unknown): TranslatePart[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: TranslatePart[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") return null
    const field = (row as { field?: unknown }).field
    const text = (row as { text?: unknown }).text
    if (typeof field !== "string" || !ALLOWED_FIELDS.has(field as TranslateField)) {
      return null
    }
    if (typeof text !== "string") return null
    out.push({ field: field as TranslateField, text })
  }
  return out
}

/**
 * POST { items: [{ articleId, sourceLanguage?, parts: [{ field, text }] }] }
 * Returns { results: [{ articleId, translations: Record<field, string> }] }
 */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { items, cacheOnly } = body as TranslateBody
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 })
  }
  if (items.length > 40) {
    return NextResponse.json({ error: "Too many items" }, { status: 400 })
  }

  const results: { articleId: string; translations: Record<string, string> }[] = []

  for (const item of items as ItemIn[]) {
    const aid = item.articleId
    if (aid == null || (typeof aid !== "string" && typeof aid !== "number")) {
      return NextResponse.json({ error: "Each item needs articleId" }, { status: 400 })
    }
    const articleId = String(aid)
    const sourceLanguage =
      typeof item.sourceLanguage === "string" ? item.sourceLanguage : undefined
    const parts = normalizeParts(item.parts)
    if (!parts) {
      return NextResponse.json({ error: "Invalid parts" }, { status: 400 })
    }

    try {
      const translations = await translateArticleFields(articleId, sourceLanguage, parts, {
        cacheOnly: cacheOnly === true,
      })
      results.push({ articleId, translations })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Translate failed"
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  }

  return NextResponse.json({ results })
}
