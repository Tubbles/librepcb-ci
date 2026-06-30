# librepcb-ci

A reusable GitHub composite action that runs a [LibrePCB](https://librepcb.org) project's output jobs on every push, uploads the results as workflow artifacts, and optionally publishes a browsable per-branch GitHub Pages site with previews.

It builds on LibrePCB's own [output jobs](https://librepcb.org/docs/user-manual/project-editor/output-jobs/) and the official `librepcb/librepcb-cli` Docker image. The previews (board and schematic images, interactive BOM, 3D STEP) come from the jobs your project already defines, so the action mostly runs them and presents the results.

## What it does

- Runs each configured project's output jobs via `librepcb-cli open-project --run-jobs`.
- Optionally runs ERC and DRC and gates the build on them.
- Collects every produced file, zips it per project, and uploads workflow artifacts.
- Optionally publishes a GitHub Pages site: one folder per branch, a branch dropdown to switch between them, and a preview page per project (images inline, interactive BOM and PDFs embedded, STEP in an in-browser 3D viewer, plus a download-all button).
- Reconciles the Pages site against live branches on every run, so a deleted branch's folder is removed automatically and the dropdown handles a missing branch gracefully.

## Quick start

Add a workflow to your LibrePCB project repository:

```yaml
name: LibrePCB outputs
on: push

permissions:
  contents: write

jobs:
  outputs:
    runs-on: ubuntu-latest
    concurrency:
      group: librepcb-ci-pages
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: Tubbles/librepcb-ci@v1
        with:
          projects: my-board        # path to your .lpp project directory
          pages: true               # publish a browsable Pages site
```

If your `.lpp` lives at the repo root, you can drop the `projects` line entirely; it defaults to `.` and the project is named after the repository.

Then enable GitHub Pages for the repository (Settings, Pages) with the source set to the `gh-pages` branch. Your outputs will be browsable at `https://<owner>.github.io/<repo>/`.

A live demo built from this repository's own [`demo/`](demo/) project is at https://tubbles.github.io/librepcb-ci/.

If you only want ERC/DRC checks and no published outputs, you do not need this action at all: copy LibrePCB's minimal [library CI workflow](https://github.com/LibrePCB-Libraries/LibrePCB_Base.lplib/blob/master/.github/workflows/main.yml) and swap the command for `open-project --run-jobs`. This action is for the collect, preview, and publish experience on top of that.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `projects` | `.` | Newline- or comma-separated list of project paths (`.lpp` directories or `.lppz` files), relative to the repo root. Defaults to `.` for a single project at the repo root. |
| `librepcb-version` | `2.1.1` | LibrePCB version (Docker image tag / AppImage version). The official image has no `latest` tag, so this is pinned. |
| `install-method` | `docker` | How to obtain `librepcb-cli`: `docker`, `appimage`, or `custom`. |
| `cli-command` | `librepcb-cli` | Command to run when `install-method` is `custom` (for an apt/snap/source install you set up yourself). |
| `image` | `librepcb/librepcb-cli` | Docker image repository (docker install method). |
| `run-checks` | `true` | Run ERC and DRC. |
| `checks-fatal` | `true` | Fail the build on non-approved ERC/DRC messages. Set `false` for warn-only. |
| `use-preview-jobs` | `false` | Run a supplementary pass with the bundled preview jobs so projects without preview jobs still get images, interactive BOM, and STEP. |
| `preview-jobs-file` | (bundled) | Path to a custom jobs `.lp` file to use instead of the bundled preview jobs. |
| `boards` | (all) | Newline/comma list of board names to build. |
| `variants` | (default) | Newline/comma list of assembly variants to build. |
| `output-dir` | `librepcb-ci-output` | Directory, relative to the repo, where outputs are collected. |
| `artifact-name` | `librepcb-ci-outputs` | Workflow artifact name. Empty disables artifact upload. |
| `pages` | `false` | Publish outputs to GitHub Pages. |
| `pages-branch` | `gh-pages` | Branch to publish the Pages site to. |
| `github-token` | `${{ github.token }}` | Token used to publish to the Pages branch. |

## Outputs

| Output | Description |
| --- | --- |
| `output-dir` | Directory containing the collected outputs. |
| `pages-url` | URL of the published Pages site for this branch (when `pages` is enabled). |

## Install methods

`librepcb-cli` is obtained according to `install-method`:

- `docker` (default): runs the pinned `librepcb/librepcb-cli:<version>` image via `docker run`. The image bundles Xvfb, so rendering jobs work headlessly. Recommended.
- `appimage`: downloads the pinned AppImage from download.librepcb.org and runs it under `xvfb-run`. The runner must provide `xvfb`. Less exercised than docker.
- `custom`: you install `librepcb-cli` yourself in a prior step (apt, snap, build from source, etc.) and point `cli-command` at it. This covers any install channel the other two do not.

## Pages, previews, and the branch dropdown

When `pages` is enabled, each run publishes that branch's outputs to `gh-pages/<branch>/` and regenerates a root page with a branch selector. The site is a single page served at the repository root; it reads `branches.json` and per-project manifests, so all links are relative and direct links to a branch or project work via query parameters.

Previews are driven by whatever `graphics`, `interactive_bom`, and `3d_model` output jobs your project defines. The 3D STEP viewer is [Online3DViewer](https://github.com/kovacsv/Online3DViewer), loaded lazily from a pinned CDN only on pages that contain a STEP model; if it cannot load, the STEP file is still downloadable. Set `use-preview-jobs: true` to run a bundled set of preview jobs for projects that do not define their own.

Notes:

- Grant `permissions: contents: write` to the job so the action can publish the `gh-pages` branch.
- Set a `concurrency` group (as in the quick start) so concurrent branch builds do not race on the `gh-pages` branch.
- Pull requests from forks have read-only tokens and cannot publish; gate `pages` on `github.event_name == 'push'` if you build fork PRs.

## Versioning

Releases are tagged `vMAJOR.MINOR.PATCH`, and a moving major tag (`v1`) tracks the latest release in that series. Pin `uses: Tubbles/librepcb-ci@v1` for automatic patch and minor updates, or a full version for exact pinning.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).

Third-party components: the Pages publish step uses [peaceiris/actions-gh-pages](https://github.com/peaceiris/actions-gh-pages) (MIT); the 3D viewer is [Online3DViewer](https://github.com/kovacsv/Online3DViewer) (MIT), loaded from a CDN; the bundled [`demo/`](demo/) project is vendored from [LibrePCB test data](https://github.com/LibrePCB/librepcb-test-data) (CC0-1.0).
