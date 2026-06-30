/**
 * Turn a git ref name into a filesystem- and URL-safe folder name for the
 * Pages site. Strips a leading `refs/heads/` or `refs/tags/`, replaces any run
 * of disallowed characters with a single dash, trims leading/trailing dashes,
 * and removes leading dots so the result is never a hidden directory.
 */
export function sanitizeRefName(ref: string): string {
  const cleaned = ref
    .replace(/^refs\/(heads|tags)\//, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/-+$/, '')
  return cleaned.length > 0 ? cleaned : 'ref'
}

/**
 * Parse the output of `git ls-remote --heads` into a list of branch names.
 * Each line looks like `<sha>\trefs/heads/<branch>`.
 */
export function parseLsRemoteHeads(output: string): string[] {
  const branches: string[] = []
  for (const line of output.split('\n')) {
    const match = line.match(/^[0-9a-f]+\s+refs\/heads\/(.+)$/)
    const name = match?.[1]
    if (name) branches.push(name.trim())
  }
  return branches
}
