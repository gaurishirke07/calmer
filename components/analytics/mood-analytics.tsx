'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MoodAnalyticsData } from '@/lib/types'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'

const pct = (v: number | null) => (v === null ? '—' : `${v}%`)

// Rendered with the numbers the dashboard page already computed on the server
// (they used to be fetched a second time from /api/analytics). Every caption
// describes what the number IS; none claims an outcome the data can't show.
export function MoodAnalytics({ data }: { data: MoodAnalyticsData }) {
  const change = data.stressChange
  const changeText = change === null ? '—' : change === 0 ? 'No change' : `${change > 0 ? '↓' : '↑'} ${Math.abs(change)} pts`
  const changeCaption =
    change === null
      ? 'Needs sessions in both of the last two fortnights'
      : change > 0
        ? 'Sessions ended calmer than in the fortnight before'
        : change < 0
          ? 'Sessions ended more stressed than in the fortnight before'
          : 'About the same as the fortnight before'
  const tooltipStyle = { backgroundColor: '#18181b', borderColor: '#27272a' }

  return (
    <div className="space-y-6">
      {/* Metric Highlights */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Change in stress</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-400">{changeText}</p>
            <p className="mt-1 text-xs text-muted-foreground">{changeCaption}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Negative mood in chat</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-accent">{pct(data.averageNegativeMood)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Sentiment of your messages, last {data.windowDays} days</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Stress at session end</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-400">{pct(data.averageStress)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Average over sessions, last {data.windowDays} days</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Latest trigger noted</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="truncate text-lg font-bold text-primary">{data.latestTrigger ?? 'None yet'}</p>
            <p className="mt-1 text-xs text-muted-foreground">From your companion memories</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle>Last 7 days</CardTitle>
            <CardDescription>Negative mood in chat and stress at session end. Gaps are days without sessions.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.weeklyMoodTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="day" stroke="#888" />
                <YAxis stroke="#888" domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Line type="monotone" dataKey="negativeMood" stroke="#f43f5e" name="Negative mood" strokeWidth={2} dot />
                <Line type="monotone" dataKey="stress" stroke="#fbbf24" name="Stress at session end" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle>Emotion Distribution</CardTitle>
            <CardDescription>The text-sentiment signal across your chat messages: a noisy estimate, not ground-truth emotion</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {data.emotionDistribution.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No labelled chat messages in the last {data.windowDays} days.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.emotionDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="emotion" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="percentage" fill="#6366f1" radius={[4, 4, 0, 0]} name="Percentage (%)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>Triggers noted recently</CardTitle>
          <CardDescription>Things you mentioned that set you off, as remembered by the companion. Edit them in Settings.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentTriggers.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {data.recentTriggers.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
