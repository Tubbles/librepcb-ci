import { describe, it, expect } from 'vitest'
import { buildLibrepcbArgs, buildDockerRunArgs, planInvocations } from '../src/planner'

describe('buildLibrepcbArgs', () => {
  it('puts options before the positional project path', () => {
    expect(buildLibrepcbArgs({ project: 'demo', runJobs: true, outdir: 'out' })).toEqual([
      'open-project',
      '--run-jobs',
      '--outdir',
      'out',
      'demo',
    ])
  })

  it('includes checks, jobs file, boards and variants in order', () => {
    expect(
      buildLibrepcbArgs({
        project: 'p',
        erc: true,
        drc: true,
        jobsFile: 'j.lp',
        runJobs: true,
        boards: ['default'],
        variants: ['AV'],
      }),
    ).toEqual([
      'open-project',
      '--erc',
      '--drc',
      '--board',
      'default',
      '--variant',
      'AV',
      '--jobs',
      'j.lp',
      '--run-jobs',
      'p',
    ])
  })
})

describe('buildDockerRunArgs', () => {
  it('builds a docker run with user, mount and pinned tag', () => {
    expect(
      buildDockerRunArgs({
        image: 'librepcb/librepcb-cli',
        version: '2.1.1',
        workdir: '/w',
        uid: 1000,
        gid: 1000,
        cliArgs: ['open-project', '--run-jobs', 'demo'],
      }),
    ).toEqual([
      'run',
      '--rm',
      '--user',
      '1000:1000',
      '--volume',
      '/w:/work',
      '--workdir',
      '/work',
      'librepcb/librepcb-cli:2.1.1',
      'open-project',
      '--run-jobs',
      'demo',
    ])
  })

  it('omits --user when uid/gid are not given', () => {
    const args = buildDockerRunArgs({ image: 'i', version: '1', workdir: '/w', cliArgs: ['x'] })
    expect(args).not.toContain('--user')
  })
})

describe('planInvocations', () => {
  it('fatal checks: a single checks+jobs pass', () => {
    const plan = planInvocations({
      project: 'p',
      outdir: 'o',
      runChecks: true,
      checksFatal: true,
      usePreviewJobs: false,
    })
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ label: 'checks+jobs', fatal: true })
    expect(plan[0]!.args).toContain('--erc')
    expect(plan[0]!.args).toContain('--run-jobs')
  })

  it('warn-only checks: a separate non-fatal checks pass then fatal jobs', () => {
    const plan = planInvocations({
      project: 'p',
      outdir: 'o',
      runChecks: true,
      checksFatal: false,
      usePreviewJobs: false,
    })
    expect(plan.map((inv) => inv.label)).toEqual(['checks', 'jobs'])
    expect(plan[0]!.fatal).toBe(false)
    expect(plan[1]!.fatal).toBe(true)
    expect(plan[0]!.args).not.toContain('--run-jobs')
  })

  it('no checks: only the jobs pass', () => {
    const plan = planInvocations({
      project: 'p',
      outdir: 'o',
      runChecks: false,
      checksFatal: true,
      usePreviewJobs: false,
    })
    expect(plan.map((inv) => inv.label)).toEqual(['jobs'])
  })

  it('preview jobs add a trailing non-fatal pass using --jobs', () => {
    const plan = planInvocations({
      project: 'p',
      outdir: 'o',
      runChecks: false,
      checksFatal: true,
      usePreviewJobs: true,
      previewJobsFile: 'pv.lp',
    })
    expect(plan.map((inv) => inv.label)).toEqual(['jobs', 'preview-jobs'])
    const preview = plan.at(-1)!
    expect(preview.fatal).toBe(false)
    expect(preview.args).toContain('--jobs')
    expect(preview.args).toContain('pv.lp')
  })

  it('does not add a preview pass without a jobs file', () => {
    const plan = planInvocations({
      project: 'p',
      outdir: 'o',
      runChecks: false,
      checksFatal: true,
      usePreviewJobs: true,
    })
    expect(plan.map((inv) => inv.label)).toEqual(['jobs'])
  })
})
