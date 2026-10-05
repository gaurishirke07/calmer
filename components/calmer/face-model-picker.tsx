'use client'

import type { FaceModel } from '@/lib/calmer/facial-affect'

const OPTIONS: { value: FaceModel; label: string; hint: string }[] = [
  { value: 'face-api', label: 'Fast', hint: 'face-api · 0.5 MB · 4×/s' },
  { value: 'vit', label: 'Research-grade', hint: 'Hugging Face ViT · ≈57 MB once · 1×/s' },
]

/** Which on-device model reads the face (lib/calmer/facial-affect.ts). */
export function FaceModelPicker({ value, onChange }: { value: FaceModel; onChange: (m: FaceModel) => void }) {
  return (
    <div role="radiogroup" aria-label="Face model" className="flex gap-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md border px-1.5 py-1 text-[10px] font-semibold leading-tight transition-colors ${
            value === o.value
              ? 'border-white/60 bg-white/15 text-white'
              : 'border-white/15 bg-white/5 text-white/55 hover:bg-white/10'
          }`}
        >
          {o.label}
          <span className="block text-[9px] font-normal text-white/45">{o.hint}</span>
        </button>
      ))}
    </div>
  )
}
