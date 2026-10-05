'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Supabase only allows custom email templates with custom SMTP. With the
// default templates, a DASHBOARD INVITE (and an expired or reused link) comes
// back to the Site URL with the result in the URL fragment:
//   #access_token=…&refresh_token=…&type=invite   or   #error=…&error_code=otp_expired
// The SSR browser client runs the PKCE flow and rejects fragments, so an
// invited participant would land signed out with no way to set a password.
//
// Accepting any session from a URL would let anyone sign a visitor into the
// SENDER'S account with a crafted link (everything typed afterwards would land
// there). So this only accepts invites: the type must be 'invite', the visitor
// must not already be signed in, and the account must really have been invited
// by an admin (invited_at), which no one can arrange for their own account.

// A full page load on purpose: the server must render the next page with the
// session cookie that was just set (or cleared), not a client-side transition.
function hardNavigate(path: string) {
  window.location.assign(path)
}

export function AuthHashHandler() {
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.includes('access_token=') && !hash.includes('error=')) return
    const params = new URLSearchParams(hash.slice(1))
    // Take the tokens out of the address bar and history straight away.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (params.get('error') || params.get('type') !== 'invite' || !accessToken || !refreshToken) {
      hardNavigate('/auth/error')
      return
    }

    const supabase = createClient()
    void (async () => {
      const { data: existing } = await supabase.auth.getUser()
      if (existing.user) {
        // Never replace a session someone already has.
        hardNavigate('/auth/error')
        return
      }
      const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      if (error || !data.user?.invited_at) {
        if (error) console.error('[auth] could not use the session from the link:', error.message)
        await supabase.auth.signOut()
        hardNavigate('/auth/error')
        return
      }
      hardNavigate('/auth/update-password')
    })()
  }, [])

  return null
}
