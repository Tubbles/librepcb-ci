// Runtime entry point invoked by action.yml steps as `node dist/cli.cjs <sub>`.
// All decision logic lives in the pure modules (planner, pages, outputs, ...);
// this file only performs the side effects: running the CLI, collecting and
// zipping outputs, and assembling the Pages tree. Inputs arrive as
// LIBREPCB_CI_* environment variables set by action.yml.

import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import * as core from '@actions/core'
import { ZipArchive } from 'archiver'

import { parseProjects, projectIdentity } from './projects'
import { planInvocations, buildDockerRunArgs, type Invocation } from './planner'
import { buildProjectManifest } from './outputs'
import { reconcileBranches } from './pages'
import { parseLsRemoteHeads, sanitizeRefName } from './refs'
import { summarizeCheck } from './checks'
import type { ProjectManifest, ProjectsManifest, ProjectSummary } from './types'

function env(name: string, fallback = ''): string {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

function boolEnv(name: string): boolean {
  return /^(1|true|yes)$/i.test(env(name).trim())
}

function listEnv(name: string): string[] {
  return env(name)
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

/**
 * Resolve a project input to the path librepcb-cli expects. `open-project`
 * requires the `.lpp`/`.lppz` project file, not the containing directory, so a
 * directory input is resolved to the single `.lpp` file it contains.
 */
function resolveProjectFile(workspace: string, project: string): string {
  if (/\.(lpp|lppz)$/i.test(project)) return project
  const dir = path.resolve(workspace, project)
  let entries: string[] = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    throw new Error(`Project path '${project}' does not exist.`)
  }
  const projectFile = entries.find((entry) => entry.toLowerCase().endsWith('.lpp'))
  if (!projectFile) {
    throw new Error(
      `No .lpp file found in '${project}'. Point the projects input at the directory containing a *.lpp file, or at the .lpp/.lppz file directly.`,
    )
  }
  return path.posix.join(project, projectFile)
}

interface CollectedFile {
  /** Path relative to the project's output dir, POSIX separators. */
  rel: string
  size: number
}

/** Recursively list regular files under `dir` with their sizes. */
async function listFiles(dir: string): Promise<CollectedFile[]> {
  const files: CollectedFile[] = []
  async function walk(current: string): Promise<void> {
    const entries = await fsp.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      // Skip internal markers and hidden files (e.g. LibrePCB's .librepcb-output);
      // they are not deliverables and only clutter the preview listing.
      if (entry.name.startsWith('.')) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        const stat = await fsp.stat(full)
        files.push({ rel: path.relative(dir, full).split(path.sep).join('/'), size: stat.size })
      }
    }
  }
  await walk(dir)
  return files
}

/** Zip the given files (relative to srcDir) into destZip. */
function zipFiles(srcDir: string, destZip: string, files: CollectedFile[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destZip)
    const archive = new ZipArchive({ zlib: { level: 9 } })
    output.on('close', () => resolve())
    archive.on('error', reject)
    archive.pipe(output)
    for (const file of files) archive.file(path.join(srcDir, file.rel), { name: file.rel })
    void archive.finalize()
  })
}

interface CliRunOptions {
  invocation: Invocation
  installMethod: string
  image: string
  version: string
  workspace: string
  appImagePath: string
  customCommand: string
  uid?: number
  gid?: number
}

/** Run one librepcb-cli invocation via the chosen install method. */
function runCli(opts: CliRunOptions): { status: number; output: string } {
  let command: string
  let args: string[]
  if (opts.installMethod === 'appimage') {
    command = 'xvfb-run'
    args = ['-a', opts.appImagePath, ...opts.invocation.args]
  } else if (opts.installMethod === 'custom') {
    command = opts.customCommand || 'librepcb-cli'
    args = opts.invocation.args
  } else {
    command = 'docker'
    args = buildDockerRunArgs({
      image: opts.image,
      version: opts.version,
      workdir: opts.workspace,
      uid: opts.uid,
      gid: opts.gid,
      cliArgs: opts.invocation.args,
    })
  }
  core.info(`$ ${command} ${args.join(' ')}`)
  const result: SpawnSyncReturns<string> = spawnSync(command, args, {
    cwd: opts.workspace,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const output = (result.stdout ?? '') + (result.stderr ?? '')
  if (output) process.stdout.write(output)
  return { status: result.status ?? 1, output }
}

/** Download a pinned LibrePCB AppImage and make it executable (appimage mode). */
async function setupAppImage(version: string, workspace: string): Promise<string> {
  const dir = path.join(workspace, '.librepcb-ci')
  await fsp.mkdir(dir, { recursive: true })
  const dest = path.join(dir, 'librepcb-cli')
  const url = `https://download.librepcb.org/releases/${version}/librepcb-${version}-linux-x86_64.AppImage`
  core.info(`Downloading ${url}`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download AppImage: HTTP ${response.status}`)
  await fsp.writeFile(dest, Buffer.from(await response.arrayBuffer()))
  await fsp.chmod(dest, 0o755)
  // Avoid needing FUSE on the runner.
  process.env.APPIMAGE_EXTRACT_AND_RUN = '1'
  return dest
}

async function run(): Promise<void> {
  const workspace = env('GITHUB_WORKSPACE', process.cwd())
  const projects = parseProjects(env('LIBREPCB_CI_PROJECTS'))
  if (projects.length === 0) {
    core.setFailed('No projects configured. Set the `projects` input.')
    return
  }

  const version = env('LIBREPCB_CI_VERSION', '2.1.1')
  const installMethod = env('LIBREPCB_CI_INSTALL_METHOD', 'docker')
  const image = env('LIBREPCB_CI_IMAGE', 'librepcb/librepcb-cli')
  const customCommand = env('LIBREPCB_CI_CLI_COMMAND')
  const runChecks = boolEnv('LIBREPCB_CI_RUN_CHECKS')
  const checksFatal = boolEnv('LIBREPCB_CI_CHECKS_FATAL')
  const usePreviewJobs = boolEnv('LIBREPCB_CI_USE_PREVIEW_JOBS')
  const boards = listEnv('LIBREPCB_CI_BOARDS')
  const variants = listEnv('LIBREPCB_CI_VARIANTS')
  const outputRoot = env('LIBREPCB_CI_OUTPUT_DIR', 'librepcb-ci-output')
  const actionPath = env('GITHUB_ACTION_PATH', process.cwd())

  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined
  const gid = typeof process.getgid === 'function' ? process.getgid() : undefined

  const absOutputRoot = path.resolve(workspace, outputRoot)
  await fsp.rm(absOutputRoot, { recursive: true, force: true })
  await fsp.mkdir(absOutputRoot, { recursive: true })

  const appImagePath = installMethod === 'appimage' ? await setupAppImage(version, workspace) : ''

  // Stage the preview jobs file inside the workspace (so the container can read
  // it), outside the output root (so it is not published).
  let previewJobsFile: string | undefined
  if (usePreviewJobs) {
    const source = env('LIBREPCB_CI_PREVIEW_JOBS_FILE') || path.join(actionPath, 'jobs', 'preview-jobs.lp')
    previewJobsFile = '.librepcb-ci-preview-jobs.lp'
    await fsp.copyFile(source, path.resolve(workspace, previewJobsFile))
  }

  const built: ProjectSummary[] = []
  let failed = false

  for (const project of projects) {
    const { id, name } = projectIdentity(project)
    const projectOutRel = path.posix.join(outputRoot, id)
    const projectOutAbs = path.resolve(workspace, outputRoot, id)
    await fsp.mkdir(projectOutAbs, { recursive: true })

    let projectFile: string
    try {
      projectFile = resolveProjectFile(workspace, project)
    } catch (error) {
      core.error(error instanceof Error ? error.message : String(error))
      failed = true
      continue
    }

    const invocations = planInvocations({
      project: projectFile,
      outdir: projectOutRel,
      runChecks,
      checksFatal,
      usePreviewJobs,
      previewJobsFile,
      boards,
      variants,
    })

    core.startGroup(`Project: ${name}`)
    let projectFailed = false
    for (const invocation of invocations) {
      const result = runCli({
        invocation,
        installMethod,
        image,
        version,
        workspace,
        appImagePath,
        customCommand,
        uid,
        gid,
      })
      if (invocation.label.includes('checks')) {
        const summary = summarizeCheck({ tool: 'ERC+DRC', exitCode: result.status, output: result.output })
        core.info(`Checks for ${name}: ${summary.passed ? 'passed' : 'FAILED'} (exit ${summary.exitCode})`)
      }
      if (result.status !== 0 && invocation.fatal) {
        projectFailed = true
        core.error(`${name}: step '${invocation.label}' failed (exit ${result.status}).`)
        break
      }
    }
    core.endGroup()

    if (projectFailed) {
      failed = true
      continue
    }

    const files = await listFiles(projectOutAbs)
    const zipName = `${id}.zip`
    await zipFiles(projectOutAbs, path.join(projectOutAbs, zipName), files)

    const manifest: ProjectManifest = {
      ...buildProjectManifest({
        id,
        name,
        source: project,
        files: files.map((file) => ({ path: file.rel, size: file.size })),
        zip: zipName,
      }),
      generatedAt: new Date().toISOString(),
    }
    await fsp.writeFile(path.join(projectOutAbs, 'manifest.json'), JSON.stringify(manifest, null, 2))
    built.push({ id, name, source: project })
    core.info(`${name}: ${files.length} output file(s).`)
  }

  if (previewJobsFile) {
    await fsp.rm(path.resolve(workspace, previewJobsFile), { force: true })
  }

  const projectsManifest: ProjectsManifest = { projects: built, generatedAt: new Date().toISOString() }
  await fsp.writeFile(path.join(absOutputRoot, 'projects.json'), JSON.stringify(projectsManifest, null, 2))

  core.setOutput('output-dir', outputRoot)
  if (failed) core.setFailed('One or more projects failed to build.')
}

// Site assets and git metadata that must not be treated as branch folders.
const RESERVED_PAGES_ENTRIES = new Set([
  'index.html',
  'app.js',
  'style.css',
  'branches.json',
  '.git',
  '.nojekyll',
  'vendor',
  'CNAME',
])

async function assemblePages(): Promise<void> {
  const workspace = env('GITHUB_WORKSPACE', process.cwd())
  const outputRoot = env('LIBREPCB_CI_OUTPUT_DIR', 'librepcb-ci-output')
  const pagesDir = env('LIBREPCB_CI_PAGES_DIR', '.librepcb-ci-pages')
  const actionPath = env('GITHUB_ACTION_PATH', process.cwd())
  const currentRef = env('GITHUB_REF_NAME', 'main')
  const defaultBranch = env('LIBREPCB_CI_DEFAULT_BRANCH', currentRef)

  const absPages = path.resolve(workspace, pagesDir)
  await fsp.mkdir(absPages, { recursive: true })

  const entries = await fsp.readdir(absPages, { withFileTypes: true }).catch(() => [])
  const existingDirs = entries
    .filter((entry) => entry.isDirectory() && !RESERVED_PAGES_ENTRIES.has(entry.name))
    .map((entry) => entry.name)

  const lsRemote = spawnSync('git', ['ls-remote', '--heads', 'origin'], {
    cwd: workspace,
    encoding: 'utf8',
  })
  const liveRefs = parseLsRemoteHeads(lsRemote.stdout ?? '')

  const branches = reconcileBranches({ existingDirs, liveRefs, currentRef, defaultBranch })
  const currentDir = sanitizeRefName(currentRef)

  for (const dir of [...branches.removed, currentDir]) {
    await fsp.rm(path.join(absPages, dir), { recursive: true, force: true })
  }
  await fsp.cp(path.resolve(workspace, outputRoot), path.join(absPages, currentDir), { recursive: true })

  await fsp.writeFile(path.join(absPages, 'branches.json'), JSON.stringify(branches, null, 2))
  for (const asset of ['index.html', 'app.js', 'style.css']) {
    await fsp.copyFile(path.join(actionPath, 'pages', asset), path.join(absPages, asset))
  }
  // Disable Jekyll so files/dirs starting with `_` or `.` are served verbatim.
  await fsp.writeFile(path.join(absPages, '.nojekyll'), '')

  const owner = env('GITHUB_REPOSITORY_OWNER')
  const repo = (env('GITHUB_REPOSITORY').split('/')[1] ?? '').trim()
  if (owner && repo) {
    core.setOutput('pages-url', `https://${owner}.github.io/${repo}/?branch=${encodeURIComponent(currentDir)}`)
  }
  core.setOutput('pages-dir', pagesDir)
  core.info(`Assembled Pages tree in ${pagesDir} (current branch: ${currentDir}, removed: ${branches.removed.join(', ') || 'none'}).`)
}

async function main(): Promise<void> {
  const subcommand = process.argv[2]
  if (subcommand === 'run') {
    await run()
  } else if (subcommand === 'assemble-pages') {
    await assemblePages()
  } else {
    core.setFailed(`Unknown subcommand: ${subcommand ?? '(none)'}. Expected 'run' or 'assemble-pages'.`)
  }
}

void main().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
