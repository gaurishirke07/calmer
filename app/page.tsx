import { Navigation } from '@/components/navigation'
import { HeroSection } from '@/components/home/hero-section'
import { FeaturesSection } from '@/components/home/features-section'
import { CTASection } from '@/components/home/cta-section'
import { LandingBackground } from '@/components/home/landing-background'

export default function HomePage() {
  return (
    <main className="relative min-h-screen bg-[#050505] text-foreground selection:bg-teal-500/30 selection:text-teal-200 overflow-x-hidden">
      <LandingBackground />
      <div className="relative z-10">
        <Navigation />
        <HeroSection />
        <FeaturesSection />
        <CTASection />
      </div>
    </main>
  )
}
