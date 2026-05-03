'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import ChatStage, { type ChatMessage } from '@/components/ChatStage'
import RightPanel from '@/components/RightPanel'
import { DUMMY_ARTICLES, type Article } from '@/lib/articles'

const Globe = dynamic(() => import('@/components/Globe'), { ssr: false })

type Stage = 1 | 2 | 3

const INITIAL_MESSAGE: ChatMessage = {
  role: 'ai',
  text: "Hello! I'm your global news assistant. Tell me about your interests, and I'll find personalized articles from around the world.",
}

export default function Home() {
  const [stage, setStage] = useState<Stage>(1)
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE])
  const [chatCount, setChatCount] = useState(0)
  const [showGenerateButton, setShowGenerateButton] = useState(false)
  const [isChatHidden, setIsChatHidden] = useState(false)
  const [isChatDropdownMode, setIsChatDropdownMode] = useState(false)
  const [articles, setArticles] = useState<Article[]>([])
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)
  const [isPanelForcedOpen, setIsPanelForcedOpen] = useState(false)

  const handleSendMessage = useCallback((text: string) => {
    const newCount = chatCount + 1
    setMessages(prev => [...prev, { role: 'user', text }])
    setChatCount(newCount)

    setTimeout(() => {
      const aiText = newCount === 1
        ? `That's very interesting. I've noted your interest in "${text}". Tell me more about what regions or topics you care about.`
        : "Got it. I've built your profile. I can now generate a personalized global news feed for you."
      setMessages(prev => [...prev, { role: 'ai', text: aiText }])
      if (newCount >= 2) setShowGenerateButton(true)
    }, 600)
  }, [chatCount])

  const handleGenerateNews = useCallback(() => {
    setIsChatDropdownMode(true)
    setIsChatHidden(true)
    setStage(2)
    setArticles(DUMMY_ARTICLES)
    setTimeout(() => setIsPanelForcedOpen(true), 300)
  }, [])

  const handleArticleClick = useCallback((article: Article) => {
    setSelectedArticle(article)
    setStage(3)
    setIsPanelForcedOpen(true)
  }, [])

  const handleBack = useCallback(() => {
    setSelectedArticle(null)
    setStage(2)
  }, [])

  const handleChatToggle = useCallback(() => {
    setIsChatHidden(prev => !prev)
  }, [])

  return (
    <>
      <Navbar onChatToggle={handleChatToggle} />
      <Globe
        stage={stage}
        articles={articles}
        selectedArticle={selectedArticle}
        onArticleClick={handleArticleClick}
      />
      <ChatStage
        messages={messages}
        isHidden={isChatHidden}
        isDropdownMode={isChatDropdownMode}
        showGenerateButton={showGenerateButton}
        onSendMessage={handleSendMessage}
        onGenerate={handleGenerateNews}
      />
      <div id="right-panel-trigger" />
      <RightPanel
        stage={stage}
        articles={articles}
        selectedArticle={selectedArticle}
        isForcedOpen={isPanelForcedOpen}
        onArticleClick={handleArticleClick}
        onBack={handleBack}
      />
    </>
  )
}
