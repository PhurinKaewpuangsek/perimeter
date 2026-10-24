import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { findRoute } from './route.mjs';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultyGraph';
const DEFAULT_GRAPH_ID = 'LC3';
const DEFAULT_CACHE_TTL_MS = 30 * 1000; // 30 seconds, allowing staff closures to reflect quickly

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

/**
 * Loads all graph elements (nodes and edges) for a building using a single Query loop.
 *
 * @param {object} docClient
 * @param {string} tableName
 * @param {string} graphId
 * @returns {Promise<{ nodes: Array<object>, edges: Array<object> }>}
 */
async function loadGraph(docClient, tableName, graphId = DEFAULT_GRAPH_ID) {
  const items = [];
  let exclusiveStartKey;

  do {
    const page = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'graph_id = :graphId',
        ExpressionAttributeValues: {
          ':graphId': graphId,
        },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );

    if (Array.isArray(page.Items)) {
      items.push(...page.Items);
    }
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);

  const nodes = [];
  const edges = [];

  for (const item of items) {
    if (item.element_id?.startsWith('NODE#') || item.node_id) {
      nodes.push(item);
    } else if (item.element_id?.startsWith('EDGE#') || (item.from && item.to)) {
      edges.push(item);
    }
  }

  return { nodes, edges };
}

/**
 * Builds the Lambda handler with dependency injection for unit testing and local benchmarking.
 *
 * @param {object} options
 * @param {object} [options.docClient] - DynamoDB Document Client
 * @param {string} [options.tableName] - DynamoDB Table Name
 * @param {number} [options.cacheTtlMs] - In-memory cache TTL in milliseconds
 * @param {() => Date} [options.now] - Function returning current Date
 * @returns {(event?: object) => Promise<object>}
 */
export function createHandler({
  docClient = defaultDocClient,
  tableName = TABLE_NAME,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  now = () => new Date(),
} = {}) {
  let cachedGraph = null;
  let cachedAt = 0;

  return async function getRoute(event = {}) {
    try {
      const from = event.queryStringParameters?.from?.trim();
      const to = event.queryStringParameters?.to?.trim();
      const atParam = event.queryStringParameters?.at?.trim();

      if (!from || !to) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: 'Missing required query parameters',
            message: 'Both "from" and "to" query parameters are required',
          }),
        };
      }

      let atDate;
      if (atParam) {
        atDate = new Date(atParam);
        if (isNaN(atDate.getTime())) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: 'Invalid timestamp',
              message: 'Parameter "at" must be a valid ISO-8601 string',
            }),
          };
        }
      } else {
        atDate = now();
      }

      // In-memory caching: reuse graph topology and closures for cacheTtlMs
      const currentTime = now().getTime();
      if (!cachedGraph || currentTime - cachedAt >= cacheTtlMs) {
        cachedGraph = await loadGraph(docClient, tableName);
        cachedAt = currentTime;
      }

      const result = findRoute({
        nodes: cachedGraph.nodes,
        edges: cachedGraph.edges,
        from,
        to,
        at: atDate,
      });

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(result),
      };
    } catch (error) {
      console.error('Error calculating route:', error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Failed to calculate route',
          message: error.message,
        }),
      };
    }
  };
}

/**
 * Lambda handler for calculating the shortest route avoiding active closures.
 * Path: GET /api/route?from=<id>&to=<id>&at=<ISO>
 */
export const handler = createHandler();
