import { Navigation } from '@/components/navigation'
import { SupportDashboard } from '@/components/support/support-dashboard'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'People you support - CALMER',
  description: 'How the people who chose you as their trusted person are doing.',
}

export default async function SupportPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <main className="min-h-screen">
      <Navigation />
      <section className="px-4 pt-24 pb-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-2 text-3xl font-bold tracking-tight">People you support</h1>
          <p className="mb-8 text-muted-foreground">
            They chose to share how they&apos;re doing with you. You see trends, never their conversations.
          </p>
          <SupportDashboard />
        </div>
      </section>
    </main>
  )
}
