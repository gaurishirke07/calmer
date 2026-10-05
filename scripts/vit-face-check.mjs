/**
 * Offline check of the research-grade face model (Hugging Face ViT) — the same
 * model and weights the browser loads (components/calmer/face-tracker.tsx).
 * Classifies a few public portrait photos and shows the mapped valence, so the
 * label mapping and the q4 weights can be verified without a webcam.
 *
 * Usage:  node --no-warnings scripts/vit-face-check.mjs [imageUrl ...]
 * Needs:  Node 23.6+, devDependency @huggingface/transformers (first run
 *         downloads ~57 MB into the transformers.js cache).
 */
import './ts-imports.mjs' // first: lets Node resolve the app's extensionless TS imports
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pipeline } from '@huggingface/transformers'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { VIT_FACE_MODEL, facialValence, labelScoresToExpressions, topExpression } = await import(
  pathToFileURL(join(ROOT, 'lib/calmer/facial-affect.ts')).href
)

const SAMPLES = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main'
const images = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [`${SAMPLES}/portrait-of-woman.jpg`, `${SAMPLES}/woman-with-afro.jpg`, `${SAMPLES}/ryan-gosling.jpg`]

const t0 = Date.now()
const classify = await pipeline('image-classification', VIT_FACE_MODEL, { dtype: 'q4' })
console.log(`loaded ${VIT_FACE_MODEL} (q4) in ${((Date.now() - t0) / 1000).toFixed(1)} s`)

for (const url of images) {
  const t = Date.now()
  const out = await classify(url, { top_k: 7 })
  const expressions = labelScoresToExpressions(out)
  const total = Object.values(expressions).reduce((a, b) => a + b, 0)
  const top = topExpression(expressions)
  console.log(
    `${url.split('/').pop().padEnd(26)} top: ${top?.label} ${(100 * top?.score).toFixed(0)}%` +
      `  valence ${facialValence(expressions)?.toFixed(2)}  (probabilities sum ${total.toFixed(2)}, ${Date.now() - t} ms)`,
  )
}
