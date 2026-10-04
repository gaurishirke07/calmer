'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export function AcceptInvite({ token, email }: { token: string; email: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    setState('busy')
    setError(null)
    const { error: rpcError } = await createClient().rpc('accept_support_invite', { p_token: token })
    if (rpcError) {
      // accept_support_invite's messages are written for users
      // ("invite expired", "sign in with the email address the invite was sent to").
      setError(rpcError.message)
      setState('idle')
      return
    }
    setState('done')
  }

  if (state === 'done') {
    return (
      <div className="space-y-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
        <p>You&apos;re now their trusted person. Thank you.</p>
        <Link href="/support" className="font-medium text-primary underline">See how they&apos;re doing →</Link>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-card/50 p-4">
      <p className="text-sm text-muted-foreground">Signed in as {email}.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button onClick={accept} disabled={state === 'busy'}>Accept</Button>
    </div>
  )
}
