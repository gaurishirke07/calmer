import { Navigation } from '@/components/navigation'
import { SettingsContent } from '@/components/settings/settings-content'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Settings - CALMER',
  description: 'Manage your AI companion memory, chat history, and account settings.',
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <main className="min-h-screen">
      <Navigation />
      <section className="px-4 pt-24 pb-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold tracking-tight">Account & AI Settings</h1>
            <p className="text-muted-foreground">
              Manage saved companion memories, chat history export, and privacy controls
            </p>
          </div>
          <SettingsContent />
        </div>
      </section>
    </main>
  )
}
