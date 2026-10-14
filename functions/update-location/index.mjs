import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultyLocations';

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

/**
 * Builds the Lambda handler around an injectable document client, for unit testing.
 * @param {{ docClient?: DynamoDBDocumentClient, tableName?: string }} deps
 */
export function createHandler({ docClient = defaultDocClient, tableName = TABLE_NAME } = {}) {
  /**
   * Lambda handler for updating room details in DynamoDB.
   * Path: PUT /api/locations/{location_id}
   */
  return async function updateLocation(event) {
    const groups = getCallerGroups(event);
    if (!groups.includes('staff') && !groups.includes('admin')) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Forbidden: Insufficient privileges' }),
      };
    }

    try {
      const locationId = event.pathParameters?.location_id;
      if (!locationId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Missing location_id in path parameters' }),
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

      // Handle room name mappings (support name, name_th, and nameThai)
      const roomName = body.name ?? body.name_th ?? body.nameThai;
      if (roomName !== undefined) {
        updateData.name_th = roomName;
        updateData.name = roomName;
        updateData.nameThai = roomName;
      }

      // Handle capacity
      if (body.capacity !== undefined) {
        const parsedCapacity = Number(body.capacity);
        updateData.capacity = isNaN(parsedCapacity) ? body.capacity : parsedCapacity;
      }

      // Copy any additional custom fields provided in body (excluding reserved and audit keys)
      for (const [key, value] of Object.entries(body)) {
        if (
          key !== 'location_id' &&
          key !== 'name' &&
          key !== 'name_th' &&
          key !== 'nameThai' &&
          key !== 'capacity' &&
          key !== 'updatedBy' &&
          key !== 'updatedAt'
        ) {
          updateData[key] = value;
        }
      }

      const userProvidedKeys = Object.keys(updateData);
      if (userProvidedKeys.length === 0) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'No fields provided for update' }),
        };
      }

      const updatedBy = getCallerIdentity(event);
      const updatedAt = new Date().toISOString();
      updateData.updatedBy = updatedBy;
      updateData.updatedAt = updatedAt;

      const updateKeys = Object.keys(updateData);

    // Construct dynamic UpdateExpression with ExpressionAttributeNames to avoid reserved keyword conflicts
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    updateKeys.forEach((key, index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      updateExpressions.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = updateData[key];
    });

    const command = new UpdateCommand({
      TableName: tableName,
      Key: {
        location_id: locationId,
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    const result = await docClient.send(command);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Room details updated successfully',
        data: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error updating room location:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Failed to update room location',
        message: error.message,
      }),
    };
  }
  };
}

export const handler = createHandler();
