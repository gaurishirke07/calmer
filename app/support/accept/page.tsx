import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { AcceptInvite } from '@/components/support/accept-invite'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Trusted person invite - CALMER',
  description: 'Accept an invitation to be someone’s trusted person on CALMER.',
}

export default async function AcceptSupportInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="min-h-screen">
      <Navigation />
      <section className="px-4 pt-24 pb-8">
        <div className="mx-auto max-w-xl space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">Be someone&apos;s trusted person</h1>
          <p className="text-muted-foreground">
            Someone you know uses CALMER to work through stress and anger and would like you to see how they&apos;re
            doing: how often they use it, how calm their sessions end, and the date if a conversation raised a safety
            concern. You will never see what they write. They can stop sharing at any time.
          </p>
          {!token ? (
            <p className="text-destructive">This link is incomplete. Ask them to send it again.</p>
          ) : user ? (
            <AcceptInvite token={token} email={user.email ?? ''} />
          ) : (
            <div className="space-y-3 rounded-lg border border-border/50 bg-card/50 p-4">
              <p>
                <strong>Sign in or create an account with the email address the invite was sent to</strong>, then open
                this link again.
              </p>
              <div className="flex gap-3">
                <Link href="/auth/login" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                  Sign in
                </Link>
                <Link href="/auth/sign-up" className="rounded-md border border-border px-4 py-2 text-sm font-medium">
                  Create an account
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
