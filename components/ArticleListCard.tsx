"use client"

import { useEffect, useRef, useState } from "react"
import type { Article } from "@/lib/articles"
import { shouldTranslateFromLanguage } from "@/lib/translation-policy"
import { translateItems } from "@/lib/translate-client"

interface ArticleListCardProps {
  article: Article
  scrollRootRef: React.RefObject<HTMLDivElement | null>
  /** Parent tracks which article ids already had a list-title request (StrictMode-safe). */
  requestedTitlesRef: React.MutableRefObject<Set<string>>
  onClick: () => void
}

export default function ArticleListCard({
  article,
  scrollRootRef,
  requestedTitlesRef,
  onClick,
}: ArticleListCardProps) {
  const rootRef = useRef<HTMLButtonElement>(null)
  const [title, setTitle] = useState(article.title)

  useEffect(() => {
    setTitle(article.title)
  }, [article.id, article.title])

  useEffect(() => {
    if (!shouldTranslateFromLanguage(article.language)) return
    const el = rootRef.current
    if (!el) return

    const id = String(article.id)
    const root = scrollRootRef.current ?? undefined

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting)
        if (!visible) return
        if (requestedTitlesRef.current.has(id)) return
        requestedTitlesRef.current.add(id)
        void translateItems([
          {
            articleId: id,
            sourceLanguage: article.language,
            parts: [{ field: "title", text: article.title }],
          },
        ])
          .then((map) => {
            const t = map[id]?.title
            if (t) setTitle(t)
          })
          .catch(() => {
            requestedTitlesRef.current.delete(id)
          })
      },
      { root, rootMargin: "48px 0px", threshold: 0.08 },
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [article, article.id, article.language, article.title, requestedTitlesRef, scrollRootRef])

  return (
    <button ref={rootRef} type="button" className="article-card" onClick={onClick}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={article.imageUrl} alt={title} className="article-img" />
      <span className="article-card-content">
        <h3>{title}</h3>
        <span className="article-meta">
          <span>{article.location}</span>
          <span>
            {article.score == null ? article.date : `${Math.round(article.score * 100)}%`}
          </span>
        </span>
      </span>
    </button>
  )
}
