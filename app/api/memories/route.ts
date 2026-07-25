import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserMemories, saveUserMemory, deleteUserMemory } from '@/lib/services/memory'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const memories = await getUserMemories(supabase, user.id)
    return NextResponse.json({ memories })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { category, memory_text } = await req.json()
    if (!category || !memory_text) {
      return NextResponse.json({ error: 'category and memory_text are required' }, { status: 400 })
    }

    const memory = await saveUserMemory(supabase, user.id, category, memory_text)
    if (!memory) {
      return NextResponse.json({ error: 'Failed to save memory' }, { status: 500 })
    }

    return NextResponse.json({ memory })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
