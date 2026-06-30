import { sanitizeRefName } from './refs'

/**
 * Derive a project's display name and its sanitized id (used as the Pages
 * subfolder and URL segment) from its path. Strips a trailing slash and a
 * `.lpp`/`.lppz` extension; the id reuses the ref sanitizer for safe folders.
 */
export function projectIdentity(projectPath: string): { id: string; name: string } {
  const base = projectPath.replace(/\/+$/, '').split('/').pop() ?? projectPath
  const name = base.replace(/\.(lppz|lpp)$/i, '')
  return { id: sanitizeRefName(name), name }
}

/**
 * Parse the `projects` action input into a clean list of project paths.
 *
 * Accepts newline- and/or comma-separated entries, trims surrounding
 * whitespace, and drops blank lines and `#` comments so the input can be
 * written as a readable YAML block scalar.
 */
export function parseProjects(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith('#'))
}
