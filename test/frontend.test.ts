// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  resolveCurrentBranch,
  populateBranchSelect,
  formatBytes,
  groupByCategory,
  renderProjectList,
  renderProjectPage,
} from '../frontend/render'
import type { BranchesManifest, OutputFile, ProjectManifest } from '../src/types'

const branches: BranchesManifest = {
  branches: [
    { dir: 'main', ref: 'main' },
    { dir: 'dev', ref: 'dev' },
  ],
  defaultBranch: 'main',
  removed: [],
}

describe('resolveCurrentBranch', () => {
  it('prefers a valid requested branch', () => {
    expect(resolveCurrentBranch(branches, 'dev')).toBe('dev')
  })

  it('falls back to the default when the requested branch is gone', () => {
    expect(resolveCurrentBranch(branches, 'deleted')).toBe('main')
  })

  it('falls back to the first branch when there is no default', () => {
    expect(resolveCurrentBranch({ branches: [{ dir: 'x', ref: 'x' }], removed: [] }, 'gone')).toBe('x')
  })

  it('returns undefined when there are no branches', () => {
    expect(resolveCurrentBranch({ branches: [], removed: [] })).toBeUndefined()
  })
})

describe('populateBranchSelect', () => {
  let select: HTMLSelectElement
  beforeEach(() => {
    select = document.createElement('select')
  })

  it('adds an option per branch and selects the current one', () => {
    populateBranchSelect(select, branches, 'dev')
    expect(select.options).toHaveLength(2)
    expect(select.value).toBe('dev')
    expect(select.options[0]?.textContent).toBe('main')
    expect(select.disabled).toBe(false)
  })

  it('shows a disabled placeholder when there are no branches', () => {
    populateBranchSelect(select, { branches: [], removed: [] })
    expect(select.disabled).toBe(true)
    expect(select.options).toHaveLength(1)
  })
})

describe('formatBytes', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('groupByCategory', () => {
  it('orders preview categories before raw fabrication files', () => {
    const files: OutputFile[] = [
      { path: 'a.gbr', category: 'gerber' },
      { path: 'b.png', category: 'image' },
      { path: 'c.pdf', category: 'pdf' },
    ]
    expect(groupByCategory(files).map((group) => group.category)).toEqual(['image', 'pdf', 'gerber'])
  })
})

describe('renderProjectList', () => {
  it('renders a card per project linking with query params', () => {
    const container = document.createElement('div')
    renderProjectList(
      container,
      [
        { id: 'demo', name: 'Demo', source: 'demo' },
        { id: 'b2', name: 'Board 2', source: 'boards/b2' },
      ],
      'main',
    )
    const cards = container.querySelectorAll('a.project-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.getAttribute('href')).toBe('?branch=main&project=demo')
  })

  it('shows a message when there are no projects', () => {
    const container = document.createElement('div')
    renderProjectList(container, [], 'main')
    expect(container.querySelector('.message')).not.toBeNull()
  })
})

describe('renderProjectPage', () => {
  const manifest: ProjectManifest = {
    id: 'demo',
    name: 'Demo',
    source: 'demo',
    zip: 'demo.zip',
    generatedAt: '2026-06-30T00:00:00Z',
    files: [
      { path: 'board.png', category: 'image' },
      { path: 'model.step', category: 'step' },
      { path: 'bom.csv', category: 'bom', size: 2048 },
    ],
  }

  it('renders a download-all link, an inline image and a STEP mount with data-model', () => {
    const container = document.createElement('div')
    renderProjectPage(container, manifest, { base: 'main/demo/', branchDir: 'main' })
    expect(container.querySelector('a.download-zip')?.getAttribute('href')).toBe('main/demo/demo.zip')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('main/demo/board.png')
    expect(container.querySelector('.step-viewer')?.getAttribute('data-model')).toBe('main/demo/model.step')
  })
})
