import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const features = [
  {
    title: 'Anger Release Game',
    description: 'An interactive canvas-based game where you can safely express and release intense emotions through satisfying destruction mechanics.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    color: 'bg-accent/10 text-accent',
  },
  {
    title: 'AI Therapist Chat',
    description: 'A compassionate AI companion trained to guide you through your emotions with evidence-based therapeutic techniques.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    color: 'bg-primary/10 text-primary',
  },
  {
    title: 'Track Your Progress',
    description: 'Monitor your emotional journey with detailed session history and insights on your path to better mental wellness.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    color: 'bg-primary/10 text-primary',
  },
  {
    title: 'Private & Secure',
    description: 'Your sessions are encrypted and private. Express yourself freely in a judgment-free space.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    color: 'bg-accent/10 text-accent',
  },
]

export function FeaturesSection() {
  return (
    <section className="relative py-28 px-4">
      {/* Section Separation: Centered Radial Light */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/10 blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            How CALMER Helps You
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            A two-phase approach to emotional wellness: release what no longer serves you, 
            then cultivate inner peace.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {features.map((feature) => (
            <Card 
              key={feature.title} 
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-card/40 backdrop-blur-xl transition-all duration-300 shadow-xl shadow-black/40 hover:border-primary/40 hover:bg-card/70 hover:shadow-primary/10 hover:-translate-y-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]"
            >
              <CardHeader>
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg ${feature.color} border border-white/10 shadow-sm`}>
                  {feature.icon}
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base text-muted-foreground/90">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
