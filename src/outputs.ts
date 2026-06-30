import type { OutputCategory, OutputFile, ProjectManifest } from './types'

/**
 * Classify an output file by its path/extension so the front-end can group and
 * render it (board image, BOM, 3D model, etc.). LibrePCB's interactive_bom job
 * emits a self-contained `.html`, which is why HTML maps to the interactive BOM.
 */
export function categorizeOutput(relPath: string): OutputCategory {
  const lower = relPath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  const ext = dot >= 0 ? lower.slice(dot + 1) : ''

  if (ext === 'html' || ext === 'htm') return 'interactive-bom'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'step' || ext === 'stp') return 'step'
  if (ext === 'png' || ext === 'svg' || ext === 'jpg' || ext === 'jpeg') return 'image'
  if (ext === 'zip' || ext === 'lppz') return 'archive'
  if (ext === 'drl' || ext === 'xln') return 'drill'
  if (ext === 'csv') {
    return /pnp|pick|place|position/.test(lower) ? 'pnp' : 'bom'
  }
  if (ext === 'ipc' || ext === 'd356') return 'netlist'
  if (/^(gbr|ger|gko|gtl|gbl|gto|gbo|gts|gbs|gtp|gbp|gpt|gpb)$/.test(ext)) return 'gerber'
  if (/^g[lm]?[0-9]+$/.test(ext)) return 'gerber'
  return 'other'
}

/**
 * Build a project's manifest from the list of files produced in its output
 * directory. Pure: takes a file list (paths relative to the output dir) rather
 * than reading the filesystem, so it is trivially testable.
 */
export function buildProjectManifest(input: {
  id: string
  name: string
  source: string
  files: Array<{ path: string; size?: number }>
  zip?: string
}): ProjectManifest {
  const files: OutputFile[] = input.files
    .map((file) => ({
      path: file.path,
      size: file.size,
      category: categorizeOutput(file.path),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
  return { id: input.id, name: input.name, source: input.source, files, zip: input.zip }
}
