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

const EVENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS_UTC = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** True when value is a 24-hour time string in HH:MM format (00:00..23:59). */
export function isValidTime24h(value) {
  return typeof value === 'string' && TIME_24H_PATTERN.test(value);
}

function parseMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Returns the 3-letter weekday ('SUN'..'SAT') for a valid YYYY-MM-DD date. */
export function getWeekdayFromEventDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return WEEKDAYS_UTC[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** True when value is a real calendar date written as YYYY-MM-DD (e.g. rejects 2026-02-30). */
export function isValidEventDate(value) {
  if (typeof value !== 'string' || !EVENT_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function normalizeEventType(eventType) {
  return typeof eventType === 'string' ? eventType.toLowerCase() : eventType;
}

function isExamType(eventType) {
  return typeof eventType === 'string' && eventType.toLowerCase() === 'exam';
}

function badRequest(message) {
  return {
    statusCode: 400,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}

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

    const { room_code, start_time, event_code, end_time, event_name } = body;
    let { day_of_week } = body;
    // Stored lowercase so DynamoDB conditions that compare event_type match every spelling.
    const event_type = normalizeEventType(body.event_type);

    if (!isValidTime24h(start_time)) {
      return badRequest('Invalid start_time: use 24-hour HH:MM format (00:00–23:59)');
    }
    if (end_time !== undefined && end_time !== null && end_time !== '') {
      if (!isValidTime24h(end_time)) {
        return badRequest('Invalid end_time: use 24-hour HH:MM format (00:00–23:59)');
      }
      if (parseMinutes(end_time) <= parseMinutes(start_time)) {
        return badRequest('Invalid time range: end_time must be after start_time');
      }
    }

    // event_date is optional, but when present it must be a real YYYY-MM-DD date,
    // and exam rows must always carry one.
    const hasEventDate = body.event_date !== undefined && body.event_date !== null && body.event_date !== '';
    if (hasEventDate && !isValidEventDate(body.event_date)) {
      return badRequest('Invalid event_date: use a real calendar date in YYYY-MM-DD format');
    }
    if (isExamType(event_type) && !hasEventDate) {
      return badRequest('event_date is required for exam rows (YYYY-MM-DD)');
    }
    const event_date = hasEventDate ? body.event_date : undefined;
    if (event_date) {
      day_of_week = getWeekdayFromEventDate(event_date);
    }

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
      ...(event_date !== undefined && { event_date }),
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
