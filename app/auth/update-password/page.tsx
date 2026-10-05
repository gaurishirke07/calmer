'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Reached from /auth/confirm after an invite or a password-reset link, with a
// session but no usable password yet.
export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // undefined = still checking; null = no session (link expired or reused)
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const router = useRouter()

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
  }, [])

  // A link can carry anyone's session, so always say WHOSE password this sets.
  const signOut = async () => {
    await createClient().auth.signOut()
    router.push('/auth/login')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 6) return setError('Password must be at least 6 characters')
    if (password !== confirm) return setError('Passwords do not match')
    setLoading(true)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError(
        updateError.name === 'AuthSessionMissingError'
          ? 'This link has expired. Request a new one below.'
          : updateError.message,
      )
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Choose a password</CardTitle>
          <CardDescription>You&apos;ll use it with your email to sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          {email === null && (
            <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              This link has expired or was already used. Request a new one below.
            </p>
          )}
          {email && (
            <p className="mb-4 rounded-lg border border-border/50 bg-secondary/30 p-3 text-sm">
              Setting the password for <strong>{email}</strong>. Not you?{' '}
              <button type="button" onClick={signOut} className="font-medium text-primary hover:underline">
                Sign out
              </button>
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="bg-background" />
            </div>
            {error && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <Button type="submit" className="w-full" disabled={loading || !email}>
              {loading ? 'Saving…' : 'Save password'}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm">
            <Link href="/auth/forgot-password" className="font-medium text-primary hover:underline">Request a new link</Link>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
