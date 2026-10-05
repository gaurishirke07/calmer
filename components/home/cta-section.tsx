import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function CTASection() {
  return (
    <section className="relative py-28 px-4">
      {/* Background Section Lighting: Stronger Blurred Gradient behind CTA */}
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-teal-500/20 via-emerald-500/15 to-rose-400/20 blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-card/60 via-card/40 to-card/60 p-8 sm:p-14 backdrop-blur-2xl shadow-2xl shadow-black/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
          {/* Decorative blurred gradient elements */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-teal-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-rose-500/20 blur-3xl" />
          
          <div className="relative z-10 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to Start Your Journey?
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-muted-foreground/90 leading-relaxed">
              Start with releasing anger, or go straight to reflecting with the AI companion.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-xl shadow-primary/20 sm:w-auto transition-transform hover:scale-105">
                <Link href="/auth/sign-up">Create Free Account</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto border-white/20 bg-white/5 backdrop-blur-md hover:bg-white/10 transition-transform hover:scale-105">
                <Link href="/how-it-works">Learn More</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Glowing Gradient Divider */}
        <div className="relative mt-24 w-full">
          <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-teal-500/40 to-transparent" />
          <div className="absolute left-1/2 -top-12 h-24 w-72 -translate-x-1/2 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />
        </div>

        {/* Premium Modern Footer */}
        <footer className="relative z-10 pt-12 pb-12 transition-opacity duration-700">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {/* Column 1: Brand & Logo */}
            <div className="space-y-4 lg:col-span-1">
              <Link href="/" className="inline-flex items-center gap-2">
                <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-2xl font-black tracking-tighter text-transparent">
                  CALMER
                </span>
              </Link>
              <p className="text-xs leading-relaxed text-muted-foreground/80">
                A research prototype for safely releasing anger and reflecting on it with an AI companion. Not therapy, and not a substitute for professional care.
              </p>
              {/* Social Media Icons */}
              <div className="flex items-center gap-3 pt-1">
                <a href="https://github.com/gaurishirke07/calmer" target="_blank" rel="noopener noreferrer" aria-label="CALMER source code on GitHub" className="rounded-lg border border-white/10 bg-card/40 p-2 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                </a>
              </div>
            </div>

            {/* Column 2: Quick Links */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">Navigation</h3>
              <ul className="space-y-2 text-xs text-muted-foreground/80">
                <li><Link href="/" className="transition-colors hover:text-primary">Home</Link></li>
                <li><Link href="/how-it-works" className="transition-colors hover:text-primary">How It Works</Link></li>
                <li><Link href="/game" className="transition-colors hover:text-primary">Release Anger</Link></li>
                <li><Link href="/chat" className="transition-colors hover:text-primary">Find Peace</Link></li>
              </ul>
            </div>

            {/* Column 3: Legal & Resources */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">Support</h3>
              <ul className="space-y-2 text-xs text-muted-foreground/80">
                <li><a href="tel:14416" className="transition-colors hover:text-primary">Crisis support: Tele-MANAS 14416 (free, 24×7)</a></li>
                <li>In immediate danger: contact local emergency services</li>
              </ul>
            </div>

            {/* Column 4: Platform Status */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">Your Data</h3>
              <div className="rounded-xl border border-white/10 bg-card/30 p-4 backdrop-blur-xl shadow-lg">
                <p className="text-xs text-muted-foreground/70">
                  Your data stays yours — export or delete it anytime.
                </p>
              </div>
            </div>
          </div>

          {/* Copyright Bar */}
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-muted-foreground/70 sm:flex-row">
            <p>© 2026 CALMER. Designed to help people find peace.</p>
            <p>Built with care for your mental wellbeing.</p>
          </div>
        </footer>
      </div>
    </section>
  )
}
