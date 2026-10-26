import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';

/** Minimal stand-in for DynamoDBDocumentClient: replays the given Scan pages in order. */
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

describe('GetLocationsFunction Lambda Handler', () => {
  test('returns 200 with every scanned item wrapped in a records array', async () => {
    const items = [
      { location_id: 'LC3-F1-R101-1', name_th: 'ห้องบรรยาย 4', floor: 1 },
      { location_id: 'LC3-F1-PLFTOILET', name_th: 'ห้องน้ำหญิง (ฝั่งซ้าย)', floor: 1 },
    ];
    const docClient = fakeDocClient([{ Items: items }]);

    const response = await createHandler({ docClient, tableName: 'TestTable' })();

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Content-Type'], 'application/json');
    assert.equal(response.headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=30');

    const body = JSON.parse(response.body);
    assert.equal(body.count, 2);
    assert.deepEqual(body.records, items);
    assert.equal(docClient.calls[0].TableName, 'TestTable');
  });

  test('follows LastEvaluatedKey until the whole table is read', async () => {
    const docClient = fakeDocClient([
      { Items: [{ location_id: 'A' }], LastEvaluatedKey: { location_id: 'A' } },
      { Items: [{ location_id: 'B' }] },
    ]);

    const response = await createHandler({ docClient, tableName: 'TestTable' })();

    const body = JSON.parse(response.body);
    assert.equal(body.count, 2);
    assert.deepEqual(
      body.records.map((r) => r.location_id),
      ['A', 'B']
    );
    assert.equal(docClient.calls.length, 2);
    assert.equal(docClient.calls[0].ExclusiveStartKey, undefined);
    assert.deepEqual(docClient.calls[1].ExclusiveStartKey, { location_id: 'A' });
  });

  test('returns an empty records array when the table has no items', async () => {
    const docClient = fakeDocClient([{ Items: [] }]);

    const response = await createHandler({ docClient, tableName: 'TestTable' })();

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=30');
    assert.deepEqual(JSON.parse(response.body), { count: 0, records: [] });
  });

  test('caches scanned items in memory within cacheTtlMs, avoiding repeated scans', async () => {
    const items = [{ location_id: 'LC3-101' }];
    const docClient = fakeDocClient([{ Items: items }, { Items: items }]);
    let currentTime = 1000;
    const handler = createHandler({
      docClient,
      tableName: 'TestTable',
      cacheTtlMs: 60 * 1000,
      now: () => new Date(currentTime),
    });

    const res1 = await handler();
    assert.equal(res1.statusCode, 200);
    assert.equal(docClient.calls.length, 1);

    // Call again within TTL (30s later)
    currentTime += 30 * 1000;
    const res2 = await handler();
    assert.equal(res2.statusCode, 200);
    assert.equal(docClient.calls.length, 1); // No new scan

    // Advance past TTL (61s later)
    currentTime += 31 * 1000;
    const res3 = await handler();
    assert.equal(res3.statusCode, 200);
    assert.equal(docClient.calls.length, 2); // Rescanned
  });

  test('bypasses in-memory cache and returns Cache-Control: no-store when fresh=1 is provided (BUG-02)', async () => {
    const initialItems = [{ location_id: 'LC3-101', name_th: 'Old Name' }];
    const updatedItems = [{ location_id: 'LC3-101', name_th: 'New Name' }];
    const docClient = fakeDocClient([{ Items: initialItems }, { Items: updatedItems }]);
    let currentTime = 1000;
    const handler = createHandler({
      docClient,
      tableName: 'TestTable',
      cacheTtlMs: 60 * 1000,
      now: () => new Date(currentTime),
    });

    // Warm cache
    const res1 = await handler();
    assert.equal(res1.statusCode, 200);
    assert.equal(docClient.calls.length, 1);

    // Within TTL (5s later), request with fresh=1
    currentTime += 5 * 1000;
    const resFresh = await handler({ queryStringParameters: { fresh: '1' } });
    assert.equal(resFresh.statusCode, 200);
    assert.equal(resFresh.headers['Cache-Control'], 'no-store');
    assert.deepEqual(JSON.parse(resFresh.body).records, updatedItems);
    assert.equal(docClient.calls.length, 2);

    // Subsequent normal request within TTL returns updated cache
    const resCached = await handler();
    assert.equal(resCached.headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=30');
    assert.deepEqual(JSON.parse(resCached.body).records, updatedItems);
    assert.equal(docClient.calls.length, 2);
  });

  test('returns 500 with CORS headers and no-store when the scan fails', async () => {
    const docClient = fakeDocClient([new Error('ResourceNotFoundException')]);

    const response = await createHandler({ docClient, tableName: 'TestTable' })();

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Cache-Control'], 'no-store');

    const body = JSON.parse(response.body);
    assert.match(body.error, /Failed to fetch locations/);
    assert.equal(body.message, 'ResourceNotFoundException');
  });
});
