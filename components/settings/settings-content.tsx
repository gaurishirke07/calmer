'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserMemory, MemoryCategory } from '@/lib/types'

export function SettingsContent() {
  const [memories, setMemories] = useState<UserMemory[]>([])
  const [loadingMemories, setLoadingMemories] = useState(true)
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>('trigger')
  const [newMemoryText, setNewMemoryText] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const loadMemories = async () => {
    setLoadingMemories(true)
    try {
      const res = await fetch('/api/memories')
      if (res.ok) {
        const data = await res.json()
        setMemories(data.memories || [])
      }
    } catch (err) {
      console.error('Failed to load memories:', err)
    } finally {
      setLoadingMemories(false)
    }
  }

  useEffect(() => {
    loadMemories()
  }, [])

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMemoryText.trim()) return

    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newMemoryCategory,
          memory_text: newMemoryText.trim(),
        }),
      })

      if (res.ok) {
        setNewMemoryText('')
        setMessage('Memory added successfully!')
        setTimeout(() => setMessage(null), 3000)
        await loadMemories()
      }
    } catch (err) {
      console.error('Error adding memory:', err)
    }
  }

  const handleDeleteMemory = async (id: string) => {
    try {
      const res = await fetch(`/api/memories?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        await loadMemories()
      }
    } catch (err) {
      console.error('Error deleting memory:', err)
    }
  }

  const handleExportData = () => {
    window.open('/api/user/export', '_blank')
  }

  const handleDeleteAccount = async () => {
    if (confirm('Are you absolutely sure you want to delete your account and all associated wellness data? This action cannot be undone.')) {
      try {
        const res = await fetch('/api/user/delete', { method: 'DELETE' })
        if (res.ok) {
          window.location.href = '/'
        }
      } catch (err) {
        console.error('Error deleting account:', err)
      }
    }
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className="rounded-lg bg-primary/20 p-3 text-sm text-primary border border-primary/30">
          {message}
        </div>
      )}

      {/* Memory Management */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>Long-Term AI Companion Memories</CardTitle>
          <CardDescription>
            View and manage key wellness details CALMER remembers about you (triggers, relaxation methods, goals, stress sources).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add New Memory Form */}
          <form onSubmit={handleAddMemory} className="flex flex-col sm:flex-row gap-3">
            <select
              value={newMemoryCategory}
              onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="trigger">Trigger</option>
              <option value="relaxation">Relaxation Method</option>
              <option value="goal">Goal</option>
              <option value="stress_work">Work Stress</option>
              <option value="stress_family">Family Stress</option>
              <option value="stress_exam">Exam Stress</option>
              <option value="hobby">Hobby</option>
              <option value="other">Other</option>
            </select>
            <input
              type="text"
              placeholder="e.g., Deep breathing for 5 minutes relaxes me when work is overwhelming..."
              value={newMemoryText}
              onChange={(e) => setNewMemoryText(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
              Add Memory
            </Button>
          </form>

          {/* Memories List */}
          {loadingMemories ? (
            <p className="text-xs text-muted-foreground">Loading memories...</p>
          ) : memories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No custom memories added yet.</p>
          ) : (
            <div className="space-y-3">
              {memories.map((mem) => (
                <div
                  key={mem.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 p-3"
                >
                  <div>
                    <span className="inline-block rounded bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary uppercase mr-2">
                      {mem.category.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-foreground">{mem.memory_text}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteMemory(mem.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Export & History */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>Data Export & Privacy</CardTitle>
          <CardDescription>Export your complete session transcripts and mood logs.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button variant="outline" onClick={handleExportData} className="border-primary/50 hover:bg-primary/10">
            Export Chat History & Logs (JSON)
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Permanently remove all your account history and personal data.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleDeleteAccount}>
            Delete Account & Purge Data
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
