import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultyPins';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

/**
 * Reads all pinned schedules for the specified user, following LastEvaluatedKey until complete.
 */
async function queryAllPins(docClient, tableName, userId) {
  const records = [];
  let exclusiveStartKey;

  do {
    const page = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'user_id = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
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
 * Builds the Lambda handler around an injectable document client, for unit testing.
 * @param {{ docClient?: DynamoDBDocumentClient, tableName?: string }} deps
 */
export function createHandler({ docClient = defaultDocClient, tableName = TABLE_NAME } = {}) {
  /**
   * Lambda handler for retrieving pinned schedules of an authenticated user.
   * Path: GET /api/pins
   */
  return async function getPins(event) {
    const claims = event?.requestContext?.authorizer?.claims;
    const sub = claims?.sub;

    if (!sub) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Unauthorized: Missing or invalid authentication token' }),
      };
    }

    try {
      const records = await queryAllPins(docClient, tableName, sub);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ count: records.length, records }),
      };
    } catch (error) {
      console.error('Error querying pins:', error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Failed to fetch pins',
        }),
      };
    }
  };
}

export const handler = createHandler();
