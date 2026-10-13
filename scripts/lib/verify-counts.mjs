/**
 * Verification helpers for deployment health checks.
 *
 * Ensures that production DynamoDB tables and API endpoints hold all
 * seeded records, while tolerating additional records introduced by
 * administrative edits.
 */

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
