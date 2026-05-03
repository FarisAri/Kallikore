'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Article } from '@/lib/articles'
import type { TranslatePart } from '@/lib/translate-fields'
import { shouldTranslateFromLanguage } from '@/lib/translation-policy'
import { translateItems } from '@/lib/translate-client'
import ArticleListCard from '@/components/ArticleListCard'

type Stage = 1 | 2 | 3

interface RightPanelProps {
  stage: Stage
  articles: Article[]
  selectedArticle: Article | null
  isForcedOpen: boolean
  /** When true, panel stays off-screen even if the cursor still hovers it (after clicking close). */
  peekDismissed: boolean
  status?: string | null
  onArticleClick: (article: Article) => void
  onBack: () => void
  /** Clears the pinned-open state so the panel can slide away (hover the right edge to peek again). */
  onCollapse: () => void
}

export default function RightPanel({
  stage,
  articles,
  selectedArticle,
  isForcedOpen,
  peekDismissed,
  status,
  onArticleClick,
  onBack,
  onCollapse,
}: RightPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const requestedListTitlesRef = useRef(new Set<string>())
  const [showBottomFade, setShowBottomFade] = useState(false)
  const [detailTranslations, setDetailTranslations] = useState<Record<string, string>>({})
  const detailArticleIdRef = useRef<string | null>(null)

  useEffect(() => {
    requestedListTitlesRef.current.clear()
  }, [articles])

  const updateScrollFade = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const epsilon = 4
    const canScrollDown = scrollHeight > clientHeight + epsilon
    const notAtBottom = scrollTop + clientHeight < scrollHeight - epsilon
    setShowBottomFade(canScrollDown && notAtBottom)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollFade()
    el.addEventListener('scroll', updateScrollFade, { passive: true })
    const ro = new ResizeObserver(updateScrollFade)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollFade)
      ro.disconnect()
    }
  }, [updateScrollFade, articles, status, stage, selectedArticle])

  useEffect(() => {
    setDetailTranslations({})
    if (!selectedArticle) {
      detailArticleIdRef.current = null
      return
    }
    const id = String(selectedArticle.id)
    detailArticleIdRef.current = id
    if (!shouldTranslateFromLanguage(selectedArticle.language)) {
      return
    }
    const parts: TranslatePart[] = [
      { field: "title" as const, text: selectedArticle.title },
      { field: "summary" as const, text: selectedArticle.summary },
      { field: "content" as const, text: selectedArticle.content },
    ]
    if (selectedArticle.ai_reason) {
      parts.push({ field: "ai_reason" as const, text: selectedArticle.ai_reason })
    }
    void translateItems([{ articleId: id, sourceLanguage: selectedArticle.language, parts }])
      .then((map) => {
        if (detailArticleIdRef.current !== id) return
        setDetailTranslations(map[id] ?? {})
      })
      .catch(() => {
        if (detailArticleIdRef.current === id) {
          setDetailTranslations({})
        }
      })
  }, [selectedArticle])

  const scrollResetKey =
    stage === 3 && selectedArticle != null ? String(selectedArticle.id) : `list-${stage}`

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = 0
      updateScrollFade()
    })
  }, [scrollResetKey, updateScrollFade])

  const panelClass = [
    isForcedOpen ? 'forced-open' : '',
    peekDismissed ? 'peek-dismissed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div id="right-panel" className={panelClass || undefined}>
      {isForcedOpen && (
        <button
          type="button"
          id="right-panel-collapse"
          aria-label="Close news panel"
          title="Close panel"
          onClick={onCollapse}
        >
          ×
        </button>
      )}
      <div id="right-panel-scroll" ref={scrollRef}>
        <div id="stage2-list" className={`panel-stage${stage === 3 ? ' hidden' : ''}`}>
          <h2>Your Curated News</h2>
          {status && <p className="panel-status">{status}</p>}
          <div id="article-list-container">
            {articles.length === 0 && !status && (
              <p className="empty-news">No articles returned yet.</p>
            )}
            {articles.map((article) => (
              <ArticleListCard
                key={article.id}
                article={article}
                scrollRootRef={scrollRef}
                requestedTitlesRef={requestedListTitlesRef}
                onClick={() => onArticleClick(article)}
              />
            ))}
          </div>
        </div>

        <div id="stage3-article" className={`panel-stage${stage !== 3 || !selectedArticle ? ' hidden' : ''}`}>
          <button id="back-btn" onClick={onBack}>Back to News List</button>
          {selectedArticle && (
            <div id="full-article-container">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedArticle.imageUrl}
                alt={detailTranslations.title ?? selectedArticle.title}
                className="full-article-img"
              />
              <h2>{detailTranslations.title ?? selectedArticle.title}</h2>
              <div className="meta">{selectedArticle.location} &bull; {selectedArticle.date}</div>
              {selectedArticle.ai_reason && (
                <div className="full-article-relevance">
                  {detailTranslations.ai_reason ?? selectedArticle.ai_reason}
                </div>
              )}
              <div className="full-article-summary">
                {detailTranslations.summary ?? selectedArticle.summary}
              </div>
              <div className="content">{detailTranslations.content ?? selectedArticle.content}</div>
              {selectedArticle.url && (
                <a className="article-link" href={selectedArticle.url} target="_blank" rel="noreferrer">
                  Read original
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className={`right-panel-scroll-fade${showBottomFade ? '' : ' right-panel-scroll-fade--hidden'}`}
        aria-hidden="true"
      />
    </div>
  )
}
