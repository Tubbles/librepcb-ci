import { describe, it, expect } from 'vitest'
import { parseProjects, projectIdentity } from '../src/projects'

describe('parseProjects', () => {
  it('splits on newlines and commas, trims, drops blanks and comments', () => {
    const input = `
      boards/a.lpp
      boards/b.lpp, boards/c.lpp
      # a comment
    `
    expect(parseProjects(input)).toEqual(['boards/a.lpp', 'boards/b.lpp', 'boards/c.lpp'])
  })

  it('returns an empty array for empty or whitespace input', () => {
    expect(parseProjects('   \n  ')).toEqual([])
  })

  it('handles a single entry', () => {
    expect(parseProjects('demo')).toEqual(['demo'])
  })
})

describe('projectIdentity', () => {
  it('uses the folder basename and sanitizes the id', () => {
    expect(projectIdentity('boards/Gerber Test')).toEqual({ id: 'Gerber-Test', name: 'Gerber Test' })
  })

  it('strips a trailing slash', () => {
    expect(projectIdentity('demo/')).toEqual({ id: 'demo', name: 'demo' })
  })

  it('strips .lpp and .lppz extensions', () => {
    expect(projectIdentity('a/MyBoard.lppz')).toEqual({ id: 'MyBoard', name: 'MyBoard' })
    expect(projectIdentity('MyBoard.lpp')).toEqual({ id: 'MyBoard', name: 'MyBoard' })
  })
})
