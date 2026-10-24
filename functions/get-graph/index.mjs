import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultyGraph';
const GRAPH_ID = 'LC3';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Reads every node and edge of one building's graph. The whole LC3 graph is ~590 items in one
 * partition, well inside a single 1 MB Query page, but the LastEvaluatedKey loop keeps the
 * handler correct as the graph grows.
 */
async function queryWholeGraph(docClient, tableName, graphId) {
  const items = [];
  let exclusiveStartKey;

  do {
    const page = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'graph_id = :graphId',
        ExpressionAttributeValues: { ':graphId': graphId },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );

    if (Array.isArray(page.Items)) {
      items.push(...page.Items);
    }
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

/**
 * Builds the Lambda handler around an injectable document client so the response
 * contract can be unit tested without reaching AWS.
 */
export function createHandler({ docClient = defaultDocClient, tableName = TABLE_NAME, graphId = GRAPH_ID } = {}) {
  return async function getGraph() {
    try {
      const items = await queryWholeGraph(docClient, tableName, graphId);

      // Items are returned as stored, closure fields included: the map shows closures from here.
      const nodes = items.filter((item) => item.element_id?.startsWith('NODE#'));
      const edges = items.filter((item) => item.element_id?.startsWith('EDGE#'));

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ graph_id: graphId, nodes, edges }),
      };
    } catch (error) {
      // Details stay in the logs: on this public route an SDK message such as AccessDenied
      // would hand the account ID and role ARN to anyone.
      console.error('Error querying graph:', error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Failed to fetch graph' }),
      };
    }
  };
}

/**
 * Lambda handler for reading the whole LC3 routing graph from DynamoDB.
 * Path: GET /api/graph
 */
export const handler = createHandler();
