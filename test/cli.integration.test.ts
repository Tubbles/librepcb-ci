import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { fileURLToPath } from 'node:url'
import type { ProjectManifest, ProjectsManifest, BranchesManifest } from '../src/types'

// Drives the bundled runtime (dist/cli.cjs) end to end without docker by using
// install-method=custom with a fake librepcb-cli. Covers the side-effecting
// orchestration that the pure unit tests cannot: argv construction, output
// collection, zipping, manifest writing and Pages assembly.

const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(here, '..')
const cli = path.join(repoRoot, 'dist', 'cli.cjs')

function workspace(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'librepcb-ci-'))
  // @actions/core writes outputs to this file and requires it to exist.
  fs.writeFileSync(path.join(ws, 'gh_output'), '')
  return ws
}

beforeAll(() => {
  // Ensure the bundle under test reflects the current sources.
  const build = spawnSync('node', ['scripts/build.mjs'], { cwd: repoRoot, encoding: 'utf8' })
  expect(build.status, build.stdout + build.stderr).toBe(0)
})

describe('cli run (no docker)', () => {
  it('runs jobs via a custom command, then collects, zips and writes manifests', () => {
    const ws = workspace()
    const fakeCli = path.join(ws, 'fake-cli.sh')
    fs.writeFileSync(
      fakeCli,
      [
        '#!/usr/bin/env bash',
        'set -e',
        'outdir=""',
        'while [ $# -gt 0 ]; do',
        '  if [ "$1" = "--outdir" ]; then outdir="$2"; shift 2; else shift; fi',
        'done',
        'mkdir -p "$outdir/gerber"',
        'echo "G04 fake*" > "$outdir/gerber/board.gbr"',
        'printf "ref,qty\\nR1,1\\n" > "$outdir/bom.csv"',
        'echo png > "$outdir/board.png"',
      ].join('\n'),
      { mode: 0o755 },
    )
    fs.mkdirSync(path.join(ws, 'demo'))
    fs.writeFileSync(path.join(ws, 'demo', 'project.lpp'), 'LIBREPCB-PROJECT')

    const result = spawnSync('node', [cli, 'run'], {
      cwd: ws,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_WORKSPACE: ws,
        GITHUB_ACTION_PATH: repoRoot,
        GITHUB_OUTPUT: path.join(ws, 'gh_output'),
        LIBREPCB_CI_PROJECTS: 'demo',
        LIBREPCB_CI_INSTALL_METHOD: 'custom',
        LIBREPCB_CI_CLI_COMMAND: fakeCli,
        LIBREPCB_CI_RUN_CHECKS: 'false',
        LIBREPCB_CI_OUTPUT_DIR: 'out',
      },
    })
    expect(result.status, result.stdout + result.stderr).toBe(0)

    const projectDir = path.join(ws, 'out', 'demo')
    const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, 'manifest.json'), 'utf8')) as ProjectManifest
    expect(manifest.id).toBe('demo')
    expect(manifest.zip).toBe('demo.zip')
    expect(fs.existsSync(path.join(projectDir, 'demo.zip'))).toBe(true)
    const categories = manifest.files.map((file) => file.category)
    expect(categories).toContain('gerber')
    expect(categories).toContain('bom')
    expect(categories).toContain('image')

    const projects = JSON.parse(
      fs.readFileSync(path.join(ws, 'out', 'projects.json'), 'utf8'),
    ) as ProjectsManifest
    expect(projects.projects[0]?.id).toBe('demo')
  })

  it('fails the run when a fatal job invocation fails', () => {
    const ws = workspace()
    const failingCli = path.join(ws, 'fail.sh')
    fs.writeFileSync(failingCli, '#!/usr/bin/env bash\nexit 3\n', { mode: 0o755 })
    fs.mkdirSync(path.join(ws, 'demo'))
    fs.writeFileSync(path.join(ws, 'demo', 'project.lpp'), 'LIBREPCB-PROJECT')

    const result = spawnSync('node', [cli, 'run'], {
      cwd: ws,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_WORKSPACE: ws,
        GITHUB_ACTION_PATH: repoRoot,
        GITHUB_OUTPUT: path.join(ws, 'gh_output'),
        LIBREPCB_CI_PROJECTS: 'demo',
        LIBREPCB_CI_INSTALL_METHOD: 'custom',
        LIBREPCB_CI_CLI_COMMAND: failingCli,
        LIBREPCB_CI_RUN_CHECKS: 'false',
        LIBREPCB_CI_OUTPUT_DIR: 'out',
      },
    })
    expect(result.status).not.toBe(0)
  })
})

describe('cli assemble-pages (no docker)', () => {
  it('assembles a pages tree with branches.json, site assets and the branch folder', () => {
    const ws = workspace()
    fs.mkdirSync(path.join(ws, 'out', 'demo'), { recursive: true })
    fs.writeFileSync(
      path.join(ws, 'out', 'projects.json'),
      JSON.stringify({ projects: [{ id: 'demo', name: 'demo', source: 'demo' }] }),
    )
    fs.writeFileSync(path.join(ws, 'out', 'demo', 'manifest.json'), '{}')

    const result = spawnSync('node', [cli, 'assemble-pages'], {
      cwd: ws,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_WORKSPACE: ws,
        GITHUB_ACTION_PATH: repoRoot,
        GITHUB_OUTPUT: path.join(ws, 'gh_output'),
        GITHUB_REF_NAME: 'main',
        GITHUB_REPOSITORY: 'Tubbles/librepcb-ci',
        GITHUB_REPOSITORY_OWNER: 'Tubbles',
        LIBREPCB_CI_OUTPUT_DIR: 'out',
        LIBREPCB_CI_PAGES_DIR: 'pages-out',
        LIBREPCB_CI_DEFAULT_BRANCH: 'main',
      },
    })
    expect(result.status, result.stdout + result.stderr).toBe(0)

    const pagesOut = path.join(ws, 'pages-out')
    expect(fs.existsSync(path.join(pagesOut, 'index.html'))).toBe(true)
    expect(fs.existsSync(path.join(pagesOut, 'app.js'))).toBe(true)
    expect(fs.existsSync(path.join(pagesOut, '.nojekyll'))).toBe(true)
    expect(fs.existsSync(path.join(pagesOut, 'main', 'projects.json'))).toBe(true)

    const branches = JSON.parse(fs.readFileSync(path.join(pagesOut, 'branches.json'), 'utf8')) as BranchesManifest
    expect(branches.branches.map((branch) => branch.dir)).toContain('main')
  })
})
