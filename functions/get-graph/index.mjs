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
 * The public contract (docs/adr/0001, tools/data-extraction/lc3/README.md). Anything else
 * staff write onto an item, such as who set a closure (closed_by), stays out of this route.
 */
const NODE_FIELDS = ['graph_id', 'element_id', 'node_id', 'floor', 'x', 'y', 'node_type', 'location_id'];
const EDGE_FIELDS = ['graph_id', 'element_id', 'from', 'to', 'edge_type', 'distance'];
const CLOSURE_FIELDS = ['closed', 'closed_from', 'closed_until', 'closed_reason'];

const pick = (item, fields) =>
  Object.fromEntries(fields.filter((field) => item[field] !== undefined).map((field) => [field, item[field]]));

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

      // Closure fields are included because the map and the route API read closures from here.
      const nodes = items
        .filter((item) => item.element_id?.startsWith('NODE#'))
        .map((item) => pick(item, [...NODE_FIELDS, ...CLOSURE_FIELDS]));
      const edges = items
        .filter((item) => item.element_id?.startsWith('EDGE#'))
        .map((item) => pick(item, [...EDGE_FIELDS, ...CLOSURE_FIELDS]));

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
