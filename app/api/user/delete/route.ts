import { NextResponse } from 'next/server'
import { createClient as createPlainClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Deleting the AUTH user is what actually removes an account. Every CALMER
// table references auth.users ON DELETE CASCADE (profiles, user_memories,
// hardware_device, and session -> every session table), so one admin call
// purges all of it. The previous version deleted rows with the user's own
// client and left the login itself in place — the email stayed registered and
// could still sign in — and ignored every error.
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Re-enter the password: a live session alone (a lab PC left signed in) must
  // not be enough to erase someone's account. Checked with a throwaway client
  // that stores nothing, so the user's cookie session is untouched.
  const body = await req.json().catch(() => null)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!password || !user.email) {
    return NextResponse.json({ error: 'Enter your password to delete your account.' }, { status: 400 })
  }
  const verifier = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: pwError } = await verifier.auth.signInWithPassword({ email: user.email, password })
  if (pwError) {
    return NextResponse.json({ error: 'That password is not right.' }, { status: 403 })
  }
  // End only the check's own session ('global' would also revoke the user's real one).
  await verifier.auth.signOut({ scope: 'local' }).catch(() => {})

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
