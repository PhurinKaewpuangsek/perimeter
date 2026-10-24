import assert from 'node:assert/strict'
import test from 'node:test'
import { expectedGraphKeys } from './lib/stack.mjs'
import {
  verifyApiCount,
  verifyApiRecords,
  verifyGraphApi,
  verifySeedKeys,
  verifyTableCount,
  verifyTableRecords,
} from './lib/verify-counts.mjs'

test('verifyTableCount — passes when production table has more rows than the seed (admin-added data)', () => {
  assert.doesNotThrow(() => {
    verifyTableCount(220, 219, 'SmartFacultySchedules')
  })
  assert.doesNotThrow(() => {
    verifyTableCount(135, 131, 'SmartFacultyLocations')
  })
})

test('verifyTableCount — passes when production table has exact seed row count', () => {
  assert.doesNotThrow(() => {
    verifyTableCount(219, 219, 'SmartFacultySchedules')
  })
  assert.doesNotThrow(() => {
    verifyTableCount(131, 131, 'SmartFacultyLocations')
  })
})

test('verifyTableCount — fails when seeded rows are missing', () => {
  assert.throws(
    () => verifyTableCount(218, 219, 'SmartFacultySchedules'),
    /SmartFacultySchedules holds 218, expected at least 219 — run: npm run seed/
  )
  assert.throws(
    () => verifyTableCount(0, 131, 'SmartFacultyLocations'),
    /SmartFacultyLocations holds 0, expected at least 131 — run: npm run seed/
  )
})

test('verifyTableCount — fails when actual count is invalid or non-numeric (including NaN)', () => {
  assert.throws(
    () => verifyTableCount(undefined, 219, 'SmartFacultySchedules'),
    /SmartFacultySchedules holds undefined, expected at least 219 — run: npm run seed/
  )
  assert.throws(
    () => verifyTableCount(null, 131, 'SmartFacultyLocations'),
    /SmartFacultyLocations holds null, expected at least 131 — run: npm run seed/
  )
  assert.throws(
    () => verifyTableCount(NaN, 219, 'SmartFacultySchedules'),
    /SmartFacultySchedules holds NaN, expected at least 219 — run: npm run seed/
  )
})

test('verifyApiCount — passes when API returns more rows than the seed (admin-added data)', () => {
  assert.doesNotThrow(() => {
    verifyApiCount(220, 219, 'Schedules')
  })
  assert.doesNotThrow(() => {
    verifyApiCount(135, 131, 'Locations')
  })
})

test('verifyApiCount — passes when API returns exact seed row count', () => {
  assert.doesNotThrow(() => {
    verifyApiCount(219, 219, 'Schedules')
  })
  assert.doesNotThrow(() => {
    verifyApiCount(131, 131, 'Locations')
  })
})

test('verifyApiCount — fails when seeded rows are missing in API response', () => {
  assert.throws(
    () => verifyApiCount(218, 219, 'Schedules'),
    /Schedules API returned 218 records, expected at least 219/
  )
  assert.throws(
    () => verifyApiCount(0, 131, 'Locations'),
    /Locations API returned 0 records, expected at least 131/
  )
})

test('verifyApiCount — fails when API returned count is invalid or non-numeric (including NaN)', () => {
  assert.throws(
    () => verifyApiCount(undefined, 219, 'Schedules'),
    /Schedules API returned undefined records, expected at least 219/
  )
  assert.throws(
    () => verifyApiCount(NaN, 219, 'Schedules'),
    /Schedules API returned NaN records, expected at least 219/
  )
})

/* -------------------------------------------------------------------------
 * Primary Key Verification Tests (Addressing Copilot Review & Issue #89)
 * ------------------------------------------------------------------------- */

test('verifySeedKeys — passes when all seed keys are present along with admin-added keys', () => {
  const seedKeys = ['seed-1', 'seed-2', 'seed-3']
  const actualKeys = ['seed-1', 'seed-2', 'seed-3', 'admin-custom-1']

  assert.doesNotThrow(() => {
    verifySeedKeys(actualKeys, seedKeys, 'TestTable')
  })
})

test('verifySeedKeys — passes when actual keys match seed keys exactly', () => {
  const seedKeys = ['seed-1', 'seed-2']
  const actualKeys = ['seed-1', 'seed-2']

  assert.doesNotThrow(() => {
    verifySeedKeys(actualKeys, seedKeys, 'TestTable')
  })
})

test('verifySeedKeys — fails when a seed key is missing even if total count matches or exceeds seed (deleted seed offset by admin item)', () => {
  const seedKeys = ['seed-1', 'seed-2', 'seed-3']
  // Notice total length is 3 (same as seedKeys.length), but 'seed-2' was deleted and replaced by 'admin-extra'
  const actualKeysWithOffset = ['seed-1', 'seed-3', 'admin-extra']

  assert.throws(
    () => verifySeedKeys(actualKeysWithOffset, seedKeys, 'SmartFacultySchedules'),
    /SmartFacultySchedules missing 1 seeded key\(s\): seed-2 — run: npm run seed/
  )

  // Even when total length is 4 (greater than seedKeys.length)
  const actualKeysWithHigherCount = ['seed-1', 'seed-3', 'admin-extra-1', 'admin-extra-2']
  assert.throws(
    () => verifySeedKeys(actualKeysWithHigherCount, seedKeys, 'SmartFacultyLocations'),
    /SmartFacultyLocations missing 1 seeded key\(s\): seed-2 — run: npm run seed/
  )
})

test('verifyTableRecords — passes when all seed keys are present and count >= expected', () => {
  const seedKeys = ['loc-1', 'loc-2']
  const actualKeys = ['loc-1', 'loc-2', 'admin-loc-3']

  assert.doesNotThrow(() => {
    verifyTableRecords({
      actualKeys,
      expectedKeys: seedKeys,
      actualCount: actualKeys.length,
      expectedCount: seedKeys.length,
      tableName: 'SmartFacultyLocations',
    })
  })
})

test('verifyTableRecords — fails when count is below expected', () => {
  const seedKeys = ['loc-1', 'loc-2', 'loc-3']
  const actualKeys = ['loc-1']

  assert.throws(
    () =>
      verifyTableRecords({
        actualKeys,
        expectedKeys: seedKeys,
        actualCount: 1,
        expectedCount: 3,
        tableName: 'SmartFacultyLocations',
      }),
    /SmartFacultyLocations holds 1, expected at least 3 — run: npm run seed/
  )
})

test('verifyTableRecords — fails when a seed key is missing when total count is equal (deleted seed offset by admin)', () => {
  const seedKeys = ['sched-1', 'sched-2']
  const actualKeys = ['sched-1', 'admin-sched-x'] // length 2, but sched-2 missing

  assert.throws(
    () =>
      verifyTableRecords({
        actualKeys,
        expectedKeys: seedKeys,
        actualCount: 2,
        expectedCount: 2,
        tableName: 'SmartFacultySchedules',
      }),
    /SmartFacultySchedules missing 1 seeded key\(s\): sched-2 — run: npm run seed/
  )
})

test('verifyTableRecords — fails when a seed key is missing when total count is higher (deleted seed offset by multiple admins)', () => {
  const seedKeys = ['sched-1', 'sched-2']
  const actualKeys = ['sched-1', 'admin-1', 'admin-2'] // length 3 > expected 2, but sched-2 missing

  assert.throws(
    () =>
      verifyTableRecords({
        actualKeys,
        expectedKeys: seedKeys,
        actualCount: 3,
        expectedCount: 2,
        tableName: 'SmartFacultySchedules',
      }),
    /SmartFacultySchedules missing 1 seeded key\(s\): sched-2 — run: npm run seed/
  )
})

test('verifyApiRecords — passes when API records contain all seed keys and count >= expected', () => {
  const seedKeys = ['LC3-F1-R101-1', 'LC3-F1-R102']
  const records = [
    { location_id: 'LC3-F1-R101-1' },
    { location_id: 'LC3-F1-R102' },
    { location_id: 'LC3-ADMIN-NEW' },
  ]

  assert.doesNotThrow(() => {
    verifyApiRecords({
      actualRecords: records,
      expectedKeys: seedKeys,
      actualCount: records.length,
      getKey: (r) => r.location_id,
      resourceName: 'Locations',
    })
  })
})

test('verifyApiRecords — fails when a seed key is missing from API records when count is equal', () => {
  const seedKeys = ['LC3-101#MON#08:00#CS1', 'LC3-102#TUE#09:00#CS2']
  const records = [
    { room_code: 'LC3-101', schedule_slot: 'MON#08:00#CS1' },
    { room_code: 'LC3-ADMIN', schedule_slot: 'FRI#10:00#CS9' },
  ]

  assert.throws(
    () =>
      verifyApiRecords({
        actualRecords: records,
        expectedKeys: seedKeys,
        actualCount: records.length,
        getKey: (r) => `${r.room_code}#${r.schedule_slot}`,
        resourceName: 'Schedules',
      }),
    /Schedules API missing 1 seeded key\(s\): LC3-102#TUE#09:00#CS2/
  )
})

test('verifyApiRecords — fails when a seed key is missing from API records when count is higher', () => {
  const seedKeys = ['LC3-101#MON#08:00#CS1', 'LC3-102#TUE#09:00#CS2']
  const records = [
    { room_code: 'LC3-101', schedule_slot: 'MON#08:00#CS1' },
    { room_code: 'LC3-ADMIN-1', schedule_slot: 'FRI#10:00#CS9' },
    { room_code: 'LC3-ADMIN-2', schedule_slot: 'SAT#10:00#CS8' },
  ]

  assert.throws(
    () =>
      verifyApiRecords({
        actualRecords: records,
        expectedKeys: seedKeys,
        actualCount: records.length,
        getKey: (r) => `${r.room_code}#${r.schedule_slot}`,
        resourceName: 'Schedules',
      }),
    /Schedules API missing 1 seeded key\(s\): LC3-102#TUE#09:00#CS2/
  )
})

test('verifyApiRecords — fails when envelope count does not match records array length', () => {
  const seedKeys = ['loc-1']
  const records = [{ location_id: 'loc-1' }]

  assert.throws(
    () =>
      verifyApiRecords({
        actualRecords: records,
        expectedKeys: seedKeys,
        actualCount: 999, // Desynchronized envelope count
        getKey: (r) => r.location_id,
        resourceName: 'Locations',
      }),
    /Locations API envelope count \(999\) does not match records length \(1\)/
  )
})

/* -------------------------------------------------------------------------
 * Graph verification (#143): staff closures (#147) must never fail verify
 * ------------------------------------------------------------------------- */

const graphSeedKeys = ['NODE#LC3_103', 'NODE#LC3_entry_103', 'EDGE#LC3_103|LC3_entry_103']
const graphBody = (overrides = {}) => ({
  graph_id: 'LC3',
  nodes: [
    { graph_id: 'LC3', element_id: 'NODE#LC3_103', node_id: 'LC3_103', location_id: 'LC3-F1-R103' },
    { graph_id: 'LC3', element_id: 'NODE#LC3_entry_103', node_id: 'LC3_entry_103' },
  ],
  edges: [{ graph_id: 'LC3', element_id: 'EDGE#LC3_103|LC3_entry_103', from: 'LC3_103', to: 'LC3_entry_103' }],
  ...overrides,
})

test('expectedGraphKeys — lists every node and edge of the graph seed', () => {
  const keys = expectedGraphKeys()
  assert.equal(keys.length, 590)
  assert.equal(new Set(keys).size, keys.length)
  assert.ok(keys.includes('NODE#LC3_103'))
})

test('verifyGraphApi — passes when staff have closed a seeded room and walkway', () => {
  const body = graphBody()
  const closure = { closed: true, closed_from: '2026-10-30T08:00:00+07:00', closed_until: '2026-10-30T17:00:00+07:00', closed_by: 'staff@example.com' }
  Object.assign(body.nodes[0], closure)
  Object.assign(body.edges[0], closure)

  assert.doesNotThrow(() => verifyGraphApi({ body, expectedKeys: graphSeedKeys }))
})

test('verifyGraphApi — fails when a seeded node is missing, even if another item offsets the count', () => {
  const body = graphBody({
    nodes: [
      { graph_id: 'LC3', element_id: 'NODE#LC3_103' },
      { graph_id: 'LC3', element_id: 'NODE#ADMIN-ADDED' },
    ],
  })

  assert.throws(
    () => verifyGraphApi({ body, expectedKeys: graphSeedKeys }),
    /Graph API missing 1 seeded key\(s\): NODE#LC3_entry_103/
  )
})

test('verifyGraphApi — fails on the wrong graph or a malformed envelope', () => {
  assert.throws(() => verifyGraphApi({ body: graphBody({ graph_id: 'LC9' }), expectedKeys: graphSeedKeys }), /graph_id LC9, expected LC3/)
  assert.throws(() => verifyGraphApi({ body: graphBody({ edges: undefined }), expectedKeys: graphSeedKeys }), /missing its nodes or edges array/)
  const swapped = graphBody()
  ;[swapped.nodes, swapped.edges] = [swapped.edges, swapped.nodes]
  assert.throws(() => verifyGraphApi({ body: swapped, expectedKeys: graphSeedKeys }), /under the wrong array/)
})
