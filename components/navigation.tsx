'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

export function Navigation() {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
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
    window.location.href = '/'
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
            <span className="text-2xl font-black tracking-tighter bg-gradient-to-r from-primary via-foreground to-accent bg-clip-text text-transparent group-hover:via-primary transition-all duration-300">
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
        <div className="flex items-center justify-end gap-3 z-10">
          {loading ? (
            <div className="h-9 w-20 animate-pulse rounded-md bg-secondary" />
          ) : user ? (
            <>
              <Link href="/dashboard">
                <Button variant={pathname === '/dashboard' ? 'secondary' : 'ghost'} size="sm">
                  Dashboard
                </Button>
              </Link>
              <Link href="/settings">
                <Button variant={pathname === '/settings' ? 'secondary' : 'ghost'} size="sm">
                  Settings
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link href="/auth/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/auth/sign-up">
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
