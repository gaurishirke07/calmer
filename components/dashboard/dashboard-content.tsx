'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { MoodAnalytics } from '@/components/analytics/mood-analytics'

interface GameSession {
  id: string
  created_at: string
  interactions: number
}

interface ChatSession {
  id: string
  created_at: string
  title?: string
  mood?: string
  chat_messages: { count: number }[]
}

interface DashboardContentProps {
  displayName: string
  gameSessions: GameSession[]
  chatSessions: ChatSession[]
  stats: {
    totalChatSessions: number
    currentMood: string
    avgAnger: number
    avgStress: number
    mostCommonTrigger: string
  }
}

export function DashboardContent({
  displayName,
  gameSessions,
  chatSessions,
  stats,
}: DashboardContentProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const lastChatSessionId = chatSessions[0]?.id

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {displayName}</h1>
          <p className="text-muted-foreground mt-1">
            Your personalized AI companion dashboard & emotional wellness journey
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {lastChatSessionId ? (
            <Link href={`/chat`}>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20">
                Continue Last Chat
              </Button>
            </Link>
          ) : null}
          <Link href="/chat">
            <Button variant="outline" className="border-primary/50 hover:bg-primary/10">
              Start New Chat
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary Companion Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Current Mood</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize text-emerald-400">{stats.currentMood}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Sessions Completed</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{stats.totalChatSessions}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Average Anger</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-accent">{stats.avgAnger}%</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Average Stress</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-400">{stats.avgStress}%</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Most Common Trigger</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-bold text-foreground truncate">{stats.mostCommonTrigger}</p>
          </CardContent>
        </Card>
      </div>

      {/* Mood Analytics Charts */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">Mood Analytics</h2>
        <MoodAnalytics />
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Game Sessions */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              Recent Game Sessions
            </CardTitle>
            <CardDescription>Your anger release history</CardDescription>
          </CardHeader>
          <CardContent>
            {gameSessions.length === 0 ? (
              <div className="py-8 text-center">
                <p className="mb-4 text-muted-foreground">No game sessions yet</p>
                <Link href="/game">
                  <Button variant="outline" size="sm">
                    Start Your First Session
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {gameSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{formatDate(session.created_at)}</p>
                      <p className="text-xs text-muted-foreground">Rage room session</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-accent">{session.interactions}</p>
                      <p className="text-xs text-muted-foreground">interactions</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chat Sessions */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </span>
              Recent Chat Conversations
            </CardTitle>
            <CardDescription>Your conversations with CALMER AI</CardDescription>
          </CardHeader>
          <CardContent>
            {chatSessions.length === 0 ? (
              <div className="py-8 text-center">
                <p className="mb-4 text-muted-foreground">No chat sessions yet</p>
                <Link href="/chat">
                  <Button variant="outline" size="sm">
                    Start a Conversation
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {chatSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{session.title || formatDate(session.created_at)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.created_at)}
                      </p>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
