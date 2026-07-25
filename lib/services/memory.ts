import { SupabaseClient } from '@supabase/supabase-js'
import { UserMemory, MemoryCategory } from '@/lib/types'

export async function getUserMemories(supabase: SupabaseClient, userId: string): Promise<UserMemory[]> {
  const { data, error } = await supabase
    .from('user_memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user memories:', error)
    return []
  }
  return data || []
}

export async function saveUserMemory(
  supabase: SupabaseClient,
  userId: string,
  category: MemoryCategory,
  memoryText: string
): Promise<UserMemory | null> {
  const { data, error } = await supabase
    .from('user_memories')
    .insert({
      user_id: userId,
      category,
      memory_text: memoryText,
    })
    .select('*')
    .single()

  if (error) {
    console.error('Error saving user memory:', error)
    return null
  }
  return data
}

export async function deleteUserMemory(supabase: SupabaseClient, userId: string, memoryId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_memories')
    .delete()
    .eq('id', memoryId)
    .eq('user_id', userId)

  return !error
}

export function formatMemoriesForPrompt(memories: UserMemory[]): string {
  if (!memories || memories.length === 0) return 'No previous long-term memories recorded yet.'

  const grouped = memories.reduce((acc, mem) => {
    acc[mem.category] = acc[mem.category] || []
    acc[mem.category].push(mem.memory_text)
    return acc
  }, {} as Record<string, string[]>)

  let formatted = 'User Long-Term Memory & Profile Context:\n'
  for (const [category, items] of Object.entries(grouped)) {
    const categoryName = category.replace('_', ' ').toUpperCase()
    formatted += `- ${categoryName}: ${items.join('; ')}\n`
  }

  return formatted
}

/**
 * Auto-extract key long-term facts from a user message if present.
 * Looks for triggers, relaxation methods, work stress, exam stress, hobbies, goals.
 */
export async function autoExtractMemoriesFromMessage(
  supabase: SupabaseClient,
  userId: string,
  text?: string
): Promise<void> {
  if (!text || typeof text !== 'string') return
  const lower = text.toLowerCase()

  if (lower.includes('my goal') || lower.includes('i want to achieve') || lower.includes('trying to')) {
    await saveUserMemory(supabase, userId, 'goal', text.trim().slice(0, 150))
  } else if (lower.includes('work makes me') || lower.includes('boss') || lower.includes('deadline') || lower.includes('job stress')) {
    await saveUserMemory(supabase, userId, 'stress_work', text.trim().slice(0, 150))
  } else if (lower.includes('exam') || lower.includes('study') || lower.includes('college') || lower.includes('school')) {
    await saveUserMemory(supabase, userId, 'stress_exam', text.trim().slice(0, 150))
  } else if (lower.includes('family') || lower.includes('parents') || lower.includes('partner') || lower.includes('relationship')) {
    await saveUserMemory(supabase, userId, 'stress_family', text.trim().slice(0, 150))
  } else if (lower.includes('helps me calm') || lower.includes('i feel better when i') || lower.includes('walking') || lower.includes('music helps')) {
    await saveUserMemory(supabase, userId, 'relaxation', text.trim().slice(0, 150))
  } else if (lower.includes('i love') || lower.includes('my hobby') || lower.includes('in my free time')) {
    await saveUserMemory(supabase, userId, 'hobby', text.trim().slice(0, 150))
  }
}
