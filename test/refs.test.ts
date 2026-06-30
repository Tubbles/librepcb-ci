import { describe, it, expect } from 'vitest'
import { sanitizeRefName, parseLsRemoteHeads } from '../src/refs'

describe('sanitizeRefName', () => {
  it('strips refs/heads and refs/tags prefixes', () => {
    expect(sanitizeRefName('refs/heads/main')).toBe('main')
    expect(sanitizeRefName('refs/tags/v1.0.0')).toBe('v1.0.0')
  })

  it('replaces slashes and unsafe characters with a single dash', () => {
    expect(sanitizeRefName('feature/new-thing')).toBe('feature-new-thing')
    expect(sanitizeRefName('feat/a//b')).toBe('feat-a-b')
  })

  it('trims leading dots and dashes so it is never a hidden directory', () => {
    expect(sanitizeRefName('.hidden')).toBe('hidden')
    expect(sanitizeRefName('--x--')).toBe('x')
  })

  it('falls back to "ref" when nothing usable remains', () => {
    expect(sanitizeRefName('///')).toBe('ref')
    expect(sanitizeRefName('...')).toBe('ref')
  })

  it('keeps dots, underscores and hyphens inside the name', () => {
    expect(sanitizeRefName('v1.2_rc-3')).toBe('v1.2_rc-3')
  })
})

describe('parseLsRemoteHeads', () => {
  it('extracts branch names and ignores tags', () => {
    const out = [
      'abc123\trefs/heads/main',
      'def456\trefs/heads/feature/x',
      '0badc0de\trefs/tags/v1.0.0',
    ].join('\n')
    expect(parseLsRemoteHeads(out)).toEqual(['main', 'feature/x'])
  })

  it('returns an empty array for empty input', () => {
    expect(parseLsRemoteHeads('')).toEqual([])
  })
})
