import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingSignalColumns, signalValuesOf, type SignalContribution } from './readiness'
import type { FaceModel } from './facial-affect'

/**
 * Save a readiness snapshot (emotional_state) together with the value of every
 * signal behind it and the face model that produced the face signal (migration
 * 017). Used by the game, chat and biometric routes so all three store the same
 * shape. If 017 hasn't been run yet, the snapshot is saved without those two
 * columns rather than lost.
 */
export async function insertSnapshot(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  contributions: SignalContribution[],
  faceModel: FaceModel | null = null,
): Promise<{ error: { message: string } | null }> {
  const signal_values = signalValuesOf(contributions)
  const face_model = signal_values.facialAffect !== undefined ? faceModel : null
  let { error } = await supabase.from('emotional_state').insert({ ...row, signal_values, face_model })
  if (isMissingSignalColumns(error)) {
    ;({ error } = await supabase.from('emotional_state').insert(row))
  }
  return { error }
}
