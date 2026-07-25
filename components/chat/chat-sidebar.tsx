'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CategorizedSessions, ChatSession } from '@/lib/types'

interface ChatSidebarProps {
  categorizedSessions: CategorizedSessions
  activeSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewChat: () => void
  onRenameSession: (sessionId: string, newTitle: string) => Promise<void>
  onDeleteSession: (sessionId: string) => Promise<void>
}

export function ChatSidebar({
  categorizedSessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onRenameSession,
  onDeleteSession,
}: ChatSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const handleStartRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(session.id)
    setEditTitle(session.title || 'Conversation')
  }

  const handleSaveRename = async (sessionId: string, e: React.FormEvent) => {
    e.preventDefault()
    if (editTitle.trim()) {
      await onRenameSession(sessionId, editTitle.trim())
    }
    setEditingId(null)
  }

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this chat session?')) {
      await onDeleteSession(sessionId)
    }
  }

  const renderSection = (title: string, sessions: ChatSession[]) => {
    if (!sessions || sessions.length === 0) return null

    return (
      <div className="mb-4">
        <h4 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
        <div className="space-y-1">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId
            const isEditing = session.id === editingId

            return (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={cn(
                  'group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-all cursor-pointer',
                  isActive
                    ? 'bg-primary/20 text-primary font-medium border border-primary/30'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                {isEditing ? (
                  <form
                    onSubmit={(e) => handleSaveRename(session.id, e)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex flex-1 items-center gap-1"
                  >
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      autoFocus
                      className="w-full rounded bg-background px-2 py-1 text-xs border border-primary focus:outline-none"
                    />
                    <button type="submit" className="text-xs text-primary font-bold px-1">
                      ✓
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex items-center gap-2 overflow-hidden">
                      <svg className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      <span className="truncate">{session.title || 'New Conversation'}</span>
                    </div>

                    <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => handleStartRename(session, e)}
                        title="Rename Chat"
                        className="rounded p-1 hover:bg-background/80 text-muted-foreground hover:text-foreground"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => handleDelete(session.id, e)}
                        title="Delete Chat"
                        className="rounded p-1 hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border/50 bg-card/30 p-3 backdrop-blur-md">
      {/* New Chat Button */}
      <Button
        onClick={onNewChat}
        className="mb-4 flex w-full items-center justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New Chat
      </Button>

      {/* Sessions History List */}
      <div className="flex-1 overflow-y-auto pr-1">
        {renderSection("Today's Chats", categorizedSessions.today)}
        {renderSection('Yesterday', categorizedSessions.yesterday)}
        {renderSection('Previous 7 Days', categorizedSessions.previous7Days)}
        {renderSection('Older Chats', categorizedSessions.older)}

        {Object.values(categorizedSessions).every((arr) => arr.length === 0) && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No previous chats yet. Start a new session above!
          </div>
        )}
      </div>
    </aside>
  )
}
