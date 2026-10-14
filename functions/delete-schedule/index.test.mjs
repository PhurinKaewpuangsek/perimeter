import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';

// ── helpers ──────────────────────────────────────────────────────────────────

function fakeDocClient(result) {
  return {
    async send() {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('DeleteScheduleFunction Lambda Handler', () => {
  test('returns 400 with CORS headers when room_code path param is missing', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      pathParameters: { schedule_slot: 'MON#09:00#CS333' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-789',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Content-Type'], 'application/json');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Missing room_code/);
  });

  test('returns 400 with CORS headers when schedule_slot path param is missing', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      pathParameters: { room_code: 'LC3-101/1' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-789',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Missing schedule_slot/);
  });

  test('returns 403 when event has no authorizer claims', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
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
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            'cognito:groups': 'user',
          },
        },
      },
    });

    assert.equal(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Forbidden/);
  });

  test('returns 403 when caller is in staff group (staff cannot delete schedules)', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-456',
            'cognito:groups': 'staff',
          },
        },
      },
    });

    assert.equal(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Forbidden/);
  });

  test('returns 200 with success message when caller is in admin group', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-789',
            'cognito:groups': ['admin'],
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.equal(body.message, 'Schedule deleted successfully');
  });

  test('returns 500 with CORS headers when docClient.send() rejects', async () => {
    const handler = createHandler({
      docClient: fakeDocClient(new Error('ResourceNotFoundException')),
      tableName: 'TestTable',
    });
    const response = await handler({
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-789',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Failed to delete/);
  });
});
