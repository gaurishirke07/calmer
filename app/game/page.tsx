import { Navigation } from '@/components/navigation'
import { AngerReleaseGame } from '@/components/game/anger-release-game'

export const metadata = {
  title: 'Release Anger - CALMER',
  description: 'Release your anger through our therapeutic interactive game.',
}

export default function GamePage() {
  return (
    <main className="min-h-screen">
      <Navigation />
      <section className="px-4 pt-24 pb-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Release Your Anger
            </h1>
            <p className="text-muted-foreground">
              Click, tap, and destroy to release built-up tension. Let it all out.
            </p>
          </div>
          <AngerReleaseGame />
        </div>
      </section>
    </main>
  )
}
