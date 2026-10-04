import { describe, expect, it } from 'vitest'
import { safeNextPath } from './auth-redirect'

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/auth/update-password')).toBe('/auth/update-password')
    expect(safeNextPath('/support/accept?token=abc')).toBe('/support/accept?token=abc')
  })

  it('refuses anything that could leave the site', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'evil.example', 'javascript:alert(1)']) {
      expect(safeNextPath(bad)).toBe('/dashboard')
    }
  })

  it('falls back when missing', () => {
    expect(safeNextPath(null)).toBe('/dashboard')
    expect(safeNextPath('', '/chat')).toBe('/chat')
  })
})
