import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildScheduleRows, chunk, isTestEmail, isTestRoom, testEmail } from './lib.mjs'

test('isTestRoom only matches LOADTEST- rooms', () => {
  assert.equal(isTestRoom('LOADTEST-R01'), true)
  assert.equal(isTestRoom('LC3-101/1'), false)
  assert.equal(isTestRoom(undefined), false)
})

test('isTestEmail never matches real or demo accounts', () => {
  assert.equal(isTestEmail(testEmail(1)), true)
  assert.equal(isTestEmail('admin@torch.dev'), false)
  assert.equal(isTestEmail('user@torch.dev'), false)
  assert.equal(isTestEmail('loadtest01@gmail.com'), false)
  assert.equal(isTestEmail('xloadtest01@torch.dev'), false)
})

test('buildScheduleRows makes hundreds of unique, test-only rows', () => {
  const rows = buildScheduleRows()
  assert.ok(rows.length >= 100)
  assert.ok(rows.every((r) => isTestRoom(r.room_code)))
  assert.equal(new Set(rows.map((r) => r.room_code + r.schedule_slot)).size, rows.length)
})

test('chunk splits into batches of the given size', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})
