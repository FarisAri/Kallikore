import type { Article } from '@/lib/articles'

type Stage = 1 | 2 | 3

interface RightPanelProps {
  stage: Stage
  articles: Article[]
  selectedArticle: Article | null
  isForcedOpen: boolean
  onArticleClick: (article: Article) => void
  onBack: () => void
}

export default function RightPanel({
  stage,
  articles,
  selectedArticle,
  isForcedOpen,
  onArticleClick,
  onBack,
}: RightPanelProps) {
  return (
    <div id="right-panel" className={isForcedOpen ? 'forced-open' : undefined}>
      {/* Stage 2: article list */}
      <div id="stage2-list" className={`panel-stage${stage === 3 ? ' hidden' : ''}`}>
        <h2>Your Curated News</h2>
        <div id="article-list-container">
          {articles.map(article => (
            <div key={article.id} className="article-card" onClick={() => onArticleClick(article)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={article.imageUrl} alt={article.title} className="article-img" />
              <div className="article-card-content">
                <h3>{article.title}</h3>
                <div className="article-meta">
                  <span>{article.location}</span>
                  <span>{article.date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stage 3: full article view */}
      <div id="stage3-article" className={`panel-stage${stage !== 3 || !selectedArticle ? ' hidden' : ''}`}>
        <button id="back-btn" onClick={onBack}>← Back to News List</button>
        {selectedArticle && (
          <div id="full-article-container">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedArticle.imageUrl} alt={selectedArticle.title} className="full-article-img" />
            <h2>{selectedArticle.title}</h2>
            <div className="meta">{selectedArticle.location} &bull; {selectedArticle.date}</div>
            <div className="summary">{selectedArticle.summary}</div>
            <div className="content">{selectedArticle.content}</div>
          </div>
        )}
      </div>
    </div>
  )
}
