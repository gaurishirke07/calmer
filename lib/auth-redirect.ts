// Where an email link may send the user after /auth/confirm. Only same-site
// paths: "//evil.example" and "/\evil.example" are protocol-relative URLs to
// another site, so they (and anything not starting with "/") fall back.
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
