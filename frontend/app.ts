import {
  populateBranchSelect,
  renderProjectList,
  renderProjectPage,
  resolveCurrentBranch,
  showMessage,
} from './render'
import type { BranchesManifest, ProjectManifest, ProjectsManifest } from '../src/types'

// The Online3DViewer global, present only when its script is loaded. Typed
// minimally so the STEP viewer is best-effort: when absent, the download link
// rendered by render.ts is the fallback.
interface OnlineViewerGlobal {
  Init3DViewerFromUrlList: (parent: HTMLElement, modelUrls: string[], parameters: object) => unknown
}

declare global {
  interface Window {
    OV?: OnlineViewerGlobal
  }
}

async function fetchJson<T>(url: string): Promise<T | undefined> {
  try {
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) return undefined
    return (await response.json()) as T
  } catch {
    return undefined
  }
}

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

// Online3DViewer engine, pinned. We only fetch it on project pages that
// actually contain a STEP file (lazy), so the branch list and STEP-less projects
// stay lightweight. O3DV loads the heavy occt-import-js wasm/worker itself from
// its own hardcoded jsDelivr path, so no SetExternalLibLocation is needed here.
const O3DV_URL = 'https://cdn.jsdelivr.net/npm/online-3d-viewer@0.18.0/build/engine/o3dv.min.js'

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`failed to load ${url}`))
    document.head.append(script)
  })
}

async function initStepViewers(): Promise<void> {
  const mounts = document.querySelectorAll<HTMLElement>('.step-viewer[data-model]')
  if (mounts.length === 0) return
  if (!window.OV) {
    // On failure, leave the download links that render.ts already added.
    try {
      await loadScript(O3DV_URL)
    } catch {
      return
    }
  }
  const viewer = window.OV
  if (!viewer) return
  for (const mount of mounts) {
    const url = mount.dataset.model
    if (!url) continue
    const host = document.createElement('div')
    host.className = 'step-canvas'
    mount.prepend(host)
    viewer.Init3DViewerFromUrlList(host, [url], {})
  }
}

async function main(): Promise<void> {
  const select = document.getElementById('branch-select')
  const content = document.getElementById('content')
  if (!(select instanceof HTMLSelectElement) || !content) return

  const branches = await fetchJson<BranchesManifest>('branches.json')
  if (!branches) {
    showMessage(content, 'No outputs have been published yet.')
    return
  }

  const current = resolveCurrentBranch(branches, param('branch'))
  populateBranchSelect(select, branches, current)
  select.addEventListener('change', () => {
    window.location.search = `?branch=${encodeURIComponent(select.value)}`
  })

  if (!current) {
    showMessage(content, 'No branches are available.')
    return
  }

  const projectId = param('project')
  if (projectId) {
    const base = `${current}/${projectId}/`
    const manifest = await fetchJson<ProjectManifest>(`${base}manifest.json`)
    if (!manifest) {
      showMessage(content, 'This project could not be found on this branch.')
      return
    }
    renderProjectPage(content, manifest, { base, branchDir: current })
    void initStepViewers()
  } else {
    const index = await fetchJson<ProjectsManifest>(`${current}/projects.json`)
    if (!index) {
      showMessage(content, 'No projects were built for this branch.')
      return
    }
    renderProjectList(content, index.projects, current)
  }
}

void main()
