'use client'

import { useEffect, useRef, useState } from 'react'

export interface ChatMessage {
  role: 'ai' | 'user'
  text: string
}

interface ChatStageProps {
  messages: ChatMessage[]
  isHidden: boolean
  isDropdownMode: boolean
  /** When true with dropdown mode, center the chat in the space left of the 450px news panel (matches Globe padding). */
  recenterForRightPanel?: boolean
  showGenerateButton: boolean
  isBusy?: boolean
  generateLabel?: string
  onSendMessage: (text: string) => void
  onGenerate: () => void
}

export default function ChatStage({
  messages,
  isHidden,
  isDropdownMode,
  recenterForRightPanel = false,
  showGenerateButton,
  isBusy = false,
  generateLabel = 'Generate My News',
  onSendMessage,
  onGenerate,
}: ChatStageProps) {
  const [inputValue, setInputValue] = useState('')
  const chatHistoryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight
    }
  }, [messages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const text = inputValue.trim()
    if (!text || isBusy) return
    onSendMessage(text)
    setInputValue('')
  }

  const className = [
    isDropdownMode ? 'dropdown-mode' : '',
    isHidden ? 'hidden' : '',
    isDropdownMode && recenterForRightPanel ? 'dropdown-offset-right' : '',
  ].filter(Boolean).join(' ')

  return (
    <div id="stage1-chat" className={className || undefined}>
      <div id="chat-history" ref={chatHistoryRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`msg ${msg.role === 'ai' ? 'ai-msg' : 'user-msg'}`}>
            {msg.text}
          </div>
        ))}
      </div>
      <div className="chat-input-wrapper">
        <input
          type="text"
          id="ai-chat-input"
          placeholder="I'm interested in..."
          autoComplete="off"
          spellCheck={false}
          disabled={isBusy}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {showGenerateButton && (
          <button id="generate-news-btn" onClick={onGenerate} disabled={isBusy}>
            {generateLabel}
          </button>
        )}
      </div>
    </div>
  )
}
