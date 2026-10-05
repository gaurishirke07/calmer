import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserSessionsGrouped, createNewSession } from '@/lib/services/session'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const categorized = await getUserSessionsGrouped(supabase, user.id)
    return NextResponse.json({ sessions: categorized })
  } catch (error) {
    // Log the detail server-side; never send DB/driver messages to the browser.
    console.error('[api/sessions]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const title = (typeof body.title === 'string' && body.title.trim().slice(0, 100)) || 'New Conversation'

    const session = await createNewSession(supabase, user.id, title)
    if (!session) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    return NextResponse.json({ session })
  } catch (error) {
    // Log the detail server-side; never send DB/driver messages to the browser.
    console.error('[api/sessions]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
