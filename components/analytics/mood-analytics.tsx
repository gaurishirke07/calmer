'use client'

import React, { useEffect, useState } from 'react'
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

export function MoodAnalytics() {
  const [data, setData] = useState<MoodAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/analytics')
        if (res.ok) {
          const json = await res.json()
          setData(json.analytics)
        }
      } catch (err) {
        console.error('Failed to fetch mood analytics:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAnalytics()
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Metric Highlights */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Emotional Improvement</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-400">+{data.emotionalImprovement}%</p>
            <p className="text-xs text-muted-foreground mt-1">Compared to initial sessions</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Average Anger Level</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-accent">{data.averageAnger}%</p>
            <p className="text-xs text-muted-foreground mt-1">Target &lt; 40%</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Average Stress Level</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-400">{data.averageStress}%</p>
            <p className="text-xs text-muted-foreground mt-1">Managed effectively</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Most Common Trigger</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-primary truncate">{data.mostCommonTrigger}</p>
            <p className="text-xs text-muted-foreground mt-1">Primary focus area</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly Mood & Stress Trend */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle>Weekly Mood Trend</CardTitle>
            <CardDescription>Anger and stress levels over the last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.weeklyMoodTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="day" stroke="#888" />
                <YAxis stroke="#888" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a' }}
                />
                <Legend />
                <Line type="monotone" dataKey="anger" stroke="#f43f5e" name="Anger Level" strokeWidth={2} />
                <Line type="monotone" dataKey="stress" stroke="#fbbf24" name="Stress Level" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Emotion Distribution */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle>Emotion Distribution</CardTitle>
            <CardDescription>The text-sentiment signal across your chat messages — a noisy estimate, not ground-truth emotion</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.emotionDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="emotion" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a' }}
                />
                <Bar dataKey="percentage" fill="#6366f1" radius={[4, 4, 0, 0]} name="Percentage (%)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Common Triggers Breakdown */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>Top Emotional Triggers</CardTitle>
          <CardDescription>Identified sources of anger and stress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.commonTriggers.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm font-medium">{item.trigger}</span>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-48 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, item.count * 15)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
