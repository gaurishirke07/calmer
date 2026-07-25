import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserMoodAnalytics } from '@/lib/services/analytics'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const analytics = await getUserMoodAnalytics(supabase, user.id)
    return NextResponse.json({ analytics })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
