#!/usr/bin/env node
/**
 * Builds the frontend and publishes it to the website bucket the stack created.
 *
 * Usage: npm run site:publish
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { banner, fail, getStackOutputs, repoRoot, run } from './lib/stack.mjs'

banner('site:publish')

const { region, outputs } = getStackOutputs()
const bucket = outputs.SiteBucketName
if (!bucket) fail('The stack has no SiteBucketName output. Deploy first: npm run deploy')

// Vite bakes VITE_API_BASE_URL into the bundle at build time, so a missing .env.local
// would publish a site that quietly calls "/api/locations" on the S3 host and shows
// an empty map. Refuse rather than ship that.
if (!existsSync(join(repoRoot, 'frontend', '.env.local'))) {
  fail('frontend/.env.local is missing, so the build would have no API URL. Run: npm run env:pull')
}

run('npm', ['--prefix', join(repoRoot, 'frontend'), 'run', 'build'])

// The S3 website endpoint never compresses responses, and the 3D chunk and model
// shrink about 4x with gzip, so upload hashed text and model assets pre-gzipped.
// Gzip a copy so dist still works with `vite preview`.
const dist = mkdtempSync(join(tmpdir(), 'site-'))
cpSync(join(repoRoot, 'frontend', 'dist'), dist, { recursive: true })
const assets = join(dist, 'assets')
const gzipped = /\.(js|css|glb)$/
const decoded = {}
for (const name of readdirSync(assets).filter((n) => gzipped.test(n))) {
  const file = join(assets, name)
  const raw = readFileSync(file)
  decoded[name] = raw.length
  writeFileSync(file, gzipSync(raw, { level: 9 }))
}
// Hashed names never change content, so they may cache for a year (as in cd-frontend.yml).
const immutable = ['--cache-control', 'public, max-age=31536000, immutable', '--region', region]
run('aws', ['s3', 'sync', assets, `s3://${bucket}/assets`, '--delete', '--no-progress', '--exclude', '*', '--include', '*.js', '--include', '*.css', '--include', '*.glb', '--content-encoding', 'gzip', ...immutable])
// The model loader reads its decoded size for the download progress readout.
for (const name of Object.keys(decoded).filter((n) => n.endsWith('.glb'))) {
  run('aws', ['s3', 'cp', join(assets, name), `s3://${bucket}/assets/${name}`, '--no-progress', '--content-encoding', 'gzip', '--content-type', 'model/gltf-binary', '--metadata', `decoded-length=${decoded[name]}`, ...immutable])
}
run('aws', ['s3', 'sync', dist, `s3://${bucket}`, '--delete', '--no-progress', '--exclude', 'assets/*.js', '--exclude', 'assets/*.css', '--exclude', 'assets/*.glb', '--region', region])

// Asset filenames are content-hashed and may cache forever, but index.html points at
// them by name: if it is cached, the next publish serves a shell asking for deleted files.
run('aws', [
  's3',
  'cp',
  join(dist, 'index.html'),
  `s3://${bucket}/index.html`,
  '--cache-control',
  'no-cache',
  '--content-type',
  'text/html',
  '--region',
  region,
])
rmSync(dist, { recursive: true, force: true })

console.log(`\npublished to ${outputs.SiteUrl ?? `s3://${bucket}`}`)
