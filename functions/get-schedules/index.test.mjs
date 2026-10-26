import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';

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

describe('GetSchedulesFunction Lambda Handler', () => {
  test('returns 200 with every scanned item when room_code is omitted', async () => {
    const items = [
      { room_code: 'LC3-101/1', schedule_slot: 'MON#11:00#MA624', event_date: '2026-05-18' },
      { room_code: 'LC3-101/1', schedule_slot: 'TUE#11:00#ST447' },
    ];
    const docClient = fakeDocClient([{ Items: items }]);

    const response = await createHandler({ docClient, tableName: 'TestTable' })();

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=30');
    const body = JSON.parse(response.body);
    assert.equal(body.count, 2);
    assert.deepEqual(body.records, items);
    assert.equal(body.records[0].event_date, '2026-05-18');
  });

  test('follows LastEvaluatedKey until the whole table is read', async () => {
    const docClient = fakeDocClient([
      { Items: [{ room_code: 'A', schedule_slot: 'S1' }], LastEvaluatedKey: { room_code: 'A' } },
      { Items: [{ room_code: 'B', schedule_slot: 'S2' }] },
    ]);

    const response = await createHandler({ docClient, tableName: 'TestTable' })();

    const body = JSON.parse(response.body);
    assert.equal(body.count, 2);
    assert.equal(docClient.calls.length, 2);
  });

  test('queries only the requested room using the room_code partition key', async () => {
    const items = [
      { room_code: 'LC3-101/1', schedule_slot: 'MON#11:00#MA624' },
      { room_code: 'LC3-101/1', schedule_slot: 'TUE#11:00#ST447' },
    ];
    const docClient = fakeDocClient([{ Items: items }]);

    const response = await createHandler({ docClient, tableName: 'TestTable' })({
      queryStringParameters: { room_code: 'LC3-101/1' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=30');
    assert.deepEqual(docClient.calls, [
      {
        TableName: 'TestTable',
        KeyConditionExpression: 'room_code = :roomCode',
        ExpressionAttributeValues: { ':roomCode': 'LC3-101/1' },
      },
    ]);
    assert.deepEqual(JSON.parse(response.body).records, items);
  });

  test('follows LastEvaluatedKey when querying a room', async () => {
    const docClient = fakeDocClient([
      { Items: [{ room_code: 'A', schedule_slot: 'S1' }], LastEvaluatedKey: { room_code: 'A' } },
      { Items: [{ room_code: 'A', schedule_slot: 'S2' }] },
    ]);

    const response = await createHandler({ docClient, tableName: 'TestTable' })({
      queryStringParameters: { room_code: 'A' },
    });

    assert.equal(JSON.parse(response.body).count, 2);
    assert.equal(docClient.calls.length, 2);
    assert.deepEqual(docClient.calls[1].ExclusiveStartKey, { room_code: 'A' });
  });

  test('returns an empty records array when the table has no items', async () => {
    const docClient = fakeDocClient([{ Items: [] }]);
    const response = await createHandler({ docClient, tableName: 'TestTable' })();

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=30');
    assert.deepEqual(JSON.parse(response.body), { count: 0, records: [] });
  });

  test('caches schedules in memory within cacheTtlMs for both bulk and room queries', async () => {
    const allItems = [{ room_code: 'LC3-101', schedule_slot: 'S1' }];
    const roomItems = [{ room_code: 'LC3-101', schedule_slot: 'S1' }];
    const docClient = fakeDocClient([
      { Items: allItems },
      { Items: roomItems },
      { Items: allItems },
    ]);
    let currentTime = 1000;
    const handler = createHandler({
      docClient,
      tableName: 'TestTable',
      cacheTtlMs: 60 * 1000,
      now: () => new Date(currentTime),
    });

    // Bulk scan call 1
    const res1 = await handler();
    assert.equal(res1.statusCode, 200);
    assert.equal(docClient.calls.length, 1);

    // Bulk scan call 2 (within TTL)
    currentTime += 30 * 1000;
    const res2 = await handler();
    assert.equal(res2.statusCode, 200);
    assert.equal(docClient.calls.length, 1); // Not called again

    // Room query call 1
    const resRoom1 = await handler({ queryStringParameters: { room_code: 'LC3-101' } });
    assert.equal(resRoom1.statusCode, 200);
    assert.equal(docClient.calls.length, 2);

    // Room query call 2 (within TTL)
    const resRoom2 = await handler({ queryStringParameters: { room_code: 'LC3-101' } });
    assert.equal(resRoom2.statusCode, 200);
    assert.equal(docClient.calls.length, 2);

    // Bulk scan past TTL
    currentTime += 40 * 1000;
    const res3 = await handler();
    assert.equal(res3.statusCode, 200);
    assert.equal(docClient.calls.length, 3);
  });

  test('bypasses in-memory cache and returns Cache-Control: no-store when fresh=1 is provided (BUG-02)', async () => {
    const initialAll = [{ room_code: 'LC3-101', schedule_slot: 'S1' }];
    const updatedAll = [
      { room_code: 'LC3-101', schedule_slot: 'S1' },
      { room_code: 'LC3-101', schedule_slot: 'S2' },
    ];
    const initialRoom = [{ room_code: 'LC3-101', schedule_slot: 'S1' }];
    const updatedRoom = [
      { room_code: 'LC3-101', schedule_slot: 'S1' },
      { room_code: 'LC3-101', schedule_slot: 'S2' },
    ];
    const docClient = fakeDocClient([
      { Items: initialAll },
      { Items: initialRoom },
      { Items: updatedRoom },
      { Items: updatedAll },
    ]);
    let currentTime = 1000;
    const handler = createHandler({
      docClient,
      tableName: 'TestTable',
      cacheTtlMs: 60 * 1000,
      now: () => new Date(currentTime),
    });

    // Warm both caches
    await handler();
    await handler({ queryStringParameters: { room_code: 'LC3-101' } });
    assert.equal(docClient.calls.length, 2);

    // Within TTL (5s later), request room with fresh=1
    currentTime += 5 * 1000;
    const freshRoomRes = await handler({
      queryStringParameters: { room_code: 'LC3-101', fresh: '1' },
    });
    assert.equal(freshRoomRes.statusCode, 200);
    assert.equal(freshRoomRes.headers['Cache-Control'], 'no-store');
    assert.deepEqual(JSON.parse(freshRoomRes.body).records, updatedRoom);
    assert.equal(docClient.calls.length, 3);

    // Subsequent normal room query within TTL should read the updated room cache
    const cachedRoomRes = await handler({
      queryStringParameters: { room_code: 'LC3-101' },
    });
    assert.equal(cachedRoomRes.headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=30');
    assert.deepEqual(JSON.parse(cachedRoomRes.body).records, updatedRoom);
    assert.equal(docClient.calls.length, 3);

    // Within TTL, request bulk with fresh=1
    const freshAllRes = await handler({
      queryStringParameters: { fresh: '1' },
    });
    assert.equal(freshAllRes.statusCode, 200);
    assert.equal(freshAllRes.headers['Cache-Control'], 'no-store');
    assert.deepEqual(JSON.parse(freshAllRes.body).records, updatedAll);
    assert.equal(docClient.calls.length, 4);
  });

  test('prevents an older in-flight read from overwriting caches cleared by fresh=1', async () => {
    let resolveSlowRoom;
    const staleRoom = [{ room_code: 'LC3-101', schedule_slot: 'MON#09:00#STALE' }];
    const freshAll = [{ room_code: 'LC3-101', schedule_slot: 'MON#09:00#FRESH' }];
    const freshRoom = [{ room_code: 'LC3-101', schedule_slot: 'MON#09:00#FRESH' }];

    let callIdx = 0;
    const docClient = {
      async send() {
        callIdx += 1;
        if (callIdx === 1) {
          return new Promise((resolve) => {
            resolveSlowRoom = () => resolve({ Items: staleRoom });
          });
        }
        if (callIdx === 2) {
          return { Items: freshAll };
        }
        return { Items: freshRoom };
      },
    };

    const handler = createHandler({ docClient, tableName: 'TestTable', cacheTtlMs: 60 * 1000 });

    // Start an ordinary room query that stays in-flight
    const slowRoomPromise = handler({ queryStringParameters: { room_code: 'LC3-101' } });

    // Run a fresh bulk scan while the room query is still in-flight
    const freshBulkRes = await handler({ queryStringParameters: { fresh: '1' } });
    assert.deepEqual(JSON.parse(freshBulkRes.body).records, freshAll);

    // Now the older room query finishes after roomCache.clear()
    resolveSlowRoom();
    await slowRoomPromise;

    // A subsequent room query must NOT read the stale room result from roomCache
    const nextRoomRes = await handler({ queryStringParameters: { room_code: 'LC3-101' } });
    assert.deepEqual(JSON.parse(nextRoomRes.body).records, freshRoom);
    assert.equal(callIdx, 3);
  });

  test('returns 500 with CORS headers and no-store when the scan fails', async () => {
    const docClient = fakeDocClient([new Error('ResourceNotFoundException')]);
    const response = await createHandler({ docClient, tableName: 'TestTable' })();

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Cache-Control'], 'no-store');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Failed to fetch schedules/);
  });
});
