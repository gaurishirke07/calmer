// Lets the plain-Node analysis scripts import the app's TypeScript modules.
//
// Node strips TypeScript types natively (23.6+), but its ESM loader needs file
// extensions, while the app (like any Next.js codebase) imports siblings
// without them: `import { plausibleHeartRate } from './hrv-quality'`. This
// resolve hook retries a failed relative, extensionless import with `.ts`.
// Import it FIRST, before any lib/ module is loaded.
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../')
      const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier)
      if (err?.code === 'ERR_MODULE_NOT_FOUND' && relative && !hasExtension) {
        return nextResolve(`${specifier}.ts`, context)
      }
      throw err
    }
  },
})
