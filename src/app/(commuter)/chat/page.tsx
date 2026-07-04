'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { postChatbot } from '../api'

const QUICK_REPLIES = [
  'Which jeepney is least crowded now?',
  'How full is route 04L?',
  'When is the next 04L?',
  'Which should I avoid?',
]

export default function ChatPage() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { messages, addMessage } = useChatStore()
  const chatPreFill = useUIStore((s) => s.chatPreFill)
  const setChatPreFill = useUIStore((s) => s.setChatPreFill)
  const sessionId = useRef(`session-${Date.now()}`).current

  // Handle pre-fill from Home tab
  useEffect(() => {
    if (chatPreFill) {
      setInput(chatPreFill)
      setChatPreFill(null)
      // Auto-send
      setTimeout(() => send(chatPreFill), 100)
    }
  }, [chatPreFill])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (query?: string) => {
    const text = (query ?? input).trim()
    if (!text || loading) return

    setInput('')
    addMessage({ role: 'user', content: text, timestamp: Date.now() })
    setLoading(true)

    try {
      const result = await postChatbot(text, sessionId)
      addMessage({ role: 'assistant', content: result.answer, timestamp: Date.now() })
    } catch {
      addMessage({ role: 'assistant', content: 'Sorry, I had trouble processing that. Please try again.', timestamp: Date.now() })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* SIM reminder */}
      <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900">
        <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
          Answers are based on simulated data.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <div className="w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-950 flex items-center justify-center mx-auto">
              <Bot size={28} className="text-teal-600 dark:text-teal-400" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Ask me about PUVs in Cebu. I can help you find the least crowded jeepney, check occupancy, or plan your trip.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-950 flex items-center justify-center shrink-0">
                <Bot size={16} className="text-teal-600 dark:text-teal-400" />
              </div>
            )}
            <div
              className={`max-w-[75%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-teal-600 text-white rounded-br-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-bl-sm border border-slate-200 dark:border-slate-700'
              }`}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                <User size={16} className="text-slate-500" />
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-950 flex items-center justify-center shrink-0">
              <Bot size={16} className="text-teal-600 dark:text-teal-400" />
            </div>
            <div className="px-4 py-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick replies */}
      {messages.length === 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="px-3 py-1.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-950 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
        <Input
          placeholder="Ask about PUVs..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={loading}
          className="flex-1"
        />
        <Button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          size="icon"
          className="bg-teal-600 hover:bg-teal-700 shrink-0"
        >
          <Send size={18} />
        </Button>
      </div>
    </div>
  )
}
