import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';

function fakeDocClient(pages = [[]], capture = {}) {
  let callIndex = 0;
  return {
    calls: 0,
    async send(command) {
      this.calls++;
      if (capture) {
        capture.lastCommand = command;
        if (!capture.commands) capture.commands = [];
        capture.commands.push(command);
      }

      if (pages instanceof Error) {
        throw pages;
      }

      const currentPage = pages[callIndex] || { Items: [] };
      callIndex++;
      return currentPage;
    },
  };
}

describe('GetRouteFunction Lambda Handler', () => {
  const sampleGraphItems = [
    {
      graph_id: 'LC3',
      element_id: 'NODE#N1',
      node_id: 'N1',
      floor: 1,
      x: 10,
      y: 10,
      node_type: 'entrance',
      location_id: 'LOC-ENTRANCE',
    },
    {
      graph_id: 'LC3',
      element_id: 'NODE#N2',
      node_id: 'N2',
      floor: 1,
      x: 20,
      y: 10,
      node_type: 'junction',
    },
    {
      graph_id: 'LC3',
      element_id: 'NODE#N3',
      node_id: 'N3',
      floor: 1,
      x: 30,
      y: 10,
      node_type: 'room',
      location_id: 'LOC-ROOM',
    },
    {
      graph_id: 'LC3',
      element_id: 'EDGE#N1|N2',
      from: 'N1',
      to: 'N2',
      distance: 10,
      edge_type: 'walk',
    },
    {
      graph_id: 'LC3',
      element_id: 'EDGE#N2|N3',
      from: 'N2',
      to: 'N3',
      distance: 10,
      edge_type: 'walk',
    },
  ];

  test('returns 400 with CORS headers when from is missing', async () => {
    const handler = createHandler({
      docClient: fakeDocClient([{ Items: sampleGraphItems }]),
      tableName: 'TestGraph',
    });

    const response = await handler({
      queryStringParameters: { to: 'LOC-ROOM' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Content-Type'], 'application/json');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Missing.*parameters/i);
  });

  test('returns 400 with CORS headers when to is missing', async () => {
    const handler = createHandler({
      docClient: fakeDocClient([{ Items: sampleGraphItems }]),
      tableName: 'TestGraph',
    });

    const response = await handler({
      queryStringParameters: { from: 'LOC-ENTRANCE' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Missing.*parameters/i);
  });

  test('returns 400 with CORS headers when at timestamp is invalid', async () => {
    const handler = createHandler({
      docClient: fakeDocClient([{ Items: sampleGraphItems }]),
      tableName: 'TestGraph',
    });

    const response = await handler({
      queryStringParameters: { from: 'LOC-ENTRANCE', to: 'LOC-ROOM', at: 'invalid-date' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Invalid.*timestamp/i);
  });

  test('returns 200 with route and CORS headers on success', async () => {
    const docClient = fakeDocClient([{ Items: sampleGraphItems }]);
    const handler = createHandler({
      docClient,
      tableName: 'TestGraph',
      now: () => new Date('2026-10-25T10:00:00+07:00'),
    });

    const response = await handler({
      queryStringParameters: { from: 'LOC-ENTRANCE', to: 'LOC-ROOM' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Content-Type'], 'application/json');
    const body = JSON.parse(response.body);
    assert.equal(body.found, true);
    assert.equal(body.distance, 20);
    assert.deepEqual(body.floors, [1]);
    assert.equal(body.path.length, 3);
    assert.equal(body.path[0].node_id, 'N1');
    assert.equal(body.path[2].node_id, 'N3');
    assert.deepEqual(body.closures_avoided, []);
  });

  test('returns 200 with found=false and reason when route cannot be found', async () => {
    const docClient = fakeDocClient([{ Items: sampleGraphItems }]);
    const handler = createHandler({
      docClient,
      tableName: 'TestGraph',
    });

    const response = await handler({
      queryStringParameters: { from: 'LOC-ENTRANCE', to: 'UNKNOWN-DEST' },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.found, false);
    assert.equal(body.reason, 'UNKNOWN_LOCATION');
  });

  test('loads graph using single QueryCommand with pagination (LastEvaluatedKey)', async () => {
    const capture = {};
    const docClient = fakeDocClient(
      [
        {
          Items: sampleGraphItems.slice(0, 3),
          LastEvaluatedKey: { graph_id: 'LC3', element_id: 'NODE#N3' },
        },
        {
          Items: sampleGraphItems.slice(3),
        },
      ],
      capture
    );

    const handler = createHandler({
      docClient,
      tableName: 'TestGraph',
    });

    const response = await handler({
      queryStringParameters: { from: 'N1', to: 'N3' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(capture.commands.length, 2);
    assert.equal(capture.commands[0].input.TableName, 'TestGraph');
    assert.equal(capture.commands[0].input.KeyConditionExpression, 'graph_id = :graphId');
    assert.equal(capture.commands[0].input.ExpressionAttributeValues[':graphId'], 'LC3');
    assert.equal(
      capture.commands[1].input.ExclusiveStartKey.element_id,
      'NODE#N3'
    );
  });

  test('caches graph in memory for duration of cacheTtlMs (≤ 30s)', async () => {
    let currentTime = 1000000;
    const docClient = fakeDocClient([{ Items: sampleGraphItems }]);

    const handler = createHandler({
      docClient,
      tableName: 'TestGraph',
      cacheTtlMs: 30000,
      now: () => new Date(currentTime),
    });

    // 1st invocation: queries DynamoDB
    const res1 = await handler({
      queryStringParameters: { from: 'N1', to: 'N3' },
    });
    assert.equal(res1.statusCode, 200);
    assert.equal(docClient.calls, 1);

    // 2nd invocation within 25 seconds: uses cache, no extra DynamoDB call
    currentTime += 25000;
    const res2 = await handler({
      queryStringParameters: { from: 'N1', to: 'N3' },
    });
    assert.equal(res2.statusCode, 200);
    assert.equal(docClient.calls, 1);

    // 3rd invocation after 35 seconds (past TTL): queries DynamoDB again
    currentTime += 10000;
    const res3 = await handler({
      queryStringParameters: { from: 'N1', to: 'N3' },
    });
    assert.equal(res3.statusCode, 200);
    assert.equal(docClient.calls, 2);
  });

  test('returns 500 with CORS headers on DynamoDB error', async () => {
    const handler = createHandler({
      docClient: fakeDocClient(new Error('DynamoDB connection timeout')),
      tableName: 'TestGraph',
    });

    const response = await handler({
      queryStringParameters: { from: 'N1', to: 'N3' },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.equal(body.error, 'Failed to calculate route');
    assert.equal(body.message, 'An internal error occurred. Please try again later.');
  });
});
