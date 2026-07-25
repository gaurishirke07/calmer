import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete user data. Deleting the session cascades to therapist_convo /
    // emotional_state / venting_interaction / biometric_reading / safety_flag.
    await Promise.all([
      supabase.from('session').delete().eq('user_id', user.id),
      supabase.from('hardware_device').delete().eq('user_id', user.id),
      supabase.from('user_memories').delete().eq('user_id', user.id),
      supabase.from('profiles').delete().eq('id', user.id),
    ])

    // Sign out user session
    await supabase.auth.signOut()

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
