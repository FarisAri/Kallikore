'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import ChatStage, { type ChatMessage } from '@/components/ChatStage'
import ProfilePanel from '@/components/ProfilePanel'
import RightPanel from '@/components/RightPanel'
import type { Article } from '@/lib/articles'
import type { UserProfile } from '@/lib/profile'

const Globe = dynamic(() => import('@/components/Globe'), { ssr: false })

type Stage = 1 | 2 | 3

const STORAGE_KEY = 'kallikore_session_id'

const INITIAL_MESSAGE: ChatMessage = {
  role: 'ai',
  text: "Hi — I'm your news assistant. What do you like to read, and which countries or regions should we include?",
}

function profileReadyForNews(profile: UserProfile | null): boolean {
  if (!profile) return false
  return (
    profile.international_news_focus.length > 0 &&
    (profile.news_topics.length > 0 || profile.hobbies.length > 0 || !!profile.occupation)
  )
}

async function createSession() {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? `Could not create session (${res.status})`)
  }
  return await res.json() as { sessionId: string; profile: UserProfile }
}

export default function Home() {
  const [stage, setStage] = useState<Stage>(1)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE])
  const [showGenerateButton, setShowGenerateButton] = useState(false)
  const [isChatHidden, setIsChatHidden] = useState(false)
  const [isChatDropdownMode, setIsChatDropdownMode] = useState(false)
  const [articles, setArticles] = useState<Article[]>([])
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)
  const [isPanelForcedOpen, setIsPanelForcedOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [newsStatus, setNewsStatus] = useState<string | null>(null)
  const [newsDebugSteps, setNewsDebugSteps] = useState<string[]>([])
  const [rightPanelPeekDismissed, setRightPanelPeekDismissed] = useState(false)
  const newsAbortRef = useRef<AbortController | null>(null)

  const hydrateSession = useCallback(async (sid: string) => {
    const res = await fetch(`/api/session/${encodeURIComponent(sid)}`)
    if (!res.ok) return false
    const data = await res.json() as {
      sessionId: string
      profile: UserProfile
      messages: { role: 'user' | 'assistant'; content: string }[]
    }

    setSessionId(data.sessionId)
    setProfile(data.profile)
    setMessages([
      INITIAL_MESSAGE,
      ...data.messages.map((m) => ({
        role: m.role === 'assistant' ? 'ai' as const : 'user' as const,
        text: m.content,
      })),
    ])
    setShowGenerateButton(profileReadyForNews(data.profile))
    return true
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const existing = window.localStorage.getItem(STORAGE_KEY)
        if (existing && await hydrateSession(existing)) return
        if (existing) window.localStorage.removeItem(STORAGE_KEY)

        const created = await createSession()
        if (cancelled) return
        window.localStorage.setItem(STORAGE_KEY, created.sessionId)
        setSessionId(created.sessionId)
        setProfile(created.profile)
      } catch (e) {
        const text = e instanceof Error ? e.message : 'Failed to start session'
        setMessages([{ role: 'ai', text: `I could not start a session: ${text}` }])
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [hydrateSession])

  const handleSendMessage = useCallback(async (text: string) => {
    if (!sessionId || isSending) return

    setIsSending(true)
    setMessages((prev) => [...prev, { role: 'user', text }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      })
      const data = await res.json() as {
        reply?: string
        profile?: UserProfile
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? `Chat failed (${res.status})`)

      setMessages((prev) => [...prev, { role: 'ai', text: data.reply ?? '' }])
      if (data.profile) {
        setProfile(data.profile)
        setShowGenerateButton(profileReadyForNews(data.profile))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error'
      setMessages((prev) => [...prev, { role: 'ai', text: `Sorry, something went wrong: ${msg}` }])
    } finally {
      setIsSending(false)
    }
  }, [isSending, sessionId])

  const handleGenerateNews = useCallback(async () => {
    if (!sessionId || isGenerating) return

    newsAbortRef.current?.abort()
    const ac = new AbortController()
    newsAbortRef.current = ac

    setIsGenerating(true)
    setIsChatDropdownMode(true)
    setIsChatHidden(true)
    setStage(2)
    setSelectedArticle(null)
    setIsPanelForcedOpen(true)
    setRightPanelPeekDismissed(false)
    setArticles([])
    setNewsDebugSteps([])
    setNewsStatus('Starting news pipeline...')

    try {
      setNewsStatus('Fetching candidates, embedding, and ranking per focus...')
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        signal: ac.signal,
      })
      if (ac.signal.aborted) return

      const data = await res.json() as {
        articles?: Article[]
        debugSteps?: string[]
        error?: string
        message?: string
        mode?: string
        warnings?: string[]
      }
      if (ac.signal.aborted) return
      if (!res.ok) throw new Error(data.error ?? `News request failed (${res.status})`)

      const nextArticles = data.articles ?? []
      setArticles(nextArticles)
      setNewsDebugSteps([
        ...(data.debugSteps ?? []),
        ...(data.warnings ?? []).map((warning) => `warning: ${warning}`),
      ])
      setNewsStatus(`${data.mode ?? 'news'} pipeline returned ${nextArticles.length} articles.`)
      if (!data.articles?.length) {
        setMessages((prev) => [...prev, { role: 'ai', text: data.message ?? 'No matching articles came back yet. Try adding more regions or interests.' }])
      }
    } catch (e: unknown) {
      const aborted =
        (e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && e.name === 'AbortError')
      if (aborted) {
        setNewsStatus('Cancelled')
        return
      }
      const msg = e instanceof Error ? e.message : 'News request failed'
      setNewsStatus(`News pipeline failed: ${msg}`)
      setMessages((prev) => [...prev, { role: 'ai', text: `I could not generate your feed: ${msg}` }])
      setIsChatHidden(false)
    } finally {
      if (newsAbortRef.current === ac) {
        newsAbortRef.current = null
      }
      setIsGenerating(false)
    }
  }, [isGenerating, sessionId])

  const handleArticleClick = useCallback((article: Article) => {
    setSelectedArticle(article)
    setStage(3)
    setIsPanelForcedOpen(true)
    setRightPanelPeekDismissed(false)
  }, [])

  const handleBack = useCallback(() => {
    setSelectedArticle(null)
    setStage(2)
  }, [])

  const handleRightPanelCollapse = useCallback(() => {
    newsAbortRef.current?.abort()
    // Leaving article zoom while the panel closes — reset map to globe list view (same as “Back to News List”).
    if (stage === 3 && selectedArticle) {
      setSelectedArticle(null)
      setStage(2)
    }
    setIsPanelForcedOpen(false)
    setIsGenerating(false)
    /* Without this, #right-panel:hover keeps the drawer open while the cursor is still on the × */
    setRightPanelPeekDismissed(true)
  }, [stage, selectedArticle])

  const handleReopenNewsPanel = useCallback(() => {
    setIsPanelForcedOpen(true)
    setRightPanelPeekDismissed(false)
  }, [])

  const handleChatToggle = useCallback(() => {
    setIsProfileOpen(false)
    setIsChatHidden((prev) => !prev)
  }, [])

  const handleProfileToggle = useCallback(() => {
    setIsChatHidden(true)
    setIsProfileOpen((prev) => !prev)
  }, [])

  return (
    <>
      <Navbar onChatToggle={handleChatToggle} onProfileToggle={handleProfileToggle} />
      <Globe
        stage={stage}
        articles={articles}
        selectedArticle={selectedArticle}
        rightPanelPinned={isPanelForcedOpen}
        onArticleClick={handleArticleClick}
      />
      <ChatStage
        messages={messages}
        isHidden={isChatHidden}
        isDropdownMode={isChatDropdownMode}
        showGenerateButton={showGenerateButton}
        isBusy={isSending || isGenerating}
        generateLabel={isGenerating ? 'Generating...' : 'Generate My News'}
        onSendMessage={handleSendMessage}
        onGenerate={handleGenerateNews}
      />
      <div id="right-panel-dock">
        <div
          id="right-panel-trigger"
          onMouseEnter={() => setRightPanelPeekDismissed(false)}
          aria-hidden
        />
        {!isPanelForcedOpen && (stage === 2 || stage === 3) && (
          <button
            type="button"
            id="news-panel-reopen"
            aria-label="Open news panel"
            title="News"
            onClick={handleReopenNewsPanel}
          >
            <span className="news-panel-reopen-chevron" aria-hidden>
              ‹
            </span>
            <span>News</span>
          </button>
        )}
        <RightPanel
          stage={stage}
          articles={articles}
          selectedArticle={selectedArticle}
          isForcedOpen={isPanelForcedOpen}
          peekDismissed={rightPanelPeekDismissed}
          status={newsStatus}
          debugSteps={newsDebugSteps}
          onArticleClick={handleArticleClick}
          onBack={handleBack}
          onCollapse={handleRightPanelCollapse}
        />
      </div>
      <ProfilePanel
        profile={profile}
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />
    </>
  )
}
