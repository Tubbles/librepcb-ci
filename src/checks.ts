// ERC/DRC verdicts come straight from librepcb-cli's exit code, which is the
// authoritative signal (non-zero when non-approved messages exist). We do not
// parse the human-readable message text, only surface it in the job summary, so
// we never depend on an output format that could change between releases.

export interface CheckSummary {
  /** A label such as "ERC+DRC". */
  tool: string
  exitCode: number
  passed: boolean
  /** Captured CLI output, truncated for the job summary. */
  output: string
}

/** Truncate long CLI output for inclusion in the job summary. */
export function truncateOutput(output: string, maxLines = 50): string {
  const lines = output.split('\n')
  if (lines.length <= maxLines) return output
  const remaining = lines.length - maxLines
  return [...lines.slice(0, maxLines), `… (${remaining} more line${remaining === 1 ? '' : 's'})`].join('\n')
}

export function summarizeCheck(opts: { tool: string; exitCode: number; output: string }): CheckSummary {
  return {
    tool: opts.tool,
    exitCode: opts.exitCode,
    passed: opts.exitCode === 0,
    output: truncateOutput(opts.output),
  }
}
