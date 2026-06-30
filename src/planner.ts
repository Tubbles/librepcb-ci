// Translates the action's inputs into a deterministic, testable plan: the exact
// librepcb-cli argument vectors to run, in order, and which ones are fatal. The
// orchestrator (cli.ts) only executes this plan; all policy lives here.

export interface LibrepcbArgsOptions {
  project: string
  outdir?: string
  jobsFile?: string
  erc?: boolean
  drc?: boolean
  runJobs?: boolean
  boards?: string[]
  variants?: string[]
}

/** Build the librepcb-cli argv (the program name itself is not included). */
export function buildLibrepcbArgs(opts: LibrepcbArgsOptions): string[] {
  const args = ['open-project']
  if (opts.erc) args.push('--erc')
  if (opts.drc) args.push('--drc')
  for (const board of opts.boards ?? []) args.push('--board', board)
  for (const variant of opts.variants ?? []) args.push('--variant', variant)
  if (opts.jobsFile) args.push('--jobs', opts.jobsFile)
  if (opts.runJobs) args.push('--run-jobs')
  if (opts.outdir) args.push('--outdir', opts.outdir)
  args.push(opts.project)
  return args
}

export interface DockerRunOptions {
  /** Image repository, e.g. "librepcb/librepcb-cli". */
  image: string
  /** Image tag, e.g. "2.1.1" (the official image has no "latest"). */
  version: string
  /** Host directory to mount at /work (typically the workspace root). */
  workdir: string
  uid?: number
  gid?: number
  cliArgs: string[]
}

/**
 * Build the `docker run` argv that invokes the pinned CLI image. The image's
 * entrypoint already wraps `xvfb-run librepcb-cli`, so cliArgs are appended as
 * the command and rendering jobs work headlessly.
 */
export function buildDockerRunArgs(opts: DockerRunOptions): string[] {
  const args = ['run', '--rm']
  if (opts.uid !== undefined && opts.gid !== undefined) {
    args.push('--user', `${opts.uid}:${opts.gid}`)
  }
  args.push('--volume', `${opts.workdir}:/work`, '--workdir', '/work')
  args.push(`${opts.image}:${opts.version}`)
  args.push(...opts.cliArgs)
  return args
}

export interface RunPlanOptions {
  project: string
  outdir: string
  runChecks: boolean
  checksFatal: boolean
  usePreviewJobs: boolean
  previewJobsFile?: string
  boards?: string[]
  variants?: string[]
}

export interface Invocation {
  /** Short label for logs and the summary. */
  label: string
  /** librepcb-cli argv. */
  args: string[]
  /** When true, a non-zero exit fails the build. */
  fatal: boolean
}

/**
 * Decide which librepcb-cli invocations to run for one project, in order.
 *
 * - Fatal checks: run ERC+DRC together with the jobs in a single pass, so a
 *   check failure stops the build before outputs are trusted.
 * - Warn-only checks: run ERC+DRC in a separate non-fatal pass (so violations
 *   are reported but never block), then run the jobs on their own.
 * - Preview jobs: an optional, always non-fatal extra pass using our bundled
 *   jobs file, so projects without preview jobs still get images/BOM/STEP.
 */
export function planInvocations(opts: RunPlanOptions): Invocation[] {
  const base = { project: opts.project, boards: opts.boards, variants: opts.variants }
  const plan: Invocation[] = []

  if (opts.runChecks && opts.checksFatal) {
    plan.push({
      label: 'checks+jobs',
      fatal: true,
      args: buildLibrepcbArgs({ ...base, erc: true, drc: true, runJobs: true, outdir: opts.outdir }),
    })
  } else {
    if (opts.runChecks) {
      plan.push({
        label: 'checks',
        fatal: false,
        args: buildLibrepcbArgs({ ...base, erc: true, drc: true }),
      })
    }
    plan.push({
      label: 'jobs',
      fatal: true,
      args: buildLibrepcbArgs({ ...base, runJobs: true, outdir: opts.outdir }),
    })
  }

  if (opts.usePreviewJobs && opts.previewJobsFile) {
    plan.push({
      label: 'preview-jobs',
      fatal: false,
      args: buildLibrepcbArgs({ ...base, runJobs: true, jobsFile: opts.previewJobsFile, outdir: opts.outdir }),
    })
  }

  return plan
}
