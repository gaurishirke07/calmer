import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/auth-redirect'

// Every email link lands here: sign-up confirmation, dashboard invites and
// password resets. Before this route existed, confirmation links dropped the
// user on /dashboard?code=… without a session, invited participants had no way
// to set a password, and nobody could reset one.
//
//   token_hash + type  — the Supabase email templates in docs/DEPLOYMENT.md §4
//                        (works on any device)
//   code               — the default PKCE redirect (same browser only)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  const supabase = await createClient()
  let failed = true
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    failed = !!error
    if (error) console.error('[auth/confirm] verifyOtp failed:', error.message)
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    failed = !!error
    if (error) console.error('[auth/confirm] code exchange failed:', error.message)
  }
  if (failed) return NextResponse.redirect(`${origin}/auth/error`)

  // Invited users and password resets arrive without a usable password.
  const destination = type === 'invite' || type === 'recovery' ? '/auth/update-password' : next
  return NextResponse.redirect(`${origin}${destination}`)
}
