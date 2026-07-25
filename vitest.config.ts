import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Unit tests target the pure logic in lib/calmer (no DB / network / DOM),
// so the default node environment is all we need. The @/* alias mirrors
// tsconfig so imports resolve the same way as in the app.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', '_v2-reference/**'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
