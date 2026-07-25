import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 pt-24 pb-16">
      {/* Background Section Lighting: Left Teal Glow & Right Coral Glow */}
      <div className="pointer-events-none absolute left-[-10%] top-1/4 h-[500px] w-[500px] rounded-full bg-teal-600/15 blur-[130px]" />
      <div className="pointer-events-none absolute right-[-10%] top-1/3 h-[500px] w-[500px] rounded-full bg-rose-500/10 blur-[130px]" />

      <div className="relative z-10 mx-auto max-w-5xl text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center rounded-full border border-primary/30 bg-card/60 px-5 py-2 text-sm font-medium text-foreground backdrop-blur-xl shadow-md shadow-primary/10 transition-all hover:border-primary/50">
          <span className="mr-2 inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
          Your mental wellness companion
        </div>

        {/* Hero Title with Animated Breathing Halo behind CALMER */}
        <div className="relative mb-6 inline-block w-full">
          <div 
            className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-teal-500/35 via-emerald-400/25 to-rose-400/30 blur-[90px] md:h-96 md:w-96"
            style={{ animation: 'hero-halo 18s ease-in-out infinite' }}
          />
          <h1 className="relative text-balance text-6xl font-black tracking-tighter sm:text-7xl md:text-8xl lg:text-9xl drop-shadow-md">
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent hover:scale-105 inline-block transition-transform duration-500 cursor-default">
              CALMER
            </span>
          </h1>
        </div>

        <h2 className="mb-8 text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl text-foreground">
          Release Your Anger.{' '}
          <span className="text-muted-foreground">
            Find Your Peace.
          </span>
        </h2>

        <p className="mx-auto mb-12 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl leading-relaxed">
          A therapeutic platform that helps you express and release intense emotions 
          through an interactive game, then guides you to tranquility with an AI-powered 
          therapist chat.
        </p>

        <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
          <Link href="/game">
            <Button 
              size="lg" 
              className="group relative w-full overflow-hidden rounded-full bg-gradient-to-r from-accent via-primary to-accent px-8 py-7 text-lg font-bold text-accent-foreground shadow-2xl shadow-accent/25 transition-all duration-300 hover:scale-105 hover:shadow-accent/40 sm:w-auto mt-2"
            >
              <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
              <span className="relative mr-2">Release Anger</span>
              <svg className="relative h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </Button>
          </Link>
          <Link href="/chat">
            <Button 
              size="lg" 
              variant="outline"
              className="group relative w-full rounded-full border border-primary/50 bg-card/60 px-8 py-7 text-lg font-bold text-foreground hover:text-white hover:border-primary hover:bg-teal-500/20 backdrop-blur-xl shadow-lg shadow-primary/10 hover:shadow-[0_0_30px_rgba(20,184,166,0.35)] transition-all duration-300 hover:scale-105 sm:w-auto mt-2 cursor-pointer"
            >
              <span className="relative mr-2 text-foreground group-hover:text-white transition-colors duration-300">Find Peace</span>
              <svg className="h-5 w-5 text-primary group-hover:text-white transition-all duration-300 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </Button>
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-8 rounded-2xl border border-white/10 bg-card/30 p-6 backdrop-blur-xl shadow-xl shadow-black/30">
          <div>
            <p className="text-3xl font-bold text-primary">100%</p>
            <p className="text-sm text-muted-foreground">Private & Secure</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary">24/7</p>
            <p className="text-sm text-muted-foreground">Available</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary">AI</p>
            <p className="text-sm text-muted-foreground">Powered Support</p>
          </div>
        </div>
      </div>
    </section>
  )
}
