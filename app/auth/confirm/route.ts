import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/auth-redirect'

// Every email link lands here: sign-up confirmation, dashboard invites and
// password resets. Before this route existed, confirmation links dropped the
// user on /dashboard?code=… without a session, invited participants had no way
// to set a password, and nobody could reset one.
//
//   code               — the default PKCE redirect. Only the browser that asked
//                        for the email can exchange it, so it is safe to sign in.
//   token_hash + type  — the custom templates in docs/DEPLOYMENT.md §4. Anyone
//                        can paste their OWN token_hash into a link, so these
//                        never silently sign a visitor into someone's account:
//     email/signup  → confirm the address, then sign out and ask them to log in
//     invite        → only accounts an admin really invited
//     recovery      → "Choose a password" shows which account it is for
//     anything else → refused (the app sends no magic links or email changes)
const ALLOWED: EmailOtpType[] = ['email', 'signup', 'invite', 'recovery']

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))
  const fail = () => NextResponse.redirect(`${origin}/auth/error`)

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/confirm] code exchange failed:', error.message)
      return fail()
    }
    return NextResponse.redirect(`${origin}${next}`)
  }

  if (!tokenHash || !type || !ALLOWED.includes(type)) return fail()
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) {
    console.error('[auth/confirm] verifyOtp failed:', error.message)
    return fail()
  }

  if (type === 'email' || type === 'signup') {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/auth/confirmed`)
  }
  if (type === 'invite' && !data.user?.invited_at) {
    await supabase.auth.signOut()
    return fail()
  }
  // invite / recovery: no usable password yet
  return NextResponse.redirect(`${origin}/auth/update-password`)
}
