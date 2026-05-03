import type { Article } from '@/lib/articles'

type Stage = 1 | 2 | 3

interface RightPanelProps {
  stage: Stage
  articles: Article[]
  selectedArticle: Article | null
  isForcedOpen: boolean
  /** When true, panel stays off-screen even if the cursor still hovers it (after clicking close). */
  peekDismissed: boolean
  status?: string | null
  debugSteps?: string[]
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
  debugSteps = [],
  onArticleClick,
  onBack,
  onCollapse,
}: RightPanelProps) {
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
      <div id="stage2-list" className={`panel-stage${stage === 3 ? ' hidden' : ''}`}>
        <h2>Your Curated News</h2>
        {status && <p className="panel-status">{status}</p>}
        {debugSteps.length > 0 && (
          <ul className="panel-debug">
            {debugSteps.map((step, index) => (
              <li key={`${index}-${step}`}>{step}</li>
            ))}
          </ul>
        )}
        <div id="article-list-container">
          {articles.length === 0 && !status && (
            <p className="empty-news">No articles returned yet.</p>
          )}
          {articles.map(article => (
            <button key={article.id} className="article-card" onClick={() => onArticleClick(article)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={article.imageUrl} alt={article.title} className="article-img" />
              <span className="article-card-content">
                <h3>{article.title}</h3>
                <span className="article-meta">
                  <span>{article.location}</span>
                  <span>{article.score == null ? article.date : `${Math.round(article.score * 100)}%`}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div id="stage3-article" className={`panel-stage${stage !== 3 || !selectedArticle ? ' hidden' : ''}`}>
        <button id="back-btn" onClick={onBack}>Back to News List</button>
        {selectedArticle && (
          <div id="full-article-container">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedArticle.imageUrl} alt={selectedArticle.title} className="full-article-img" />
            <h2>{selectedArticle.title}</h2>
            <div className="meta">{selectedArticle.location} &bull; {selectedArticle.date}</div>
            {selectedArticle.ai_reason && (
              <div className="summary">{selectedArticle.ai_reason}</div>
            )}
            <div className="summary">{selectedArticle.summary}</div>
            <div className="content">{selectedArticle.content}</div>
            {selectedArticle.url && (
              <a className="article-link" href={selectedArticle.url} target="_blank" rel="noreferrer">
                Read original
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
