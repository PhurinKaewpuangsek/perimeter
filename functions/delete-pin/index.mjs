import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultyPins';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function safeDecode(val) {
  if (!val || typeof val !== 'string') return '';
  try {
    return decodeURIComponent(val).trim();
  } catch {
    return val.trim();
  }
}

/**
 * Builds the Lambda handler around an injectable document client, for unit testing.
 * @param {{ docClient?: DynamoDBDocumentClient, tableName?: string }} deps
 */
export function createHandler({ docClient = defaultDocClient, tableName = TABLE_NAME } = {}) {
  /**
   * Lambda handler for removing a pinned schedule slot for an authenticated user.
   * Path: DELETE /api/pins/{room_code}/{schedule_slot}
   */
  return async function deletePin(event) {
    const claims = event?.requestContext?.authorizer?.claims;
    const sub = claims?.sub;

    if (!sub) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Unauthorized: Missing or invalid authentication token' }),
      };
    }

    const roomCode = safeDecode(
      event?.pathParameters?.room_code || event?.queryStringParameters?.room_code
    );
    if (!roomCode) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing room_code in path parameters' }),
      };
    }

    const scheduleSlot = safeDecode(
      event?.pathParameters?.schedule_slot || event?.queryStringParameters?.schedule_slot
    );
    if (!scheduleSlot) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing schedule_slot in path parameters' }),
      };
    }

    const pinKey = `${roomCode}#${scheduleSlot}`;

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            user_id: sub, // strictly authenticated user's sub
            pin_key: pinKey,
          },
        })
      );

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'Pin deleted successfully' }),
      };
    } catch (error) {
      console.error('Error deleting pin:', error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Failed to delete pin',
          message: error.message,
        }),
      };
    }
  };
}

export const handler = createHandler();
