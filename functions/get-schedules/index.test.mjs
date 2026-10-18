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
    assert.deepEqual(JSON.parse(response.body), { count: 0, records: [] });
  });

  test('returns 500 with CORS headers when the scan fails', async () => {
    const docClient = fakeDocClient([new Error('ResourceNotFoundException')]);
    const response = await createHandler({ docClient, tableName: 'TestTable' })();

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Failed to fetch schedules/);
  });
});
