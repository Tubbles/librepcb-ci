import type {
  BranchesManifest,
  OutputCategory,
  OutputFile,
  ProjectManifest,
  ProjectSummary,
} from '../src/types'

// Pure helpers (no DOM) are unit-tested directly; the DOM builders below are
// exercised with jsdom. The front-end is a single page served at the site root;
// the branch and project are selected via ?branch= and ?project= query params,
// so every fetch and link is relative to the root.

const CATEGORY_LABELS: Record<OutputCategory, string> = {
  image: 'Board & schematic images',
  'interactive-bom': 'Interactive BOM',
  step: '3D model',
  pdf: 'PDF documents',
  gerber: 'Gerber',
  drill: 'Drill',
  bom: 'Bill of materials',
  pnp: 'Pick & place',
  netlist: 'Netlist',
  archive: 'Archives',
  other: 'Other files',
}

// Display order: visual previews first, raw fabrication files after.
const CATEGORY_ORDER: OutputCategory[] = [
  'image',
  'interactive-bom',
  'step',
  'pdf',
  'gerber',
  'drill',
  'bom',
  'pnp',
  'netlist',
  'archive',
  'other',
]

/**
 * Choose which branch to display. Prefers the requested ref (when it still has
 * a folder), then the default branch, then the first available branch, and
 * finally undefined when the site has no branches. This is the graceful
 * handling of a deleted/missing branch: a stale ?branch= link falls back to a
 * real branch instead of showing nothing.
 */
export function resolveCurrentBranch(
  manifest: BranchesManifest,
  requested?: string | null,
): string | undefined {
  const dirs = manifest.branches.map((branch) => branch.dir)
  if (requested && dirs.includes(requested)) return requested
  if (manifest.defaultBranch && dirs.includes(manifest.defaultBranch)) return manifest.defaultBranch
  return dirs[0]
}

/** Group output files by category in a fixed, preview-first display order. */
export function groupByCategory(
  files: OutputFile[],
): Array<{ category: OutputCategory; label: string; files: OutputFile[] }> {
  const byCategory = new Map<OutputCategory, OutputFile[]>()
  for (const file of files) {
    const bucket = byCategory.get(file.category) ?? []
    bucket.push(file)
    byCategory.set(file.category, bucket)
  }
  return CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    files: byCategory.get(category)!,
  }))
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

/** Fill a <select> with the available branches and select `current`. */
export function populateBranchSelect(
  select: HTMLSelectElement,
  manifest: BranchesManifest,
  current?: string,
): void {
  select.replaceChildren()
  if (manifest.branches.length === 0) {
    const option = document.createElement('option')
    option.textContent = '(no branches)'
    option.disabled = true
    select.append(option)
    select.disabled = true
    return
  }
  select.disabled = false
  for (const branch of manifest.branches) {
    const option = document.createElement('option')
    option.value = branch.dir
    option.textContent = branch.ref
    if (branch.dir === current) option.selected = true
    select.append(option)
  }
}

/** Replace a container's contents with a single informational message. */
export function showMessage(container: HTMLElement, message: string): void {
  const paragraph = document.createElement('p')
  paragraph.className = 'message'
  paragraph.textContent = message
  container.replaceChildren(paragraph)
}

/** Render the per-branch list of projects as linked cards. */
export function renderProjectList(
  container: HTMLElement,
  projects: ProjectSummary[],
  branchDir: string,
): void {
  if (projects.length === 0) {
    showMessage(container, 'No projects were built for this branch.')
    return
  }
  const list = document.createElement('div')
  list.className = 'project-list'
  for (const project of projects) {
    const card = document.createElement('a')
    card.className = 'project-card'
    card.href = `?branch=${encodeURIComponent(branchDir)}&project=${encodeURIComponent(project.id)}`
    const title = document.createElement('h2')
    title.textContent = project.name
    const source = document.createElement('p')
    source.className = 'project-source'
    source.textContent = project.source
    card.append(title, source)
    list.append(card)
  }
  container.replaceChildren(list)
}

/**
 * Render a single project's preview page: a download-all button, then a section
 * per output category. Images render inline, interactive BOM and PDFs as
 * iframes, STEP as a viewer mount that always carries a download link, and the
 * rest as a file list. `base` is the project's folder relative to the site root.
 */
export function renderProjectPage(
  container: HTMLElement,
  manifest: ProjectManifest,
  opts: { base: string; branchDir: string },
): void {
  const fragments: Node[] = []

  const header = document.createElement('div')
  header.className = 'project-header'
  const back = document.createElement('a')
  back.className = 'back-link'
  back.href = `?branch=${encodeURIComponent(opts.branchDir)}`
  back.textContent = '← All projects'
  const title = document.createElement('h2')
  title.textContent = manifest.name
  header.append(back, title)
  if (manifest.generatedAt) {
    const meta = document.createElement('p')
    meta.className = 'project-meta'
    meta.textContent = `Generated ${manifest.generatedAt}`
    header.append(meta)
  }
  if (manifest.zip) {
    const download = document.createElement('a')
    download.className = 'download-zip'
    download.href = opts.base + manifest.zip
    download.textContent = 'Download all outputs (.zip)'
    download.setAttribute('download', '')
    header.append(download)
  }
  fragments.push(header)

  for (const group of groupByCategory(manifest.files)) {
    const section = document.createElement('section')
    section.className = `outputs outputs-${group.category}`
    const heading = document.createElement('h3')
    heading.textContent = group.label
    section.append(heading)
    for (const file of group.files) {
      section.append(renderOutput(file, opts.base))
    }
    fragments.push(section)
  }

  container.replaceChildren(...fragments)
}

function fileLink(file: OutputFile, base: string): HTMLAnchorElement {
  const link = document.createElement('a')
  link.href = base + file.path
  link.textContent = file.size !== undefined ? `${file.path} (${formatBytes(file.size)})` : file.path
  return link
}

function renderOutput(file: OutputFile, base: string): HTMLElement {
  const url = base + file.path
  switch (file.category) {
    case 'image': {
      const figure = document.createElement('figure')
      const image = document.createElement('img')
      image.loading = 'lazy'
      image.src = url
      image.alt = file.path
      const caption = document.createElement('figcaption')
      caption.append(fileLink(file, base))
      figure.append(image, caption)
      return figure
    }
    case 'interactive-bom':
    case 'pdf': {
      const wrapper = document.createElement('div')
      wrapper.className = 'embed'
      const frame = document.createElement('iframe')
      frame.src = url
      frame.loading = 'lazy'
      frame.title = file.path
      const caption = document.createElement('p')
      caption.append(fileLink(file, base))
      wrapper.append(frame, caption)
      return wrapper
    }
    case 'step': {
      // The viewer is initialised by app.ts after render. The download link is
      // always present, so a STEP file is reachable even if the viewer cannot
      // load in the visitor's browser.
      const wrapper = document.createElement('div')
      wrapper.className = 'step-viewer'
      wrapper.dataset.model = url
      const caption = document.createElement('p')
      caption.append(fileLink(file, base))
      wrapper.append(caption)
      return wrapper
    }
    default: {
      const item = document.createElement('p')
      item.className = 'file-item'
      item.append(fileLink(file, base))
      return item
    }
  }
}
