import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'

/**
 * Light theme only (#137).
 *
 * The UI must never follow the OS dark mode and must never grow a dark variant.
 * This guard fails the suite as soon as a `dark:` Tailwind variant or a
 * `prefers-color-scheme: dark` media query appears anywhere under src/, and
 * checks that the colour scheme is pinned to light at the root.
 */

// vitest runs from frontend/ (CI: `cd frontend && npm run test:ui`); tolerate the repo root too.
const FRONTEND_ROOT = existsSync(join(process.cwd(), 'vitest.config.ts'))
  ? process.cwd()
  : resolve(process.cwd(), 'frontend')
const SRC_ROOT = join(FRONTEND_ROOT, 'src')
const SELF_NAME = 'lightTheme.vitest.ts'
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.html'])

// Assembled from parts so this file never matches its own patterns.
const DARK_VARIANT = new RegExp(`\\b${['da', 'rk'].join('')}:`)
const DARK_MEDIA = new RegExp(`prefers-color-scheme:\\s*${['da', 'rk'].join('')}`)

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') walk(full, out)
    } else if (SCANNED_EXTENSIONS.has(extname(full)) && basename(full) !== SELF_NAME) {
      out.push(full)
    }
  }
  return out
}

function offenders(pattern: RegExp): string[] {
  return walk(SRC_ROOT)
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => relative(FRONTEND_ROOT, file))
}

describe('light theme only', () => {
  it('scans the frontend source tree', () => {
    expect(existsSync(join(SRC_ROOT, 'index.css'))).toBe(true)
    expect(walk(SRC_ROOT).length).toBeGreaterThan(0)
  })

  it('has no Tailwind dark variants anywhere under src/', () => {
    expect(offenders(DARK_VARIANT)).toEqual([])
  })

  it('has no dark media queries anywhere under src/', () => {
    expect(offenders(DARK_MEDIA)).toEqual([])
  })

  it('pins the colour scheme to light in index.css and index.html', () => {
    const css = readFileSync(join(SRC_ROOT, 'index.css'), 'utf8')
    const html = readFileSync(join(FRONTEND_ROOT, 'index.html'), 'utf8')
    expect(css).toMatch(/color-scheme:\s*light/)
    expect(html).toContain('name="color-scheme" content="light"')
  })
})
