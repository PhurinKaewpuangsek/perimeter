#!/usr/bin/env node
/**
 * Health check for your own AWS environment: infrastructure, data, API, and site.
 *
 * Answers the question "is my cloud actually working?" without anyone having to
 * remember seven aws commands. Every check prints [PASS] or [FAIL] and the run
 * continues after a failure, so one broken layer does not hide the rest.
 *
 * Usage: npm run verify
 */
import {
  awsJson,
  banner,
  expectedGraphKeys,
  expectedLocationKeys,
  expectedScheduleKeys,
  getStackOutputs,
} from './lib/stack.mjs'
import { verifyApiRecords, verifyGraphApi, verifyTableRecords } from './lib/verify-counts.mjs'

const results = []

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => results.push({ ok: true, name, detail }))
    .catch((error) => results.push({ ok: false, name, detail: error.message }))
}

const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}

banner('verify')

const { stackName, region, status, outputs } = getStackOutputs()
const expectedLocKeys = expectedLocationKeys()
const expectedSchedKeys = expectedScheduleKeys()
const expectedGraphElementKeys = expectedGraphKeys()
const expected = expectedLocKeys.length
const expectedSchedules = expectedSchedKeys.length
const expectedGraphItems = expectedGraphElementKeys.length

await check('stack status', async () => {
  expect(
    ['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(status),
    `${stackName} is ${status}`
  )
  return `${stackName} ${status} (${region})`
})

await check('stack outputs', async () => {
  const missing = [
    'ApiUrl',
    'SiteUrl',
    'SiteBucketName',
    'LocationsTableName',
    'SchedulesTableName',
    'GraphTableName',
  ].filter((key) => !outputs[key])
  expect(missing.length === 0, `missing output(s): ${missing.join(', ')}`)
  return Object.keys(outputs).length + ' outputs present'
})

await check('table item count', async () => {
  expect(Boolean(outputs.LocationsTableName), 'no Locations table to scan')
  expect(Boolean(outputs.SchedulesTableName), 'no Schedules table to scan')
  expect(Boolean(outputs.GraphTableName), 'no Graph table to scan')

  const scanTableKeys = (table, projection) => {
    const data = awsJson([
      'dynamodb',
      'scan',
      '--table-name',
      table,
      '--projection-expression',
      projection,
      '--consistent-read',
      '--region',
      region,
    ])
    return data.Items ?? []
  }

  const locItems = scanTableKeys(outputs.LocationsTableName, 'location_id')
  const locKeys = locItems.map((item) => item.location_id?.S).filter(Boolean)
  verifyTableRecords({
    actualKeys: locKeys,
    expectedKeys: expectedLocKeys,
    actualCount: locItems.length,
    expectedCount: expected,
    tableName: outputs.LocationsTableName,
  })

  const schedItems = scanTableKeys(outputs.SchedulesTableName, 'room_code, schedule_slot')
  const schedKeys = schedItems
    .map((item) => (item.room_code?.S && item.schedule_slot?.S ? `${item.room_code.S}#${item.schedule_slot.S}` : null))
    .filter(Boolean)
  verifyTableRecords({
    actualKeys: schedKeys,
    expectedKeys: expectedSchedKeys,
    actualCount: schedItems.length,
    expectedCount: expectedSchedules,
    tableName: outputs.SchedulesTableName,
  })

  // Keys only: staff closures (#147) edit graph items in place and never remove one. Only the
  // LC3 partition counts, since that is all GET /api/graph serves.
  const graphItems = scanTableKeys(outputs.GraphTableName, 'graph_id, element_id').filter(
    (item) => item.graph_id?.S === 'LC3'
  )
  verifyTableRecords({
    actualKeys: graphItems.map((item) => item.element_id?.S).filter(Boolean),
    expectedKeys: expectedGraphElementKeys,
    actualCount: graphItems.length,
    expectedCount: expectedGraphItems,
    tableName: outputs.GraphTableName,
  })

  return `${locItems.length} locs (>= ${expected}), ${schedItems.length} scheds (>= ${expectedSchedules}), ${graphItems.length} graph items (>= ${expectedGraphItems})`
})

await check('GET /api/locations & /api/schedules', async () => {
  expect(Boolean(outputs.ApiUrl), 'no ApiUrl output')
  
  const locRes = await fetch(`${outputs.ApiUrl}/api/locations`)
  expect(locRes.status === 200, `Locations HTTP ${locRes.status}`)
  expect(locRes.headers.get('access-control-allow-origin') === '*', 'missing CORS header')
  const locBody = await locRes.json()
  verifyApiRecords({
    actualRecords: locBody.records,
    expectedKeys: expectedLocKeys,
    actualCount: locBody.count,
    getKey: (r) => r.location_id,
    resourceName: 'Locations',
  })

  const schedRes = await fetch(`${outputs.ApiUrl}/api/schedules`)
  expect(schedRes.status === 200, `Schedules HTTP ${schedRes.status}`)
  expect(schedRes.headers.get('access-control-allow-origin') === '*', 'missing CORS header')
  const schedBody = await schedRes.json()
  verifyApiRecords({
    actualRecords: schedBody.records,
    expectedKeys: expectedSchedKeys,
    actualCount: schedBody.count,
    getKey: (r) => `${r.room_code}#${r.schedule_slot}`,
    resourceName: 'Schedules',
  })

  return `200 OK, seed keys present (${locBody.count} >= ${expected} locs, ${schedBody.count} >= ${expectedSchedules} scheds)`
})

await check('GET /api/graph', async () => {
  expect(Boolean(outputs.ApiUrl), 'no ApiUrl output')

  const response = await fetch(`${outputs.ApiUrl}/api/graph`)
  expect(response.status === 200, `Graph HTTP ${response.status}`)
  expect(response.headers.get('access-control-allow-origin') === '*', 'missing CORS header')
  const body = await response.json()
  verifyGraphApi({ body, expectedKeys: expectedGraphElementKeys })

  return `200 OK, ${body.nodes.length} nodes + ${body.edges.length} edges (>= ${expectedGraphItems} seeded items)`
})

await check('OPTIONS preflight', async () => {
  const response = await fetch(`${outputs.ApiUrl}/api/locations`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' },
  })
  expect([200, 204].includes(response.status), `HTTP ${response.status}`)
  const allowed = response.headers.get('access-control-allow-methods') ?? ''
  expect(/GET/.test(allowed) && /PUT/.test(allowed), `Allow-Methods is "${allowed}"`)
  return `${response.status}, allows ${allowed}`
})

await check('site root', async () => {
  expect(Boolean(outputs.SiteUrl), 'no SiteUrl output')
  const response = await fetch(outputs.SiteUrl)
  expect(response.status === 200, `HTTP ${response.status} — has the site been published? npm run site:publish`)
  const html = await response.text()
  expect(html.includes('id="root"'), 'the page served is not the app shell')
  return `200 from ${outputs.SiteUrl}`
})

await check('site SPA fallback', async () => {
  const response = await fetch(`${outputs.SiteUrl}/this-path-does-not-exist`)
  const html = await response.text()
  // An S3 website endpoint serves ErrorDocument with the 404 status, and only
  // CloudFront could rewrite that to 200. What matters is that the browser gets the
  // app shell rather than S3's XML error page, so the app still loads on a deep link.
  expect(
    html.includes('id="root"'),
    `HTTP ${response.status} and the body is not the app shell — ErrorDocument is not index.html`
  )
  return `unknown paths return the app (HTTP ${response.status}, as S3 website endpoints do)`
})

console.log('')
for (const { ok, name, detail } of results) {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name} — ${detail}`)
}

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
if (failed) process.exit(1)
