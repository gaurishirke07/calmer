'use client'

// Loader for the research-grade face model: a Hugging Face ViT run on-device
// with transformers.js (see lib/calmer/facial-affect.ts VIT_FACE_MODEL).
//
// transformers.js is loaded from the jsdelivr CDN at a pinned version rather
// than bundled: the npm package also pulls in onnxruntime-node (a native
// server binary) that must never reach the Vercel functions, and the browser
// build fetches its WebAssembly runtime from the same CDN anyway. The model
// weights (~57 MB, q4) come from huggingface.co and are cached by the browser
// after the first load. Frames never leave the device.

import { VIT_FACE_MODEL } from '@/lib/calmer/facial-affect'

// jsdelivr's +esm build rewrites transformers.js's own imports (onnxruntime-web)
// to CDN URLs; the plain dist file needs a bundler to resolve them.
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm'

type LabelScores = { label: string; score: number }[]
export interface VitFaceClassifier {
  classify: (canvas: HTMLCanvasElement) => Promise<LabelScores>
  device: 'webgpu' | 'wasm'
}

let loading: Promise<VitFaceClassifier> | null = null

/** Loads once per page; `onProgress` gets 0–100 while the weights download. */
export function loadVitFace(onProgress?: (percent: number) => void): Promise<VitFaceClassifier> {
  if (loading) return loading
  loading = (async () => {
    const tf = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ TRANSFORMERS_URL)
    tf.env.allowLocalModels = false
    const progress_callback = (p: { status?: string; file?: string; progress?: number }) => {
      if (p.status === 'progress' && p.file?.endsWith('.onnx') && typeof p.progress === 'number') {
        onProgress?.(Math.round(p.progress))
      }
    }
    const make = (device: 'webgpu' | 'wasm') =>
      tf.pipeline('image-classification', VIT_FACE_MODEL, { dtype: 'q4', device, progress_callback })

    // The GPU path is much faster where it exists; fall back to WebAssembly.
    let device: 'webgpu' | 'wasm' = 'gpu' in navigator ? 'webgpu' : 'wasm'
    let pipe
    try {
      pipe = await make(device)
    } catch (err) {
      if (device !== 'webgpu') throw err
      console.warn('[vit-face] WebGPU unavailable, using WebAssembly:', (err as Error)?.message)
      device = 'wasm'
      pipe = await make(device)
    }
    return {
      device,
      classify: async (canvas: HTMLCanvasElement) =>
        (await pipe(tf.RawImage.fromCanvas(canvas), { top_k: 7 })) as LabelScores,
    }
  })()
  // A failed load (offline, blocked) must be retryable on the next toggle.
  loading.catch(() => {
    loading = null
  })
  return loading
}
