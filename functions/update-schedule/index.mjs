import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultySchedules';

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
const EXAM_DATE_REQUIRED = 'event_date is required for exam rows (YYYY-MM-DD)';

/** True when value is a real calendar date written as YYYY-MM-DD (e.g. rejects 2026-02-30). */
export function isValidEventDate(value) {
  if (typeof value !== 'string' || !EVENT_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
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

export function createHandler({ docClient = defaultDocClient, tableName = TABLE_NAME } = {}) {
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

    // event_date: null or '' clears it; any other value must be a real YYYY-MM-DD date.
    let clearEventDate = false;
    if (updateData.event_date !== undefined) {
      if (updateData.event_date === null || updateData.event_date === '') {
        clearEventDate = true;
        delete updateData.event_date;
      } else if (!isValidEventDate(updateData.event_date)) {
        return badRequest('Invalid event_date: use a real calendar date in YYYY-MM-DD format');
      }
    }

    if (isExamType(updateData.event_type) && clearEventDate) {
      return badRequest(EXAM_DATE_REQUIRED);
    }

    if (Object.keys(updateData).length === 0 && !clearEventDate) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'No fields provided for update' }),
      };
    }

    const updatedBy = getCallerIdentity(event);
    const updatedAt = new Date().toISOString();

    try {
      if (updateData.day_of_week || updateData.start_time || updateData.event_code) {
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
        const newDay = updateData.day_of_week || oldItem.day_of_week;
        const newTime = updateData.start_time || oldItem.start_time;
        const newCourse = updateData.event_code || oldItem.event_code;
        const newScheduleSlot = `${newDay}#${newTime}#${newCourse}`;
        
        if (newScheduleSlot !== scheduleSlot) {
          const newItem = {
            ...oldItem,
            ...updateData,
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
            body: JSON.stringify({ message: 'Schedule re-created successfully', data: newItem }),
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
