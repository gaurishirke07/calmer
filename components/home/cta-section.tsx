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
              Join thousands of others who have found healthier ways to manage their emotions. 
              Start with releasing anger or jump straight to finding peace.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/auth/sign-up">
                <Button size="lg" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-xl shadow-primary/20 sm:w-auto transition-transform hover:scale-105">
                  Create Free Account
                </Button>
              </Link>
              <Link href="/how-it-works">
                <Button size="lg" variant="outline" className="w-full sm:w-auto border-white/20 bg-white/5 backdrop-blur-md hover:bg-white/10 transition-transform hover:scale-105">
                  Learn More
                </Button>
              </Link>
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
                A therapeutic wellness platform helping you safely express emotions, release anger, and cultivate persistent inner peace.
              </p>
              {/* Social Media Icons */}
              <div className="flex items-center gap-3 pt-1">
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="rounded-lg border border-white/10 bg-card/40 p-2 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                </a>
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="rounded-lg border border-white/10 bg-card/40 p-2 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                </a>
                <a href="mailto:support@calmer.app" aria-label="Email" className="rounded-lg border border-white/10 bg-card/40 p-2 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
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
              <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">Legal & Support</h3>
              <ul className="space-y-2 text-xs text-muted-foreground/80">
                <li><span className="cursor-pointer transition-colors hover:text-primary">Privacy Policy</span></li>
                <li><span className="cursor-pointer transition-colors hover:text-primary">Terms of Service</span></li>
                <li><span className="cursor-pointer transition-colors hover:text-primary">Crisis Support (988)</span></li>
              </ul>
            </div>

            {/* Column 4: Platform Status */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">Wellness Status</h3>
              <div className="rounded-xl border border-white/10 bg-card/30 p-4 backdrop-blur-xl shadow-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-teal-400 mb-1">
                  <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
                  All Systems Operational
                </div>
                <p className="text-xs text-muted-foreground/70">
                  Private, encrypted, and accessible anytime.
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
