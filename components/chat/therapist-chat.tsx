'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ChatSidebar } from './chat-sidebar'
import { CategorizedSessions, ChatMessage } from '@/lib/types'

function getUIMessageText(
  msg: { parts?: Array<{ type: 'text' | string; text?: string }>; content?: string }
): string {
  if (typeof msg.content === 'string' && msg.content.length > 0) return msg.content
  if (!msg.parts || !Array.isArray(msg.parts)) return ''
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

export function TherapistChat({ calmerSessionId = null }: { calmerSessionId?: string | null }) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [categorizedSessions, setCategorizedSessions] = useState<CategorizedSessions>({
    today: [],
    yesterday: [],
    previous7Days: [],
    older: [],
  })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [summaryNotification, setSummaryNotification] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      // One unified `session` id drives history + fusion + summary.
      body: { sessionId },
    }),
  })

  // Initialise from the rage-room handoff (?session=<uuid>) so chat continues
  // the SAME unified session the venting happened in.
  useEffect(() => {
    if (calmerSessionId) setSessionId(calmerSessionId)
  }, [calmerSessionId])

  const isStreaming = status === 'streaming'
  const isSubmitting = status === 'submitted'

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Fetch all chat sessions
  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      if (res.ok) {
        const data = await res.json()
        if (data.sessions) {
          setCategorizedSessions(data.sessions)
        }
      }
    } catch (err) {
      console.error('Error loading sessions:', err)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // New chat = blank slate. The unified `session` row is created lazily on the
  // first message (see handleSubmit), so no empty sessions are left behind.
  const handleNewChat = () => {
    setSessionId(null)
    setMessages([])
  }

  // Select existing session
  const handleSelectSession = async (selectedId: string) => {
    try {
      setSessionId(selectedId)
      const res = await fetch(`/api/sessions/${selectedId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.messages) {
          const formatted = data.messages.map((m: ChatMessage) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            parts: [{ type: 'text', text: m.content }],
          }))
          setMessages(formatted)
        }
      }
    } catch (err) {
      console.error('Error loading session messages:', err)
    }
  }

  // Rename session
  const handleRenameSession = async (selectedId: string, newTitle: string) => {
    await fetch(`/api/sessions/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    })
    await loadSessions()
  }

  // Delete session
  const handleDeleteSession = async (selectedId: string) => {
    await fetch(`/api/sessions/${selectedId}`, { method: 'DELETE' })
    if (sessionId === selectedId) {
      setSessionId(null)
      setMessages([])
    }
    await loadSessions()
  }

  // Generate session summary
  const handleGenerateSummary = async () => {
    if (!sessionId) return
    setIsSummarizing(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/summary`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setSummaryNotification('Session summary generated & saved!')
        setTimeout(() => setSummaryNotification(null), 4000)
      }
    } catch (err) {
      console.error('Error summarizing session:', err)
    } finally {
      setIsSummarizing(false)
    }
  }

  // Auto create session on first prompt if missing
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming || isSubmitting) return

    let currentSessionId = sessionId
    if (!currentSessionId) {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.trim().slice(0, 40) }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.session) {
          currentSessionId = data.session.id
          setSessionId(currentSessionId)
        }
      }
    }

    const text = input.trim()
    setInput('')
    // Pass the id explicitly so the very first message isn't lost to a stale
    // transport body (setSessionId hasn't propagated on this tick yet).
    sendMessage({ text }, currentSessionId ? { body: { sessionId: currentSessionId } } : undefined)
    loadSessions()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const suggestedPrompts = [
    "I've been feeling really angry lately and I don't know why",
    "I just finished the anger release game. Can we talk?",
    "I need help calming down after a stressful day",
    "I want to understand my emotions better",
  ]

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full overflow-hidden rounded-xl border border-border bg-card/30 chat-glow">
      {/* Sidebar Toggle & Sidebar */}
      <div className={cn('transition-all duration-300', sidebarOpen ? 'w-64' : 'w-0 overflow-hidden')}>
        <ChatSidebar
          categorizedSessions={categorizedSessions}
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
        />
      </div>

      {/* Main Chat Container */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Chat Header Bar */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-secondary/20">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle Sidebar"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </Button>
            <span className="text-sm font-semibold">
              {sessionId ? 'Active Conversation' : 'New Chat Session'}
            </span>
          </div>

          {sessionId && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSummary}
                disabled={isSummarizing || messages.length === 0}
                className="text-xs border-primary/40 hover:bg-primary/10"
              >
                {isSummarizing ? 'Summarizing...' : '✨ Summarize Session'}
              </Button>
            </div>
          )}
        </div>

        {summaryNotification && (
          <div className="bg-primary/20 text-primary px-4 py-2 text-xs font-medium text-center border-b border-primary/30">
            {summaryNotification}
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-medium">Welcome to Your Safe Space</h3>
              <p className="mb-6 max-w-md text-sm text-muted-foreground">
                I&apos;m your persistent wellness companion. I remember your previous topics, triggers, 
                and progress so we can build on every session.
              </p>
              <div className="grid w-full max-w-md gap-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setInput(prompt)
                      inputRef.current?.focus()
                    }}
                    className="rounded-lg border border-border bg-secondary/50 p-3 text-left text-sm transition-colors hover:bg-secondary"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground'
                    )}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {getUIMessageText(message)}
                    </p>
                  </div>
                </div>
              ))}
              {(isStreaming || isSubmitting) && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl bg-secondary px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-primary animation-delay-150" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-primary animation-delay-300" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-border p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Share what's on your mind..."
              className="flex-1 resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              rows={1}
              disabled={isStreaming || isSubmitting}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isStreaming || isSubmitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </Button>
          </form>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            This is an AI companion, not a substitute for professional therapy. 
            In crisis? Call Tele-MANAS 14416 — India's free 24×7 mental health helpline
          </p>
        </div>
      </div>
    </div>
  )
}
