'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { postChatbot } from '../api'

const QUICK_REPLIES = ['Which jeepney is least crowded now?', 'How full is route 04L?', 'When is the next 04L?', 'Which should I avoid?']

export default function ChatPage() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const { messages, addMessage } = useChatStore()
  const chatPreFill = useUIStore(s => s.chatPreFill)
  const setChatPreFill = useUIStore(s => s.setChatPreFill)
  const sessionId = useRef(`s-${Date.now()}`).current

  useEffect(() => { if (chatPreFill) { setInput(chatPreFill); setChatPreFill(null); setTimeout(() => send(chatPreFill), 100) } }, [chatPreFill])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const send = async (q?: string) => {
    const text = (q ?? input).trim()
    if (!text || loading) return
    setInput('')
    addMessage({ role: 'user', content: text, timestamp: Date.now() })
    setLoading(true)
    try {
      const r = await postChatbot(text, sessionId)
      addMessage({ role: 'assistant', content: r.answer, timestamp: Date.now() })
    } catch { addMessage({ role: 'assistant', content: 'Sorry, I had trouble processing that.', timestamp: Date.now() }) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="chat-header">
        <p className="eyebrow">AI boarding assistant</p>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#172027', fontFamily: 'Sora, Manrope, sans-serif' }}>Ask Re-LoadSense</h2>
        <p style={{ fontSize: '13px', color: '#4f616b' }}>Recommendations use live ETA, occupancy tier, and route safety context.</p>
      </div>
      <p style={{ fontSize: '11px', color: '#8f5308', textAlign: 'center', padding: '4px 0', background: '#fff8ef', margin: 0 }}>Answers are based on simulated data.</p>

      <div className="chat-transcript" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="message-wrapper bot-wrapper">
            <div className="bot-avatar"><Bot size={14} /></div>
            <div className="message bot">Ask whether to board now, wait, or choose the least crowded PUV.</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message-wrapper ${msg.role === 'user' ? 'user-wrapper' : 'bot-wrapper'}`}>
            {msg.role === 'assistant' && <div className="bot-avatar"><Bot size={14} /></div>}
            <div className={`message ${msg.role === 'user' ? 'user' : 'bot'}`}>{msg.content}</div>
            {msg.role === 'user' && <div className="bot-avatar" style={{ background: '#d9e4e7' }}><User size={14} /></div>}
          </div>
        ))}
        {loading && (
          <div className="message-wrapper bot-wrapper">
            <div className="bot-avatar"><Bot size={14} /></div>
            <div className="message bot" style={{ display: 'flex', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8', animation: 'blink 0.6s infinite' }} />
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8', animation: 'blink 0.6s 0.2s infinite' }} />
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8', animation: 'blink 0.6s 0.4s infinite' }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length === 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 16px 8px' }}>
          {QUICK_REPLIES.map(q => <button key={q} onClick={() => send(q)} style={{ padding: '6px 12px', borderRadius: '999px', fontSize: '12px', background: '#f3f7f6', color: '#4f616b', border: 'none', cursor: 'pointer' }}>{q}</button>)}
        </div>
      )}

      <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); send() }}>
        <div className="chat-input-wrapper">
          <input placeholder="Type your message..." value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        <button type="submit" className="icon-button send-button" disabled={loading || !input.trim()}><Send size={18} /></button>
      </form>
    </div>
  )
}
