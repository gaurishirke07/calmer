import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// After a sign-up confirmation link (custom template). The link confirms the
// address but deliberately does not sign anyone in: a link can carry anyone's
// token, so the person signs in with their own password (see /auth/confirm).
export default function EmailConfirmedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md border-border/50 bg-card/50 text-center backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Email confirmed</CardTitle>
          <CardDescription>Your address is verified. Sign in with your email and password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
