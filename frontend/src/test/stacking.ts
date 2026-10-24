import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// vitest does not load CSS, so read the stylesheet as text. vitest runs from frontend/
// (CI: `cd frontend && npm run test:ui`); tolerate the repo root too.
const FRONTEND_ROOT = existsSync(join(process.cwd(), 'vitest.config.ts'))
  ? process.cwd()
  : resolve(process.cwd(), 'frontend')
const indexCss = readFileSync(join(FRONTEND_ROOT, 'src', 'index.css'), 'utf8')

/** z-index of the `.modal-overlay` component class in index.css; every modal stacks from here up. */
export const MODAL_OVERLAY_Z = Number(/\.modal-overlay\s*\{[^}]*\bz-(\d+)/.exec(indexCss)?.[1])

/**
 * jsdom does not load Tailwind, so stacking order has to be resolved from the class names.
 * Returns the z-index an element competes with in the root stacking context: that of its
 * outermost ancestor (or itself) with a `z-<n>` or `isolate` class, where `isolate` alone
 * stacks at 0. Every element given a `z-<n>` class in this app is positioned, so each one
 * starts a stacking context.
 */
export function rootZIndex(el: Element): number {
  let z = 0
  for (let node: Element | null = el; node; node = node.parentElement) {
    const zClass = [...node.classList].find((name) => /^z-\d+$/.test(name))
    if (zClass) z = Number(zClass.slice(2))
    else if (node.classList.contains('isolate')) z = 0
  }
  return z
}
