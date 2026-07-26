import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

// Next.js core-web-vitals ruleset (native flat config in eslint-config-next 16).
// Kept deliberately lenient for now: the shadcn UI primitives, the reference
// .bak files, and the large never-linted canvas game component pre-date any
// linting, so a few noisy rules are relaxed so the pipeline is green and the
// signal stays useful. Tighten over time.
const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'components/ui/**', // shadcn-generated primitives
      '_v2-reference/**', // preserved v2 variants, not compiled
      'hardware/**', // standalone CommonJS Node scripts (own package.json)
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@next/next/no-img-element': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // perf hint (new in Next 16), not a correctness bug — several legacy /
      // generated components set state in an effect on mount; keep as a warning
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]

export default eslintConfig
