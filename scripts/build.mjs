// Bundles the TypeScript sources into committed artifacts the action consumes at
// runtime: a Node bundle invoked by action.yml steps, and a browser bundle served
// on the Pages site. Both outputs are committed; CI's check-dist verifies they are
// in sync with src/ and frontend/.
import { build } from 'esbuild'

// Node bundle: the composite action's step entry point.
await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/cli.cjs',
  logLevel: 'info',
})

// Browser bundle: the Pages front-end (branch selector + preview viewers).
await build({
  entryPoints: ['frontend/app.ts'],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  outfile: 'pages/app.js',
  logLevel: 'info',
})
