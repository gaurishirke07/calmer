import { SupabaseClient } from '@supabase/supabase-js'
import { UserMemory, MemoryCategory } from '@/lib/types'
import { capMemoriesForPrompt, extractMemory, isDuplicateMemory } from '@/lib/calmer/memory-extract'

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

  // Most recent few per category, bounded overall: the prompt must not grow
  // with every remembered line (memories arrive newest-first).
  const grouped = capMemoriesForPrompt(memories).reduce((acc, mem) => {
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
 * Remember an explicit first-person disclosure (a trigger, coping method, goal,
 * hobby, or a stressor stated with its subject) — see lib/calmer/memory-extract.ts
 * for what qualifies and why. The caller must only call this for messages the
 * risk check cleared. Exact duplicates within a category are skipped.
 */
export async function autoExtractMemoriesFromMessage(
  supabase: SupabaseClient,
  userId: string,
  text?: string
): Promise<void> {
  const found = extractMemory(text)
  if (!found) return
  const existing = await getUserMemories(supabase, userId)
  if (isDuplicateMemory(existing, found.category, found.text)) return
  await saveUserMemory(supabase, userId, found.category, found.text)
}
