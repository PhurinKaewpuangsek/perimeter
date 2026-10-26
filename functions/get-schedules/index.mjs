import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultySchedules';
const DEFAULT_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const MAX_ROOM_CACHE_SIZE = 100; // Prevent unbounded memory growth from arbitrary query params

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

/** Reads every item out of the schedules table, following LastEvaluatedKey until done. */
async function scanAllSchedules(docClient, tableName) {
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

/** Reads every schedule for one room by its partition key. */
async function queryRoomSchedules(docClient, tableName, roomCode) {
  const records = [];
  let exclusiveStartKey;

  do {
    const page = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'room_code = :roomCode',
        ExpressionAttributeValues: { ':roomCode': roomCode },
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

/** Builds the Lambda handler around an injectable document client, for unit testing. */
export function createHandler({
  docClient = defaultDocClient,
  tableName = TABLE_NAME,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  now = () => new Date(),
} = {}) {
  let cachedAllRecords = null;
  let cachedAllAt = 0;
  const roomCache = new Map(); // roomCode -> { records, cachedAt }

  return async function getSchedules(event = {}) {
    try {
      const roomCode = event.queryStringParameters?.room_code?.trim();
      const forceFresh = event.queryStringParameters?.fresh === '1';
      const currentTime = typeof now === 'function' ? now().getTime() : Date.now();
      let records;

      if (roomCode) {
        const cached = roomCache.get(roomCode);
        if (!forceFresh && cached && currentTime - cached.cachedAt < cacheTtlMs) {
          records = cached.records;
        } else {
          records = await queryRoomSchedules(docClient, tableName, roomCode);
          if (!roomCache.has(roomCode) && roomCache.size >= MAX_ROOM_CACHE_SIZE) {
            const oldestKey = roomCache.keys().next().value;
            roomCache.delete(oldestKey);
          }
          roomCache.set(roomCode, { records, cachedAt: currentTime });
          if (forceFresh) {
            cachedAllRecords = null;
            cachedAllAt = 0;
          }
        }
      } else {
        if (forceFresh || !cachedAllRecords || currentTime - cachedAllAt >= cacheTtlMs) {
          cachedAllRecords = await scanAllSchedules(docClient, tableName);
          cachedAllAt = currentTime;
          if (forceFresh) {
            roomCache.clear();
          }
        }
        records = cachedAllRecords;
      }

      return {
        statusCode: 200,
        headers: forceFresh ? FRESH_HEADERS : SUCCESS_HEADERS,
        body: JSON.stringify({ count: records.length, records }),
      };
    } catch (error) {
      console.error('Error fetching schedules:', error);
      return {
        statusCode: 500,
        headers: ERROR_HEADERS,
        body: JSON.stringify({
          error: 'Failed to fetch schedules',
          message: error.message,
        }),
      };
    }
  };
}

/**
 * Lambda handler for reading class/exam schedule slots from DynamoDB.
 * A room_code query parameter reads only that room; without it, all records are returned.
 * Path: GET /api/schedules
 */
export const handler = createHandler();
