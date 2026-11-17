#!/usr/bin/env node
/**
 * Load-test data manager. Reads the stack from the same config as the other scripts.
 *
 *   node loadtest/manage.mjs setup    [--users 8]   create test users + schedule rows
 *   node loadtest/manage.mjs cleanup                delete ONLY test users, rows and pins
 *   node loadtest/manage.mjs status                 count what exists
 *
 * Password: LOADTEST_PASSWORD env var (never committed).
 * Safety: every delete is filtered by the LOADTEST- room prefix / loadtestNN@torch.dev email.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { awsJson, banner, capture, fail, flag, getStackOutputs } from '../scripts/lib/stack.mjs'
import {
  TEST_EMAIL_PREFIX,
  TEST_ROOM_PREFIX,
  buildScheduleRows,
  chunk,
  isTestEmail,
  isTestRoom,
  testEmail,
  toDdbItem,
} from './lib.mjs'

const cmd = process.argv[2]
if (!['setup', 'cleanup', 'status'].includes(cmd)) fail('Usage: manage.mjs <setup|cleanup|status> [--users N]')
banner(`loadtest ${cmd}`)

const { region, outputs } = getStackOutputs()
const poolId = outputs.UserPoolId
const schedulesTable = outputs.SchedulesTableName
const pinsTable = outputs.PinsTableName
if (!poolId || !schedulesTable || !pinsTable) fail('Stack outputs missing UserPoolId/SchedulesTableName/PinsTableName.')

const tmp = mkdtempSync(join(tmpdir(), 'loadtest-'))
let fileN = 0
const jsonFile = (obj) => {
  const p = join(tmp, `f${fileN++}.json`)
  writeFileSync(p, JSON.stringify(obj))
  return `file://${p.replace(/\\/g, '/')}`
}
const aws = (args, { allowFailure = false } = {}) => {
  const r = capture('aws', [...args, '--region', region, '--output', 'json'])
  if (r.status !== 0 && !allowFailure) fail(`aws ${args.slice(0, 2).join(' ')} failed: ${r.stderr}`)
  return r
}

function scanTestRows(table, keyNames) {
  const out = awsJson([
    'dynamodb', 'scan', '--table-name', table,
    '--filter-expression', 'begins_with(room_code, :p)',
    '--expression-attribute-values', jsonFile({ ':p': { S: TEST_ROOM_PREFIX } }),
    '--projection-expression', keyNames.join(', '),
    '--region', region,
  ])
  return out.Items ?? []
}

function listTestUsers() {
  const out = awsJson([
    'cognito-idp', 'list-users', '--user-pool-id', poolId,
    '--filter', `email ^= "${TEST_EMAIL_PREFIX}"`, '--region', region,
  ])
  return (out.Users ?? []).map((u) => u.Username).filter((name) => isTestEmail(name))
}

function batchWrite(table, requests) {
  for (const group of chunk(requests, 25)) {
    let pending = { [table]: group }
    for (let attempt = 0; attempt < 8 && Object.keys(pending).length; attempt++) {
      const r = aws(['dynamodb', 'batch-write-item', '--request-items', jsonFile(pending)])
      pending = JSON.parse(r.stdout || '{}').UnprocessedItems ?? {}
      if (!Object.keys(pending).length || !Object.values(pending)[0]?.length) pending = {}
    }
  }
}

if (cmd === 'setup') {
  const password = process.env.LOADTEST_PASSWORD
  if (!password) fail('Set LOADTEST_PASSWORD (min 8 chars, upper/lower/digit as per pool policy).')
  const n = Number(flag('users', '8'))

  for (let i = 1; i <= n; i++) {
    const email = testEmail(i)
    const exists = aws(['cognito-idp', 'admin-get-user', '--user-pool-id', poolId, '--username', email], { allowFailure: true })
    if (exists.status !== 0) {
      aws(['cognito-idp', 'admin-create-user', '--user-pool-id', poolId, '--username', email,
        '--user-attributes', `Name=email,Value=${email}`, 'Name=email_verified,Value=true', '--message-action', 'SUPPRESS'])
    }
    aws(['cognito-idp', 'admin-set-user-password', '--user-pool-id', poolId, '--username', email, '--password', password, '--permanent'])
    aws(['cognito-idp', 'admin-add-user-to-group', '--user-pool-id', poolId, '--username', email, '--group-name', 'user'])
    console.log(`user ready: ${email}`)
  }

  const rows = buildScheduleRows(20)
  batchWrite(schedulesTable, rows.map((r) => ({ PutRequest: { Item: toDdbItem(r) } })))
  console.log(`schedule rows written: ${rows.length} (${TEST_ROOM_PREFIX}R01..R20)`)
}

if (cmd === 'cleanup') {
  for (const email of listTestUsers()) {
    aws(['cognito-idp', 'admin-delete-user', '--user-pool-id', poolId, '--username', email])
    console.log(`deleted user ${email}`)
  }
  const pins = scanTestRows(pinsTable, ['user_id', 'pin_key', 'room_code']).filter((i) => isTestRoom(i.room_code?.S))
  batchWrite(pinsTable, pins.map((i) => ({ DeleteRequest: { Key: { user_id: i.user_id, pin_key: i.pin_key } } })))
  console.log(`deleted pins: ${pins.length}`)
  const rows = scanTestRows(schedulesTable, ['room_code', 'schedule_slot']).filter((i) => isTestRoom(i.room_code?.S))
  batchWrite(schedulesTable, rows.map((i) => ({ DeleteRequest: { Key: { room_code: i.room_code, schedule_slot: i.schedule_slot } } })))
  console.log(`deleted schedule rows: ${rows.length}`)
}

if (cmd === 'status') {
  console.log(`test users:    ${listTestUsers().length}`)
  console.log(`test pins:     ${scanTestRows(pinsTable, ['user_id']).length}`)
  console.log(`test schedule: ${scanTestRows(schedulesTable, ['room_code']).length}`)
}
