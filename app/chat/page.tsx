import { Navigation } from '@/components/navigation'
import { TherapistChat } from '@/components/chat/therapist-chat'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Find Peace - CALMER',
  description: 'Talk to your persistent AI companion to process your emotions and find inner peace.',
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Unified `session` id handed over from the rage room (?session=<uuid>).
  // Passing it in makes chat readiness FUSE this session's venting history
  // rather than seeing text sentiment alone (Novelty #1 cross-module fusion).
  const { session } = await searchParams
  const calmerSessionId = session ?? null

  return (
    <main className="flex min-h-screen flex-col">
      <Navigation />
      <section className="flex flex-1 flex-col px-4 pt-20 pb-4">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
          <div className="mb-4 text-center">
            <h1 className="mb-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Find Your Peace
            </h1>
            <p className="text-sm text-muted-foreground">
              A safe, persistent space to process your emotions with personalized AI guidance
            </p>
          </div>
          <TherapistChat calmerSessionId={calmerSessionId} />
        </div>
      </section>
    </main>
  )
}
