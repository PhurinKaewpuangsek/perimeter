/**
 * Verification helpers for deployment health checks.
 *
 * Ensures that production DynamoDB tables and API endpoints hold all
 * seeded records (by verifying primary keys), while tolerating additional
 * records introduced by administrative edits.
 */

/**
 * Asserts that all expected seed keys are present in actualKeys.
 * Throws if any required seed key is missing, identifying missing keys in the error.
 *
 * @param {Iterable<string>} actualKeys
 * @param {Iterable<string>} expectedKeys
 * @param {string} entityName
 * @param {string} [hint]
 */
export function verifySeedKeys(actualKeys, expectedKeys, entityName, hint = 'run: npm run seed') {
  const actualSet = new Set(actualKeys)
  const missing = []
  for (const key of expectedKeys) {
    if (!actualSet.has(key)) {
      missing.push(key)
    }
  }
  if (missing.length > 0) {
    const preview = missing.slice(0, 3).join(', ') + (missing.length > 3 ? ` (+${missing.length - 3} more)` : '')
    const suffix = hint ? ` — ${hint}` : ''
    throw new Error(`${entityName} missing ${missing.length} seeded key(s): ${preview}${suffix}`)
  }
}

/**
 * Asserts that a DynamoDB table holds at least the expected number of seed records.
 * Throws if the count is lower than expected or non-finite, tolerates higher counts (e.g. admin additions).
 *
 * @param {number} actualCount
 * @param {number} expectedCount
 * @param {string} tableName
 */
export function verifyTableCount(actualCount, expectedCount, tableName) {
  if (!Number.isFinite(actualCount) || actualCount < expectedCount) {
    throw new Error(
      `${tableName} holds ${actualCount}, expected at least ${expectedCount} — run: npm run seed`
    )
  }
}

/**
 * Asserts that an API endpoint returns at least the expected number of seed records.
 * Throws if the count is lower than expected or non-finite, tolerates higher counts (e.g. admin additions).
 *
 * @param {number} actualCount
 * @param {number} expectedCount
 * @param {string} resourceName
 */
export function verifyApiCount(actualCount, expectedCount, resourceName) {
  if (!Number.isFinite(actualCount) || actualCount < expectedCount) {
    throw new Error(
      `${resourceName} API returned ${actualCount} records, expected at least ${expectedCount}`
    )
  }
}

/**
 * Asserts both count and presence of required seed keys in table records.
 *
 * @param {object} params
 * @param {Iterable<string>} params.actualKeys
 * @param {Iterable<string>} params.expectedKeys
 * @param {number} params.actualCount
 * @param {number} params.expectedCount
 * @param {string} params.tableName
 */
export function verifyTableRecords({ actualKeys, expectedKeys, actualCount, expectedCount, tableName }) {
  verifyTableCount(actualCount, expectedCount, tableName)
  verifySeedKeys(actualKeys, expectedKeys, tableName, 'run: npm run seed')
}

/**
 * Asserts both count and presence of required seed keys in API records.
 * Also verifies envelope count matches the returned records array length.
 *
 * @param {object} params
 * @param {Array<object>} params.actualRecords
 * @param {Iterable<string>} params.expectedKeys
 * @param {number} [params.actualCount]
 * @param {(record: object) => string} params.getKey
 * @param {string} params.resourceName
 */
export function verifyApiRecords({ actualRecords, expectedKeys, actualCount, getKey, resourceName }) {
  const records = Array.isArray(actualRecords) ? actualRecords : []
  const expectedArray = Array.from(expectedKeys)
  const count = Number.isFinite(actualCount) ? actualCount : records.length

  verifyApiCount(count, expectedArray.length, resourceName)

  if (Number.isFinite(actualCount) && actualCount !== records.length) {
    throw new Error(
      `${resourceName} API envelope count (${actualCount}) does not match records length (${records.length})`
    )
  }

  const actualKeys = records.map(getKey).filter(Boolean)
  verifySeedKeys(actualKeys, expectedArray, `${resourceName} API`, '')
}
