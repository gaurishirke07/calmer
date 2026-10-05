'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // Phone menu: the page links are hidden below md, and there was no other
  // way to reach them (or, signed in, Settings and Sign Out) on a phone.
  const [menuOpen, setMenuOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setMenuOpen(false)
    // re-render server pages without the session (they all re-check auth)
    router.replace('/')
    router.refresh()
  }

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/how-it-works', label: 'How It Works' },
    { href: '/game', label: 'Release Anger' },
    { href: '/chat', label: 'Find Peace' },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-background/60 backdrop-blur-2xl shadow-xl shadow-black/40">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 relative">
        {/* Left Side - Logo and Nav Links */}
        <div className="flex items-center gap-8 z-20">
          <Link href="/" className="flex items-center gap-3 group transition-transform duration-300 hover:scale-[1.02]">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-all duration-300">
              <span className="text-xl font-black text-primary-foreground">C</span>
            </div>
            {/* Wordmark hidden on phones: with it, the signed-in buttons ran off a
                375 px screen and Sign Out was unreachable. */}
            <span className="hidden sm:inline text-2xl font-black tracking-tighter bg-gradient-to-r from-primary via-foreground to-accent bg-clip-text text-transparent group-hover:via-primary transition-all duration-300">
              CALMER
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  pathname === link.href
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right Auth */}
        <div className="flex items-center justify-end gap-1 sm:gap-3 z-10">
          {loading ? (
            <div className="h-9 w-20 animate-pulse rounded-md bg-secondary" />
          ) : user ? (
            <>
              <Button asChild variant={pathname === '/dashboard' ? 'secondary' : 'ghost'} size="sm" className="hidden md:inline-flex">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button asChild variant={pathname === '/settings' ? 'secondary' : 'ghost'} size="sm" className="hidden md:inline-flex">
                <Link href="/settings">Settings</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={handleSignOut} className="hidden md:inline-flex">
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/auth/login">Sign In</Link>
              </Button>
              <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Link href="/auth/sign-up">Get Started</Link>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </Button>
        </div>
      </nav>

      {menuOpen && (
        <div id="mobile-menu" className="border-t border-white/10 px-4 py-3 md:hidden">
          <ul className="flex flex-col gap-1 text-sm">
            {[...navLinks, ...(user ? [{ href: '/dashboard', label: 'Dashboard' }, { href: '/settings', label: 'Settings' }] : [])].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'block rounded-md px-3 py-2 font-medium',
                    pathname === link.href ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {user && (
              <li>
                <button type="button" onClick={handleSignOut} className="block w-full rounded-md px-3 py-2 text-left font-medium text-muted-foreground hover:bg-secondary/50">
                  Sign Out
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </header>
  )
}
