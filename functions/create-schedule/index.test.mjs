import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';

// ── helpers ──────────────────────────────────────────────────────────────────

function fakeDocClient(result, capture = {}) {
  return {
    async send(command) {
      if (capture) capture.command = command;
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('CreateScheduleFunction Lambda Handler', () => {
  test('returns 403 when event has no authorizer claims', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      body: JSON.stringify({
        room_code: 'LC3-101/1',
        day_of_week: 'MON',
        start_time: '09:00',
        event_code: 'CS333',
      }),
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Access-Control-Allow-Headers'], 'Content-Type,Authorization');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Forbidden/);
  });

  test('returns 403 when caller is in user group', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      body: JSON.stringify({
        room_code: 'LC3-101/1',
        day_of_week: 'MON',
        start_time: '09:00',
        event_code: 'CS333',
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-uuid',
            'cognito:groups': 'user',
          },
        },
      },
    });

    assert.equal(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Forbidden/);
  });

  test('returns 400 when required body fields are missing for authorized caller', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    // Missing event_code
    const response = await handler({
      body: JSON.stringify({ room_code: 'LC3-101/1', day_of_week: 'MON', start_time: '09:00' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid',
            'cognito:username': 'staff@torch.dev',
            'cognito:groups': 'staff',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Content-Type'], 'application/json');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Missing required field/);
  });

  test('returns 400 when body is invalid JSON for authorized caller', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      body: '{not-valid-json',
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid',
            'cognito:groups': ['staff'],
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Invalid JSON/);
  });

  test('returns 200 and records updatedBy from claims and updatedAt when caller is staff', async () => {
    const capture = {};
    const handler = createHandler({ docClient: fakeDocClient({}, capture), tableName: 'TestTable' });
    const response = await handler({
      body: JSON.stringify({
        room_code: 'LC3-101/1',
        day_of_week: 'MON',
        start_time: '09:00',
        event_code: 'CS333',
        updatedBy: 'spoofed-user', // Should be ignored
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid-123',
            'cognito:username': 'staff@torch.dev',
            'cognito:groups': 'staff',
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.equal(body.message, 'Schedule created successfully');
    assert.equal(body.schedule_slot, 'MON#09:00#CS333');

    // Assert stored item attributes
    const storedItem = capture.command?.input?.Item;
    assert.ok(storedItem, 'PutCommand should contain an Item');
    assert.equal(storedItem.updatedBy, 'staff@torch.dev');
    assert.ok(storedItem.updatedAt, 'updatedAt must be populated');
    assert.ok(!isNaN(Date.parse(storedItem.updatedAt)), 'updatedAt must be valid ISO string');
  });

  test('returns 200 when caller is admin', async () => {
    const capture = {};
    const handler = createHandler({ docClient: fakeDocClient({}, capture), tableName: 'TestTable' });
    const response = await handler({
      body: JSON.stringify({
        room_code: 'LC3-101/1',
        day_of_week: 'MON',
        start_time: '09:00',
        event_code: 'CS333',
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid-999',
            'cognito:groups': ['admin'],
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const storedItem = capture.command?.input?.Item;
    assert.equal(storedItem.updatedBy, 'admin-uuid-999');
  });

  test('returns 500 when docClient.send() rejects for authorized caller', async () => {
    const handler = createHandler({
      docClient: fakeDocClient(new Error('ProvisionedThroughputExceededException')),
      tableName: 'TestTable',
    });
    const response = await handler({
      body: JSON.stringify({
        room_code: 'LC3-101/1',
        day_of_week: 'TUE',
        start_time: '11:00',
        event_code: 'CS361',
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid',
            'cognito:groups': 'staff',
          },
        },
      },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Failed to create/);
  });
});
