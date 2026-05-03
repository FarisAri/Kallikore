'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './onboarding.module.css';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function Onboarding() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length === 0) {
      const stored = localStorage.getItem('user_profile');
      if (stored) {
        setMessages([{ role: 'assistant', content: "I see you already have a profile saved! What would you like to change or add to it?" }]);
      } else {
        setMessages([{ role: 'assistant', content: "Hi! I'm here to build your personalized news profile. To get started, what's your name and what do you do for a living?" }]);
      }
    }
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          profile_so_far: localStorage.getItem('user_profile') ? JSON.parse(localStorage.getItem('user_profile') as string) : null
        }),
      });

      const data = await response.json();
      
      // Check if the reply contains a JSON block
      const jsonMatch = data.reply.match(/```json\n([\s\S]*?)\n```/);
      
      if (jsonMatch) {
        try {
          const profile = JSON.parse(jsonMatch[1]);
          localStorage.setItem('user_profile', JSON.stringify(profile));
          
          setMessages((prev) => [
            ...prev, 
            { role: 'assistant', content: "Perfect! I've built your profile. Let me fetch your personalized news feed..." }
          ]);
          
          setTimeout(() => {
            router.push('/feed');
          }, 2000);
          return;
        } catch (e) {
          console.error("Failed to parse JSON profile from LLM", e);
        }
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { role: 'assistant', content: "Sorry, I had an issue connecting to the server. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messages}>
        {messages.map((m, idx) => (
          <div key={idx} className={`${styles.message} ${styles[m.role]}`}>
            {m.content}
          </div>
        ))}
        {isLoading && (
          <div className={styles.typingIndicator}>
            <div className={styles.dot}></div>
            <div className={styles.dot}></div>
            <div className={styles.dot}></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <input
          type="text"
          className={styles.input}
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={isLoading}
        />
        <button className={styles.sendBtn} onClick={handleSend} disabled={isLoading || !input.trim()}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  );
}
