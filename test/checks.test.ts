import { describe, it, expect } from 'vitest'
import { truncateOutput, summarizeCheck } from '../src/checks'

describe('truncateOutput', () => {
  it('returns short output unchanged', () => {
    expect(truncateOutput('a\nb\nc')).toBe('a\nb\nc')
  })

  it('truncates long output and notes the remaining count', () => {
    const out = Array.from({ length: 55 }, (_, index) => `line ${index}`).join('\n')
    const result = truncateOutput(out, 50)
    expect(result.split('\n')).toHaveLength(51)
    expect(result).toContain('… (5 more lines)')
  })

  it('uses the singular for a single remaining line', () => {
    const out = Array.from({ length: 51 }, (_, index) => `l${index}`).join('\n')
    expect(truncateOutput(out, 50)).toContain('… (1 more line)')
  })
})

describe('summarizeCheck', () => {
  it('passes on exit 0 and fails otherwise', () => {
    expect(summarizeCheck({ tool: 'ERC+DRC', exitCode: 0, output: '' }).passed).toBe(true)
    expect(summarizeCheck({ tool: 'ERC+DRC', exitCode: 1, output: 'x' }).passed).toBe(false)
  })
})
