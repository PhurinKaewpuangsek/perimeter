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

describe('UpdateScheduleFunction Lambda Handler', () => {
  test('returns 403 when event has no authorizer claims', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
      body: JSON.stringify({ end_time: '10:00' }),
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
      body: JSON.stringify({ end_time: '10:00' }),
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

  test('returns 400 with CORS headers when room_code path param is missing for authorized caller', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      pathParameters: { schedule_slot: 'MON#09:00#CS333' },
      body: JSON.stringify({ end_time: '10:00' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid',
            'cognito:groups': 'staff',
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

  test('returns 400 with CORS headers when schedule_slot path param is missing for authorized caller', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      pathParameters: { room_code: 'LC3-101/1' },
      body: JSON.stringify({ end_time: '10:00' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid',
            'cognito:groups': 'staff',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Missing schedule_slot/);
  });

  test('returns 400 when no updatable fields are provided in body for authorized caller', async () => {
    const handler = createHandler({ docClient: fakeDocClient({}), tableName: 'TestTable' });
    const response = await handler({
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
      body: JSON.stringify({}),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid',
            'cognito:groups': 'staff',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.match(body.error, /No fields provided/);
  });

  test('returns 200 with updated attributes and sets updatedBy & updatedAt on success', async () => {
    const fakeAttributes = {
      room_code: 'LC3-101/1',
      schedule_slot: 'MON#09:00#CS333',
      end_time: '10:00',
      event_name: 'Software Engineering',
      updatedBy: 'staff@torch.dev',
      updatedAt: new Date().toISOString(),
    };
    const capture = {};
    const handler = createHandler({
      docClient: fakeDocClient({ Attributes: fakeAttributes }, capture),
      tableName: 'TestTable',
    });
    const response = await handler({
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
      body: JSON.stringify({
        end_time: '10:00',
        event_name: 'Software Engineering',
        updatedBy: 'spoofed-user',
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid-456',
            'cognito:username': 'staff@torch.dev',
            'cognito:groups': 'staff',
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.equal(body.message, 'Schedule updated successfully');
    assert.deepEqual(body.data, fakeAttributes);

    // Verify UpdateCommand input values
    const values = capture.command?.input?.ExpressionAttributeValues;
    assert.ok(values, 'UpdateCommand should contain ExpressionAttributeValues');
    const valEntries = Object.values(values);
    assert.ok(valEntries.includes('staff@torch.dev'), 'updatedBy must be passed into update values from token');
  });

  test('returns 200 when caller is admin', async () => {
    const capture = {};
    const handler = createHandler({
      docClient: fakeDocClient({ Attributes: {} }, capture),
      tableName: 'TestTable',
    });
    const response = await handler({
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
      body: JSON.stringify({ end_time: '10:00' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid-111',
            'cognito:groups': ['admin'],
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const values = capture.command?.input?.ExpressionAttributeValues;
    const valEntries = Object.values(values);
    assert.ok(valEntries.includes('admin-uuid-111'));
  });

  test('returns 500 with CORS headers when docClient.send() rejects for authorized caller', async () => {
    const handler = createHandler({
      docClient: fakeDocClient(new Error('InternalServerError')),
      tableName: 'TestTable',
    });
    const response = await handler({
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
      body: JSON.stringify({ end_time: '10:00' }),
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
    assert.match(body.error, /Failed to update/);
  });
});
