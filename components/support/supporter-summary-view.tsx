'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CRISIS_LINE } from '@/lib/calmer/safety'
import { digestSummary, type SupporterSummary } from '@/lib/calmer/supporter'
import { cn } from '@/lib/utils'

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'never'

const TREND_TEXT = {
  better: 'Calmer this week than last week.',
  worse: 'Less calm this week than last week.',
  steady: 'About as calm as last week.',
  unknown: 'Not enough sessions yet to show a trend.',
} as const

/**
 * Everything a trusted supporter can see about one person: aggregates from
 * supporter_summary() (migration 014), never chat text. The owner sees the
 * same component as a preview in Settings.
 */
export function SupporterSummaryView({
  contactId,
  personName,
  preview = false,
}: {
  contactId: string
  personName: string
  preview?: boolean
}) {
  const [summary, setSummary] = useState<SupporterSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .rpc('supporter_summary', { p_contact_id: contactId })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return
        if (rpcError || !data) setError('This summary is not available.')
        else setSummary(data as SupporterSummary)
      })
    return () => {
      cancelled = true
    }
  }, [contactId])

  if (error) return <p className="text-sm text-muted-foreground">{error}</p>
  if (!summary) return <p className="text-sm text-muted-foreground">Loading…</p>

  const digest = digestSummary(summary)
  const days = summary.days ?? []

  return (
    <div className="space-y-4">
      {digest.supportRequestDays.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
          <p className="font-semibold text-amber-200">
            {personName} asked for support on {digest.supportRequestDays.map(fmtDay).join(', ')}.
          </p>
          <p className="mt-1 text-amber-100/80">Last request: {fmtWhen(summary.lastSupportRequest)}. A short message or call helps.</p>
        </div>
      )}
      {digest.safetyConcernDays.length > 0 && (
        <div role="status" className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm">
          <p className="font-semibold text-red-200">
            A safety concern came up in a conversation on {digest.safetyConcernDays.map(fmtDay).join(', ')}.
          </p>
          <p className="mt-1 text-red-100/80">
            You can&apos;t see what was said, and that&apos;s deliberate. Check in gently and without judgement. If you
            think they are in danger now: {CRISIS_LINE}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Sessions (14 days)" value={String(digest.totalSessions)} />
        <Stat label="Active days" value={`${digest.activeDays} of 14`} />
        <Stat label="High-stress days" value={String(digest.highStressDays.length)} />
        <Stat label="Last active" value={fmtWhen(summary.lastActive)} />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">{TREND_TEXT[digest.trend]}</p>
        {/* One column per day: bar = how calm sessions ended (0–100%). */}
        <div className="flex h-28 items-end gap-1" aria-label="Calm at the end of sessions, last 14 days">
          {days.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div
                title={`${fmtDay(d.day)}: ${d.sessions} session(s)${d.calm !== null ? `, ended ${Math.round(d.calm * 100)}% calm` : ''}`}
                className={cn(
                  'w-full rounded-sm',
                  d.calm === null ? 'bg-muted' : d.calm >= 0.66 ? 'bg-emerald-500/70' : d.calm >= 0.33 ? 'bg-amber-400/70' : 'bg-red-400/70',
                )}
                style={{ height: d.calm === null ? '4px' : `${Math.max(6, d.calm * 100)}%` }}
              />
              <span className={cn('h-1.5 w-1.5 rounded-full', d.safetyConcern ? 'bg-red-400' : d.supportRequests ? 'bg-amber-300' : 'bg-transparent')} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{days[0] ? fmtDay(days[0].day) : ''}</span>
          <span>today</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {preview
          ? 'This is exactly what your trusted person sees. They never see your messages, memories or summaries.'
          : `You see how ${personName}'s sessions went, never what they wrote. If you're worried about their safety, contact them directly. ${CRISIS_LINE}`}
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-secondary/30 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  )
}
