import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultyLocations';
const DEFAULT_CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SUCCESS_HEADERS = {
  ...CORS_HEADERS,
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
};

const FRESH_HEADERS = {
  ...CORS_HEADERS,
  'Cache-Control': 'no-store',
};

const ERROR_HEADERS = {
  ...CORS_HEADERS,
  'Cache-Control': 'no-store',
};

/**
 * Reads every item out of the locations table.
 *
 * The dataset is 131 items today, comfortably inside a single 1 MB Scan page, but the
 * LastEvaluatedKey loop keeps the handler correct as more buildings are onboarded.
 */
async function scanAllLocations(docClient, tableName) {
  const records = [];
  let exclusiveStartKey;

  do {
    const page = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );

    if (Array.isArray(page.Items)) {
      records.push(...page.Items);
    }
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return records;
}

/**
 * Builds the Lambda handler around an injectable document client so the response
 * contract can be unit tested without reaching AWS.
 */
export function createHandler({
  docClient = defaultDocClient,
  tableName = TABLE_NAME,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  now = () => new Date(),
} = {}) {
  let cachedRecords = null;
  let cachedAt = 0;
  let cacheGeneration = 0;

  return async function getLocations(event = {}) {
    try {
      const forceFresh = event?.queryStringParameters?.fresh === '1';
      const currentTime = typeof now === 'function' ? now().getTime() : Date.now();
      let records;
      if (forceFresh || !cachedRecords || currentTime - cachedAt >= cacheTtlMs) {
        if (forceFresh) {
          cacheGeneration += 1;
        }
        const readGeneration = cacheGeneration;
        const scannedRecords = await scanAllLocations(docClient, tableName);
        if (forceFresh) {
          cacheGeneration += 1;
          cachedRecords = scannedRecords;
          cachedAt = currentTime;
        } else if (readGeneration === cacheGeneration) {
          cachedRecords = scannedRecords;
          cachedAt = currentTime;
        }
        records = scannedRecords;
      } else {
        records = cachedRecords;
      }

      // Same envelope the static rooms.json used, so the frontend parser is unchanged.
      return {
        statusCode: 200,
        headers: forceFresh ? FRESH_HEADERS : SUCCESS_HEADERS,
        body: JSON.stringify({ count: records.length, records }),
      };
    } catch (error) {
      console.error('Error scanning locations:', error);
      return {
        statusCode: 500,
        headers: ERROR_HEADERS,
        body: JSON.stringify({
          error: 'Failed to fetch locations',
          message: error.message,
        }),
      };
    }
  };
}

/**
 * Lambda handler for reading every room location from DynamoDB.
 * Path: GET /api/locations
 */
export const handler = createHandler();
