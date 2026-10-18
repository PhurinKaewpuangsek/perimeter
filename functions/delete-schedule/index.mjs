import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultySchedules';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function getCallerGroups(event) {
  const rawGroups = event?.requestContext?.authorizer?.claims?.['cognito:groups'];
  if (!rawGroups) return [];
  if (Array.isArray(rawGroups)) return rawGroups;
  if (typeof rawGroups === 'string') {
    const cleaned = rawGroups.replace(/[\[\]]/g, '');
    return cleaned.split(',').map((g) => g.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Builds the Lambda handler around an injectable document client, for unit testing.
 * @param {{ docClient?: DynamoDBDocumentClient, tableName?: string }} deps
 */
export function createHandler({ docClient = defaultDocClient, tableName = TABLE_NAME } = {}) {
  /**
   * Lambda handler for deleting a schedule slot from DynamoDB.
   * Path: DELETE /api/schedules/{room_code}/{schedule_slot}
   */
  return async function deleteSchedule(event) {
    const groups = getCallerGroups(event);
    if (!groups.includes('admin')) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Forbidden: Insufficient privileges' }),
      };
    }
    const rawRoomCode = event.pathParameters?.room_code || '';
    const roomCode = decodeURIComponent(rawRoomCode);
    if (!roomCode) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing room_code in path parameters' }),
      };
    }

    const rawScheduleSlot = event.pathParameters?.schedule_slot || '';
    const scheduleSlot = decodeURIComponent(rawScheduleSlot);
    if (!scheduleSlot) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing schedule_slot in path parameters' }),
      };
    }

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { room_code: roomCode, schedule_slot: scheduleSlot },
        })
      );

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'Schedule deleted successfully' }),
      };
    } catch (error) {
      console.error('Error deleting schedule:', error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Failed to delete schedule',
          message: error.message,
        }),
      };
    }
  };
}

export const handler = createHandler();
