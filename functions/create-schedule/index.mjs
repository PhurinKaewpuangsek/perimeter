import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultySchedules';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
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

function getCallerIdentity(event) {
  const claims = event?.requestContext?.authorizer?.claims;
  return claims?.['cognito:username'] || claims?.sub || 'unknown';
}

const REQUIRED_FIELDS = ['room_code', 'day_of_week', 'start_time', 'event_code'];

/**
 * Builds the Lambda handler around an injectable document client, for unit testing.
 * @param {{ docClient?: DynamoDBDocumentClient, tableName?: string }} deps
 */
export function createHandler({ docClient = defaultDocClient, tableName = TABLE_NAME } = {}) {
  /**
   * Lambda handler for creating a new schedule slot in DynamoDB.
   * Path: POST /api/schedules
   */
  return async function createSchedule(event) {
    const groups = getCallerGroups(event);
    if (!groups.includes('staff') && !groups.includes('admin')) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Forbidden: Insufficient privileges' }),
      };
    }

    // Parse body
    let body = {};
    if (typeof event.body === 'string') {
      try {
        body = JSON.parse(event.body);
      } catch {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid JSON in request body' }),
        };
      }
    } else if (event.body && typeof event.body === 'object') {
      body = event.body;
    }

    // Validate required fields
    for (const field of REQUIRED_FIELDS) {
      if (!body[field]) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `Missing required field: ${field}` }),
        };
      }
    }

    const { room_code, day_of_week, start_time, event_code, end_time, event_name, event_type } =
      body;

    // Auto-generate composite key
    const schedule_slot = `${day_of_week}#${start_time}#${event_code}`;
    const updatedBy = getCallerIdentity(event);
    const updatedAt = new Date().toISOString();

    const item = {
      room_code,
      schedule_slot,
      day_of_week,
      start_time,
      event_code,
      ...(end_time !== undefined && { end_time }),
      ...(event_name !== undefined && { event_name }),
      ...(event_type !== undefined && { event_type }),
      updatedBy,
      updatedAt,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(schedule_slot)',
        })
      );

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'Schedule created successfully', schedule_slot }),
      };
    } catch (error) {
      console.error('Error creating schedule:', error);
      if (error.name === 'ConditionalCheckFailedException') {
        return {
          statusCode: 409,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Schedule slot already exists', schedule_slot }),
        };
      }
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Failed to create schedule',
          message: error.message,
        }),
      };
    }
  };
}

export const handler = createHandler();
