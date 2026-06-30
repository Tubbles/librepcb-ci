import { describe, it, expect } from 'vitest'
import { categorizeOutput, buildProjectManifest } from '../src/outputs'

describe('categorizeOutput', () => {
  it.each([
    ['board.gbr', 'gerber'],
    ['top.gtl', 'gerber'],
    ['outline.gko', 'gerber'],
    ['copper.g1', 'gerber'],
    ['inner.gm2', 'gerber'],
    ['drill.drl', 'drill'],
    ['drill.xln', 'drill'],
    ['MyProject_BOM.csv', 'bom'],
    ['MyProject_pnp_top.csv', 'pnp'],
    ['positions.csv', 'pnp'],
    ['board.png', 'image'],
    ['schematic.svg', 'image'],
    ['schematic.pdf', 'pdf'],
    ['model.step', 'step'],
    ['model.stp', 'step'],
    ['ibom.html', 'interactive-bom'],
    ['netlist.ipc', 'netlist'],
    ['outputs.zip', 'archive'],
    ['project.lppz', 'archive'],
    ['notes.md', 'other'],
    ['noext', 'other'],
  ] as const)('classifies %s as %s', (path, expected) => {
    expect(categorizeOutput(path)).toBe(expected)
  })
})

describe('buildProjectManifest', () => {
  it('categorizes files and sorts them by path', () => {
    const manifest = buildProjectManifest({
      id: 'demo',
      name: 'Demo',
      source: 'demo',
      files: [{ path: 'b.pdf' }, { path: 'a.gbr', size: 10 }],
      zip: 'demo.zip',
    })
    expect(manifest.files.map((file) => file.path)).toEqual(['a.gbr', 'b.pdf'])
    expect(manifest.files[0]).toMatchObject({ path: 'a.gbr', category: 'gerber', size: 10 })
    expect(manifest.zip).toBe('demo.zip')
  })
})
