import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultySchedules';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
export function createHandler({ docClient = defaultDocClient, tableName = TABLE_NAME } = {}) {
  return async function getSchedules(event = {}) {
    try {
      const roomCode = event.queryStringParameters?.room_code?.trim();
      const records = roomCode
        ? await queryRoomSchedules(docClient, tableName, roomCode)
        : await scanAllSchedules(docClient, tableName);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ count: records.length, records }),
      };
    } catch (error) {
      console.error('Error fetching schedules:', error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
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
