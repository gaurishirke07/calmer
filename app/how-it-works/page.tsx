import { Navigation } from '@/components/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const steps = [
  {
    step: '01',
    title: 'Acknowledge Your Feelings',
    description: 'Recognize that anger is a natural emotion. CALMER provides a safe space for you to accept and express these feelings without judgment.',
    color: 'border-accent/50',
  },
  {
    step: '02',
    title: 'Release Through Play',
    description: 'Use our anger release game to physically express your frustration. Click, tap, and destroy virtual objects to release built-up tension in a healthy, satisfying way.',
    color: 'border-accent/50',
  },
  {
    step: '03',
    title: 'Reflect & Process',
    description: 'After releasing energy, your mind is more receptive. This is the perfect time to transition to reflection and deeper understanding.',
    color: 'border-primary/50',
  },
  {
    step: '04',
    title: 'Talk It Through',
    description: 'Connect with our AI therapist chatbox. Share your thoughts, explore the root causes of your anger, and receive compassionate, evidence-based guidance.',
    color: 'border-primary/50',
  },
  {
    step: '05',
    title: 'Track Your Journey',
    description: 'Monitor your progress over time. See patterns in your emotional health and celebrate your growth toward better anger management.',
    color: 'border-primary/50',
  },
]

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen">
      <Navigation />
      
      <section className="px-4 pt-32 pb-16">
        <div className="mx-auto max-w-4xl">
          <div className="mb-16 text-center">
            <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
              How CALMER Works
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              A scientifically-informed approach to anger management that combines 
              physical release with therapeutic conversation.
            </p>
          </div>

          <div className="mb-16">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-2xl">The Science Behind CALMER</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-muted-foreground">
                <p>
                  Anger triggers your body&apos;s fight-or-flight response, flooding your system with 
                  adrenaline and cortisol. While suppressing anger can lead to health problems, 
                  uncontrolled expression can damage relationships.
                </p>
                <p>
                  CALMER uses a two-phase approach: first, we provide a safe outlet for the physical 
                  energy of anger through our interactive game. Then, once your nervous system has 
                  calmed, our AI therapist helps you process the underlying emotions.
                </p>
                <p>
                  This approach is based on cognitive-behavioral principles and somatic therapy 
                  techniques, adapted for accessible, private self-help.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {steps.map((item, index) => (
              <Card 
                key={item.step} 
                className={`border-l-4 ${item.color} border-t-0 border-r-0 border-b-0 bg-card/50 backdrop-blur-sm transition-all hover:bg-card`}
              >
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-bold text-muted-foreground/50">{item.step}</span>
                    <CardTitle className="text-xl">{item.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {item.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-16 text-center">
            <h2 className="mb-4 text-2xl font-bold">Ready to Begin?</h2>
            <p className="mb-8 text-muted-foreground">
              Start your journey to better emotional wellness today.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/game">
                <Button size="lg" className="w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto">
                  Try the Game
                </Button>
              </Link>
              <Link href="/chat">
                <Button size="lg" variant="outline" className="w-full sm:w-auto bg-transparent">
                  Talk to AI Therapist
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
