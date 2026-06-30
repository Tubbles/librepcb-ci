import { describe, it, expect } from 'vitest'
import { reconcileBranches } from '../src/pages'

describe('reconcileBranches', () => {
  it('keeps live branches, always keeps current, removes stale folders', () => {
    const result = reconcileBranches({
      existingDirs: ['main', 'old-feature', 'feature-x'],
      liveRefs: ['main', 'feature/x'],
      currentRef: 'main',
      defaultBranch: 'main',
    })
    expect(result.removed).toEqual(['old-feature'])
    expect(result.branches.map((branch) => branch.dir).sort()).toEqual(['feature-x', 'main'])
    expect(result.defaultBranch).toBe('main')
  })

  it('adds the current ref even if it was never published before', () => {
    const result = reconcileBranches({
      existingDirs: ['main'],
      liveRefs: ['main', 'dev'],
      currentRef: 'dev',
    })
    expect(result.branches.map((branch) => branch.dir).sort()).toEqual(['dev', 'main'])
    expect(result.removed).toEqual([])
  })

  it('keeps the current ref when it is a tag absent from liveRefs', () => {
    const result = reconcileBranches({
      existingDirs: [],
      liveRefs: ['main'],
      currentRef: 'refs/tags/v1.0.0',
    })
    expect(result.branches.map((branch) => branch.dir)).toContain('v1.0.0')
  })

  it('maps a sanitized folder back to its original ref name', () => {
    const result = reconcileBranches({
      existingDirs: ['feature-x'],
      liveRefs: ['feature/x'],
      currentRef: 'feature/x',
    })
    expect(result.branches.find((branch) => branch.dir === 'feature-x')?.ref).toBe('feature/x')
  })
})
