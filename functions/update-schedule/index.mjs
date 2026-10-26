import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultySchedules';
const LOCATIONS_TABLE_NAME = process.env.LOCATIONS_TABLE_NAME || 'SmartFacultyLocations';

const TARGET_ROOM_NOT_FOUND = 'Target room not found';
const TARGET_SLOT_CONFLICT = 'มีรายการเวลา/รหัสเดียวกันในห้องนั้นแล้ว';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT,OPTIONS',
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

const UPDATABLE_FIELDS = ['end_time', 'event_name', 'event_type', 'day_of_week', 'start_time', 'event_code', 'event_date'];

const EVENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS_UTC = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const EXAM_DATE_REQUIRED = 'event_date is required for exam rows (YYYY-MM-DD)';

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

/** Reads the move target from the body. Returns null when the row stays in its room. */
function parseMoveTarget(body, currentRoomCode) {
  if (body.room_code === undefined || body.room_code === null) return null;
  if (typeof body.room_code !== 'string') return { error: 'room_code must be a string' };
  const targetRoomCode = body.room_code.trim();
  if (!targetRoomCode || targetRoomCode === currentRoomCode) return null;

  // SmartFacultyLocations is keyed by location_id (e.g. LC3-F1-R105), not room_code
  // (LC3-105), so the client also names the target location to allow a single GetItem.
  const targetLocationId = typeof body.location_id === 'string' ? body.location_id.trim() : '';
  if (!targetLocationId) return { error: 'location_id of the target room is required when changing room_code' };
  return { targetRoomCode, targetLocationId };
}

/** True when the transaction failed because a given item's condition did not hold. */
function transactionConditionFailed(error, index) {
  return error?.CancellationReasons?.[index]?.Code === 'ConditionalCheckFailed';
}

export function createHandler({
  docClient = defaultDocClient,
  tableName = TABLE_NAME,
  locationsTableName = LOCATIONS_TABLE_NAME,
} = {}) {
  return async function updateSchedule(event) {
    const groups = getCallerGroups(event);
    if (!groups.includes('staff') && !groups.includes('admin')) {
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

    const updateData = {};
    for (const field of UPDATABLE_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Stored lowercase so the exam-date condition below (event_type = 'exam') matches every spelling.
    if (updateData.event_type !== undefined) {
      updateData.event_type = normalizeEventType(updateData.event_type);
    }

    const [slotDayFromPath, slotStartFromPath] = scheduleSlot.split('#');

    // event_date: null or '' clears it; any other value must be a real YYYY-MM-DD date.
    let clearEventDate = false;
    if (updateData.event_date !== undefined) {
      if (updateData.event_date === null || updateData.event_date === '') {
        clearEventDate = true;
        delete updateData.event_date;
      } else if (!isValidEventDate(updateData.event_date)) {
        return badRequest('Invalid event_date: use a real calendar date in YYYY-MM-DD format');
      } else {
        const expectedWeekday = getWeekdayFromEventDate(updateData.event_date);
        if (updateData.day_of_week !== undefined || expectedWeekday !== slotDayFromPath) {
          updateData.day_of_week = expectedWeekday;
        }
      }
    }

    if (updateData.start_time !== undefined && !isValidTime24h(updateData.start_time)) {
      return badRequest('Invalid start_time: use 24-hour HH:MM format (00:00–23:59)');
    }
    if (updateData.end_time !== undefined && !isValidTime24h(updateData.end_time)) {
      return badRequest('Invalid end_time: use 24-hour HH:MM format (00:00–23:59)');
    }
    const effectiveStartForRange = updateData.start_time ?? slotStartFromPath;
    if (
      updateData.end_time &&
      isValidTime24h(effectiveStartForRange) &&
      parseMinutes(updateData.end_time) <= parseMinutes(effectiveStartForRange)
    ) {
      return badRequest('Invalid time range: end_time must be after start_time');
    }

    if (isExamType(updateData.event_type) && clearEventDate) {
      return badRequest(EXAM_DATE_REQUIRED);
    }

    const move = parseMoveTarget(body, roomCode);
    if (move?.error) return badRequest(move.error);

    if (Object.keys(updateData).length === 0 && !clearEventDate && !move) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'No fields provided for update' }),
      };
    }

    const updatedBy = getCallerIdentity(event);
    const updatedAt = new Date().toISOString();

    try {
      if (move) {
        const target = await docClient.send(new GetCommand({
          TableName: locationsTableName,
          Key: { location_id: move.targetLocationId },
        }));
        if (!target.Item || target.Item.room_code !== move.targetRoomCode) {
          return badRequest(TARGET_ROOM_NOT_FOUND);
        }
      }

      // The key is (room_code, schedule_slot): changing either one re-creates the row.
      if (move || updateData.day_of_week || updateData.start_time || updateData.event_code) {
        const getResult = await docClient.send(new GetCommand({
          TableName: tableName,
          Key: { room_code: roomCode, schedule_slot: scheduleSlot }
        }));
        if (!getResult.Item) {
          return {
            statusCode: 404,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Schedule not found' })
          };
        }
        
        const oldItem = getResult.Item;
        const newTime = updateData.start_time || oldItem.start_time;
        const newEndTime = updateData.end_time !== undefined ? updateData.end_time : oldItem.end_time;
        if (isValidTime24h(newTime) && isValidTime24h(newEndTime) && parseMinutes(newEndTime) <= parseMinutes(newTime)) {
          return badRequest('Invalid time range: end_time must be after start_time');
        }
        const effectiveEventDate = clearEventDate ? undefined : (updateData.event_date || oldItem.event_date);
        const newDay =
          effectiveEventDate && isValidEventDate(effectiveEventDate)
            ? getWeekdayFromEventDate(effectiveEventDate)
            : updateData.day_of_week || oldItem.day_of_week;
        updateData.day_of_week = newDay;
        const newCourse = updateData.event_code || oldItem.event_code;
        const newScheduleSlot = `${newDay}#${newTime}#${newCourse}`;
        const newRoomCode = move ? move.targetRoomCode : roomCode;

        if (newScheduleSlot !== scheduleSlot || newRoomCode !== roomCode) {
          const newItem = {
            ...oldItem,
            ...updateData,
            room_code: newRoomCode,
            schedule_slot: newScheduleSlot,
            updatedBy,
            updatedAt,
          };
          if (clearEventDate) delete newItem.event_date;
          if (isExamType(newItem.event_type) && !isValidEventDate(newItem.event_date)) {
            return badRequest(EXAM_DATE_REQUIRED);
          }
          
          await docClient.send(new TransactWriteCommand({
            TransactItems: [
              { Delete: { TableName: tableName, Key: { room_code: roomCode, schedule_slot: scheduleSlot }, ConditionExpression: 'attribute_exists(schedule_slot)' } },
              { Put: { TableName: tableName, Item: newItem, ConditionExpression: 'attribute_not_exists(schedule_slot)' } }
            ]
          }));
          return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              message: newRoomCode !== roomCode ? 'Schedule moved successfully' : 'Schedule re-created successfully',
              data: newItem,
            }),
          };
        }
      }

      updateData.updatedBy = updatedBy;
      updateData.updatedAt = updatedAt;

      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      Object.keys(updateData).forEach((key, index) => {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = updateData[key];
      });

      let updateExpression = `SET ${updateExpressions.join(', ')}`;
      if (clearEventDate) {
        expressionAttributeNames['#eventDate'] = 'event_date';
        updateExpression += ' REMOVE #eventDate';
      }

      // Keep exam rows dated: the stored row is checked atomically when this
      // update would leave an exam without a date.
      let conditionExpression = 'attribute_exists(schedule_slot)';
      if (isExamType(updateData.event_type) && updateData.event_date === undefined) {
        expressionAttributeNames['#eventDate'] = 'event_date';
        conditionExpression += ' AND attribute_exists(#eventDate)';
      } else if (updateData.event_type === undefined && clearEventDate) {
        expressionAttributeNames['#eventType'] = 'event_type';
        expressionAttributeValues[':examType'] = 'exam';
        conditionExpression += ' AND NOT (#eventType = :examType)';
      }

      const result = await docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { room_code: roomCode, schedule_slot: scheduleSlot },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: 'ALL_NEW',
          ConditionExpression: conditionExpression,
          ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
        })
      );

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: 'Schedule updated successfully',
          data: result.Attributes,
        }),
      };
    } catch (error) {
      console.error('Error updating schedule:', error);
      if (error.name === 'ConditionalCheckFailedException') {
        // The row exists but would become an exam without a date.
        if (error.Item) return badRequest(EXAM_DATE_REQUIRED);
        return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Schedule slot not found' }) };
      }
      if (error.name === 'TransactionCanceledException') {
        // TransactItems: [0] Delete of the source row, [1] Put of the new row.
        if (transactionConditionFailed(error, 0)) {
          return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Schedule slot not found' }) };
        }
        if (transactionConditionFailed(error, 1)) {
          return { statusCode: 409, headers: CORS_HEADERS, body: JSON.stringify({ error: TARGET_SLOT_CONFLICT }) };
        }
        return { statusCode: 409, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Schedule slot conflict: target slot already exists or source was deleted' }) };
      }
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Failed to update schedule',
          message: error.message,
        }),
      };
    }
  };
}

export const handler = createHandler();
