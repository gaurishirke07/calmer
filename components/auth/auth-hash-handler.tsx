'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Supabase only allows custom email templates with custom SMTP. With the
// default templates, a dashboard invite (and an expired or reused link) comes
// back to the Site URL with the result in the URL fragment:
//   #access_token=…&refresh_token=…&type=invite   or   #error=…&error_code=otp_expired
// The SSR browser client runs the PKCE flow and rejects fragments ("Not a valid
// PKCE flow url"), leaving them in place, so an invited participant would land
// signed out with no way to set a password. This picks the session up instead.
// Mounted once in the root layout; does nothing on ordinary page loads.
export function AuthHashHandler() {
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.includes('access_token=') && !hash.includes('error=')) return
    const params = new URLSearchParams(hash.slice(1))
    // Take the tokens out of the address bar and history straight away.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (params.get('error') || !accessToken || !refreshToken) {
      window.location.assign('/auth/error')
      return
    }
    const type = params.get('type')
    createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error('[auth] could not use the session from the link:', error.message)
          window.location.assign('/auth/error')
          return
        }
        // Invited and recovering users have no usable password yet.
        window.location.assign(type === 'invite' || type === 'recovery' ? '/auth/update-password' : '/dashboard')
      })
  }, [])

  return null
}
