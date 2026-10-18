import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, BatchWriteCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultyLocations';
const SCHEDULES_TABLE_NAME = process.env.SCHEDULES_TABLE_NAME || 'SmartFacultySchedules';

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
 * @param {{ docClient?: DynamoDBDocumentClient, tableName?: string, schedulesTableName?: string }} deps
 */
export function createHandler({ docClient = defaultDocClient, tableName = TABLE_NAME, schedulesTableName = SCHEDULES_TABLE_NAME } = {}) {
  return async function deleteLocation(event) {
    const groups = getCallerGroups(event);
    if (!groups.includes('admin')) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Forbidden: Insufficient privileges' }),
      };
    }

    const rawLocationId = event.pathParameters?.location_id || '';
    const locationId = decodeURIComponent(rawLocationId);
    if (!locationId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing location_id in path parameters' }),
      };
    }

    try {
      // 1. Get the room to find its room_code
      const getRes = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { location_id: locationId },
        })
      );

      const room = getRes.Item;

      // 2. If room exists and has a room_code, cascade delete its schedules
      if (room && room.room_code) {
        let lastEvaluatedKey = undefined;
        do {
          const queryRes = await docClient.send(
            new QueryCommand({
              TableName: schedulesTableName,
              KeyConditionExpression: 'room_code = :rc',
              ExpressionAttributeValues: {
                ':rc': room.room_code,
              },
              ExclusiveStartKey: lastEvaluatedKey,
            })
          );
          
          lastEvaluatedKey = queryRes.LastEvaluatedKey;
          const schedules = queryRes.Items || [];

          // Batch delete schedules in chunks of 25 (DynamoDB limit)
          for (let i = 0; i < schedules.length; i += 25) {
            const chunk = schedules.slice(i, i + 25);
            let deleteRequests = chunk.map((s) => ({
              DeleteRequest: {
                Key: {
                  room_code: s.room_code,
                  schedule_slot: s.schedule_slot,
                },
              },
            }));

            while (deleteRequests.length > 0) {
              const batchRes = await docClient.send(
                new BatchWriteCommand({
                  RequestItems: {
                    [schedulesTableName]: deleteRequests,
                  },
                })
              );
              
              if (batchRes.UnprocessedItems && batchRes.UnprocessedItems[schedulesTableName] && batchRes.UnprocessedItems[schedulesTableName].length > 0) {
                deleteRequests = batchRes.UnprocessedItems[schedulesTableName];
              } else {
                deleteRequests = [];
              }
            }
          }
        } while (lastEvaluatedKey);
      }

      // 3. Delete the room itself
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { location_id: locationId },
        })
      );

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'Room deleted successfully' }),
      };
    } catch (error) {
      console.error('Error deleting room location:', error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Failed to delete room location',
          message: error.message,
        }),
      };
    }
  };
}

export const handler = createHandler();
