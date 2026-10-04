import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Deleting the AUTH user is what actually removes an account. Every CALMER
// table references auth.users ON DELETE CASCADE (profiles, user_memories,
// hardware_device, and session -> every session table), so one admin call
// purges all of it. The previous version deleted rows with the user's own
// client and left the login itself in place — the email stayed registered and
// could still sign in — and ignored every error.
export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[user/delete] SUPABASE_SERVICE_ROLE_KEY is not set — cannot delete accounts.')
    return NextResponse.json({ error: 'Account deletion is not available right now.' }, { status: 500 })
  }

  // Service role is used ONLY for the id we just authenticated — never one
  // taken from the request.
  const { error } = await createServiceClient().auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[user/delete] deleteUser failed:', error.message)
    return NextResponse.json({ error: 'Could not delete your account. Please try again.' }, { status: 500 })
  }

  // The user no longer exists; this just clears the session cookie.
  await supabase.auth.signOut().catch(() => {})

  return NextResponse.json({ success: true })
}
