import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionMessages, renameSession, deleteSession } from '@/lib/services/session'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { id: sessionId } = await params

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // RLS returns no rows for a deleted or foreign session, which would look
    // like an empty chat; say so, so the client can start a fresh one.
    const { data: owned } = await supabase
      .from('session')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!owned) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const messages = await getSessionMessages(supabase, user.id, sessionId)
    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Error loading session:', error)
    return NextResponse.json({ error: 'Could not load session' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { id: sessionId } = await params

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 100) : ''
    if (!title) {
      return NextResponse.json({ error: 'Title string is required' }, { status: 400 })
    }

    const success = await renameSession(supabase, user.id, sessionId, title)
    return NextResponse.json({ success })
  } catch (error) {
    // Log the detail server-side; never send DB/driver messages to the browser.
    console.error('[api/sessions/[id]]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { id: sessionId } = await params

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const success = await deleteSession(supabase, user.id, sessionId)
    return NextResponse.json({ success })
  } catch (error) {
    // Log the detail server-side; never send DB/driver messages to the browser.
    console.error('[api/sessions/[id]]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
