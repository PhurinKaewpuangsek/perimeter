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

const UPDATABLE_FIELDS = ['end_time', 'event_name', 'event_type', 'day_of_week', 'start_time', 'event_code'];

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

    if (Object.keys(updateData).length === 0) {
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

      const result = await docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { room_code: roomCode, schedule_slot: scheduleSlot },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: 'ALL_NEW',
          ConditionExpression: 'attribute_exists(schedule_slot)',
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
