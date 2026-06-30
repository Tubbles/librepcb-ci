// Shared data shapes for the runner logic and the Pages front-end. These types
// describe the JSON manifests written to the Pages site and consumed by the
// browser app, so keep them in sync with frontend/.

export type OutputCategory =
  | 'gerber'
  | 'drill'
  | 'bom'
  | 'interactive-bom'
  | 'pnp'
  | 'image'
  | 'pdf'
  | 'step'
  | 'netlist'
  | 'archive'
  | 'other'

export interface OutputFile {
  /** Path relative to the project's output directory, POSIX separators. */
  path: string
  category: OutputCategory
  /** Size in bytes, if known. */
  size?: number
}

export interface ProjectManifest {
  /** Sanitized identifier used as the project's Pages subfolder. */
  id: string
  /** Human-readable project name. */
  name: string
  /** Source path of the project within the consuming repo. */
  source: string
  files: OutputFile[]
  /** Relative path to the all-outputs zip, if produced. */
  zip?: string
  /** ISO timestamp, filled in by the caller (scripts cannot read the clock in tests). */
  generatedAt?: string
}

export interface ProjectSummary {
  id: string
  name: string
  source: string
}

export interface ProjectsManifest {
  projects: ProjectSummary[]
  /** ISO timestamp, filled in by the caller. */
  generatedAt?: string
}

export interface BranchInfo {
  /** Sanitized folder name on the Pages site. */
  dir: string
  /** Original git ref name. */
  ref: string
}

export interface BranchesManifest {
  branches: BranchInfo[]
  /** Sanitized folder name of the repo's default branch, if known. */
  defaultBranch?: string
  /** Folder names removed because their branch no longer exists. */
  removed: string[]
}
