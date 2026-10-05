import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserMemories, saveUserMemory, deleteUserMemory } from '@/lib/services/memory'
import { MAX_MEMORY_CHARS, isSafeToRemember } from '@/lib/calmer/memory-extract'
import type { MemoryCategory } from '@/lib/types'

const MEMORY_CATEGORIES: MemoryCategory[] = ['trigger', 'relaxation', 'goal', 'stress_work', 'stress_family', 'stress_exam', 'hobby', 'other']

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const memories = await getUserMemories(supabase, user.id)
    return NextResponse.json({ memories })
  } catch (error) {
    // Log the detail server-side; never send DB/driver messages to the browser.
    console.error('[api/memories]', error)
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

    const body = await req.json().catch(() => null)
    const category = body?.category
    const text = typeof body?.memory_text === 'string' ? body.memory_text.trim() : ''
    if (!MEMORY_CATEGORIES.includes(category) || !text) {
      return NextResponse.json({ error: 'A category and some text are required' }, { status: 400 })
    }
    if (text.length > MAX_MEMORY_CHARS) {
      return NextResponse.json({ error: `Keep memories under ${MAX_MEMORY_CHARS} characters` }, { status: 400 })
    }
    // Memories are replayed into every future chat prompt: crisis language is
    // handled in the chat itself, with the safety pathway, never stored here.
    if (!isSafeToRemember(text)) {
      return NextResponse.json(
        { error: "That can't be saved as a memory. If you're struggling, the chat can help right now, or call Tele-MANAS at 14416." },
        { status: 400 },
      )
    }

    const memory = await saveUserMemory(supabase, user.id, category, text)
    if (!memory) {
      return NextResponse.json({ error: 'Failed to save memory' }, { status: 500 })
    }

    return NextResponse.json({ memory })
  } catch (error) {
    // Log the detail server-side; never send DB/driver messages to the browser.
    console.error('[api/memories]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const memoryId = searchParams.get('id')

    if (!memoryId) {
      return NextResponse.json({ error: 'Memory ID parameter is required' }, { status: 400 })
    }

    const success = await deleteUserMemory(supabase, user.id, memoryId)
    return NextResponse.json({ success })
  } catch (error) {
    // Log the detail server-side; never send DB/driver messages to the browser.
    console.error('[api/memories]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
