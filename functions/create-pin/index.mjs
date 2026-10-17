import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultyPins';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function normalizeText(val) {
  return typeof val === 'string' ? val.trim() : '';
}

/**
 * Builds the Lambda handler around an injectable document client, for unit testing.
 * @param {{ docClient?: DynamoDBDocumentClient, tableName?: string }} deps
 */
export function createHandler({ docClient = defaultDocClient, tableName = TABLE_NAME } = {}) {
  /**
   * Lambda handler for pinning a schedule slot for an authenticated user.
   * Path: POST /api/pins
   */
  return async function createPin(event) {
    const claims = event?.requestContext?.authorizer?.claims;
    const sub = claims?.sub;

    if (!sub) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Unauthorized: Missing or invalid authentication token' }),
      };
    }

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

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      body = {};
    }

    const room_code = normalizeText(body.room_code || body.roomCode);
    const schedule_slot = normalizeText(body.schedule_slot || body.scheduleSlot);

    if (!room_code) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required field: room_code' }),
      };
    }

    if (!schedule_slot) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required field: schedule_slot' }),
      };
    }

    const event_code = normalizeText(body.event_code || body.eventCode);
    const event_name = normalizeText(body.event_name || body.eventName);
    const day_of_week = normalizeText(body.day_of_week || body.dayOfWeek);
    const start_time = normalizeText(body.start_time || body.startTime);
    const end_time = normalizeText(body.end_time || body.endTime);
    const event_type = normalizeText(body.event_type || body.eventType) || 'class';
    const event_date = normalizeText(body.event_date || body.eventDate);

    const pin_key = `${room_code}#${schedule_slot}`;
    const created_at = new Date().toISOString();

    const item = {
      user_id: sub, // strictly authenticated user's sub
      pin_key,
      room_code,
      schedule_slot,
      event_code,
      event_name,
      day_of_week,
      start_time,
      end_time,
      event_type,
      ...(event_date && { event_date }),
      created_at,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
        })
      );

      return {
        statusCode: 201,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: 'Schedule pinned successfully',
          pin: item,
        }),
      };
    } catch (error) {
      console.error('Error pinning schedule:', error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Failed to pin schedule',
        }),
      };
    }
  };
}

export const handler = createHandler();
