import type { BranchInfo, BranchesManifest } from './types'
import { sanitizeRefName } from './refs'

export interface ReconcileOptions {
  /** Branch folder names currently present on the gh-pages site. */
  existingDirs: string[]
  /** Live branch names (e.g. from `git ls-remote --heads`). */
  liveRefs: string[]
  /** The ref being published in this run (may be a tag not in liveRefs). */
  currentRef: string
  /** The repo's default branch ref, if known. */
  defaultBranch?: string
}

/**
 * Reconcile the Pages site's per-branch folders against the live branches.
 *
 * Keeps the folder for the ref being published plus every existing folder whose
 * branch still exists; marks the rest for deletion (this is how a deleted
 * branch disappears on the next run). Returns the branch list that drives the
 * dropdown and the list of stale folders to remove.
 */
export function reconcileBranches(opts: ReconcileOptions): BranchesManifest {
  const liveDirToRef = new Map<string, string>()
  for (const ref of opts.liveRefs) liveDirToRef.set(sanitizeRefName(ref), ref)

  const currentDir = sanitizeRefName(opts.currentRef)
  // The ref being published now always survives, even if it is a tag.
  liveDirToRef.set(currentDir, opts.currentRef)

  const keep = new Set<string>([currentDir])
  for (const dir of opts.existingDirs) {
    if (liveDirToRef.has(dir)) keep.add(dir)
  }

  const removed = opts.existingDirs.filter((dir) => !keep.has(dir))

  const branches: BranchInfo[] = [...keep]
    .map((dir) => ({ dir, ref: liveDirToRef.get(dir) ?? dir }))
    .sort((a, b) => a.ref.localeCompare(b.ref))

  return {
    branches,
    removed,
    defaultBranch: opts.defaultBranch ? sanitizeRefName(opts.defaultBranch) : undefined,
  }
}
