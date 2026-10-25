import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';

/** Minimal stand-in for DynamoDBDocumentClient: replays the given Query pages in order. */
function fakeDocClient(pages) {
  const calls = [];
  return {
    calls,
    async send(command) {
      calls.push(command.input);
      const page = pages[calls.length - 1];
      if (page instanceof Error) throw page;
      return page;
    },
  };
}

const node = (id, extra = {}) => ({
  graph_id: 'LC3',
  element_id: `NODE#${id}`,
  node_id: id,
  floor: 1,
  x: 10,
  y: 20,
  node_type: 'junction',
  ...extra,
});

const edge = (from, to, extra = {}) => ({
  graph_id: 'LC3',
  element_id: `EDGE#${from}|${to}`,
  from,
  to,
  edge_type: 'walk',
  distance: 33,
  ...extra,
});

describe('GetGraphFunction Lambda Handler', () => {
  test('returns 200 with nodes and edges split by element_id, closures included, and cache headers', async () => {
    const room = node('LC3_103', { node_type: 'room', location_id: 'LC3-F1-R103' });
    const corridor = node('LC3_entry_103', { node_type: 'entrance' });
    const closed = edge('LC3_103', 'LC3_entry_103', {
      closed: true,
      closed_from: '2026-10-30T08:00:00+07:00',
      closed_until: '2026-10-30T17:00:00+07:00',
    });
    const docClient = fakeDocClient([{ Items: [closed, room, corridor] }]);

    const response = await createHandler({ docClient, tableName: 'TestGraph' })();

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Content-Type'], 'application/json');
    assert.equal(response.headers['Cache-Control'], 'public, max-age=15');
    assert.deepEqual(JSON.parse(response.body), { graph_id: 'LC3', nodes: [room, corridor], edges: [closed] });
  });

  test('returns only documented fields, so staff-only attributes never reach the public', async () => {
    const closure = {
      closed: true,
      closed_from: '2026-10-30T08:00:00+07:00',
      closed_until: '2026-10-30T17:00:00+07:00',
      closed_reason: 'ปิดซ่อมทางเดิน',
    };
    const staffOnly = { closed_by: '3f1c9e2a-staff-sub', updatedBy: 'admin-sub', internal_note: 'x' };
    const room = node('LC3_103', { location_id: 'LC3-F1-R103', ...closure, ...staffOnly });
    const doorway = edge('LC3_103', 'LC3_entry_103', { ...closure, ...staffOnly });
    const docClient = fakeDocClient([{ Items: [room, doorway] }]);

    const response = await createHandler({ docClient, tableName: 'TestGraph' })();

    const body = JSON.parse(response.body);
    assert.deepEqual(body.nodes, [node('LC3_103', { location_id: 'LC3-F1-R103', ...closure })]);
    assert.deepEqual(body.edges, [edge('LC3_103', 'LC3_entry_103', closure)]);
    assert.doesNotMatch(response.body, /closed_by|updatedBy|internal_note|staff-sub/);
  });

  test('reads one partition with a Query, never a Scan', async () => {
    const docClient = fakeDocClient([{ Items: [] }]);

    await createHandler({ docClient, tableName: 'TestGraph' })();

    assert.equal(docClient.calls.length, 1);
    assert.equal(docClient.calls[0].TableName, 'TestGraph');
    assert.equal(docClient.calls[0].KeyConditionExpression, 'graph_id = :graphId');
    assert.deepEqual(docClient.calls[0].ExpressionAttributeValues, { ':graphId': 'LC3' });
  });

  test('follows LastEvaluatedKey until the whole graph is read', async () => {
    const lastKey = { graph_id: 'LC3', element_id: 'NODE#A' };
    const docClient = fakeDocClient([
      { Items: [node('A')], LastEvaluatedKey: lastKey },
      { Items: [node('B'), edge('A', 'B')] },
    ]);

    const response = await createHandler({ docClient, tableName: 'TestGraph' })();

    const body = JSON.parse(response.body);
    assert.deepEqual(body.nodes.map((n) => n.node_id), ['A', 'B']);
    assert.deepEqual(body.edges.map((e) => e.element_id), ['EDGE#A|B']);
    assert.equal(docClient.calls.length, 2);
    assert.equal(docClient.calls[0].ExclusiveStartKey, undefined);
    assert.deepEqual(docClient.calls[1].ExclusiveStartKey, lastKey);
  });

  test('returns empty arrays when the table holds no graph', async () => {
    const docClient = fakeDocClient([{ Items: [] }]);

    const response = await createHandler({ docClient, tableName: 'TestGraph' })();

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Cache-Control'], 'public, max-age=15');
    assert.deepEqual(JSON.parse(response.body), { graph_id: 'LC3', nodes: [], edges: [] });
  });

  test('caches graph in memory within cacheTtlMs (<= 30s) avoiding redundant queries', async () => {
    const items = [node('LC3_101')];
    const docClient = fakeDocClient([{ Items: items }, { Items: items }]);
    let currentTime = 1000;
    const handler = createHandler({
      docClient,
      tableName: 'TestGraph',
      cacheTtlMs: 30 * 1000,
      now: () => new Date(currentTime),
    });

    const res1 = await handler();
    assert.equal(res1.statusCode, 200);
    assert.equal(docClient.calls.length, 1);

    // Call within 30s TTL
    currentTime += 15 * 1000;
    const res2 = await handler();
    assert.equal(res2.statusCode, 200);
    assert.equal(docClient.calls.length, 1);

    // Advance past TTL (31s later)
    currentTime += 16 * 1000;
    const res3 = await handler();
    assert.equal(res3.statusCode, 200);
    assert.equal(docClient.calls.length, 2);
  });

  test('returns 500 with CORS headers, no-store and no AWS details when the query fails', async () => {
    const denied = new Error(
      'User: arn:aws:sts::123456789012:assumed-role/GetGraphRole/fn is not authorized to perform: dynamodb:Query'
    );
    const docClient = fakeDocClient([denied]);

    const response = await createHandler({ docClient, tableName: 'TestGraph' })();

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.deepEqual(JSON.parse(response.body), { error: 'Failed to fetch graph' });
    assert.doesNotMatch(response.body, /arn:aws|123456789012/);
  });
});
