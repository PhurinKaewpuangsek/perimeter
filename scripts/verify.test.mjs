import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyApiCount, verifyTableCount } from './lib/verify-counts.mjs'

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
