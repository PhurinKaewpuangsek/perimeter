#!/usr/bin/env node
/**
 * Writes frontend/.env.local from your own stack's Outputs.
 *
 * This replaces the step where everybody copied the API URL out of the `sam deploy`
 * output by hand — the step that silently breaks the app when a lab restart hands you
 * a new API id and nobody notices the old one is still in the file.
 *
 * Usage: npm run env:pull
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { banner, fail, getStackOutputs, repoRoot } from './lib/stack.mjs'

const ENV_PATH = join(repoRoot, 'frontend', '.env.local')

/** Keys this script owns. Anything else already in the file is left as the teammate wrote it. */
const OWNED = ['VITE_API_BASE_URL', 'VITE_COGNITO_USER_POOL_ID', 'VITE_COGNITO_CLIENT_ID']

banner('env:pull')

const { outputs } = getStackOutputs()
if (!outputs.ApiUrl) fail('The stack has no ApiUrl output. Deploy first: npm run deploy')

const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : ''
const kept = existing
  .split(/\r?\n/)
  .filter((line) => line.trim() && !OWNED.some((key) => line.startsWith(`${key}=`)))

// A fresh file still needs edit mode, which is how the room detail form is enabled.
if (!kept.some((line) => line.startsWith('VITE_ENABLE_EDIT_MODE='))) {
  kept.push('VITE_ENABLE_EDIT_MODE=true')
}

const nextLines = [`VITE_API_BASE_URL=${outputs.ApiUrl}`]
if (outputs.UserPoolId) {
  nextLines.push(`VITE_COGNITO_USER_POOL_ID=${outputs.UserPoolId}`)
}
if (outputs.UserPoolClientId) {
  nextLines.push(`VITE_COGNITO_CLIENT_ID=${outputs.UserPoolClientId}`)
}

const next = [...nextLines, ...kept].join('\n') + '\n'
writeFileSync(ENV_PATH, next)

console.log(`wrote frontend/.env.local\n`)
console.log(next.trim())
