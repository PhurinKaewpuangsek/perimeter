import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';

function fakeDocClient(result, capture = {}) {
  return {
    async send(command) {
      if (capture) capture.command = command;
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe('UpdateLocationFunction Lambda Handler', () => {
  test('returns 403 when event has no authorizer claims', async () => {
    const handler = createHandler({ docClient: fakeDocClient({ Attributes: {} }), tableName: 'TestTable' });
    const response = await handler({
      pathParameters: { location_id: 'LC3-F1-R101' },
      body: JSON.stringify({ name: 'Room 101' }),
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Access-Control-Allow-Headers'], 'Content-Type,Authorization');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Forbidden/);
  });

  test('returns 403 when caller is in user group', async () => {
    const handler = createHandler({ docClient: fakeDocClient({ Attributes: {} }), tableName: 'TestTable' });
    const response = await handler({
      pathParameters: { location_id: 'LC3-F1-R101' },
      body: JSON.stringify({ name: 'Room 101' }),
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

  test('returns 400 with CORS headers if location_id is missing for authorized caller', async () => {
    const handler = createHandler({ docClient: fakeDocClient({ Attributes: {} }), tableName: 'TestTable' });
    const event = {
      pathParameters: null,
      body: JSON.stringify({ name: 'Room 101' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid',
            'cognito:groups': 'staff',
          },
        },
      },
    };

    const response = await handler(event);

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Content-Type'], 'application/json');

    const body = JSON.parse(response.body);
    assert.match(body.error, /Missing location_id/);
  });

  test('returns 400 with CORS headers if body is invalid JSON for authorized caller', async () => {
    const handler = createHandler({ docClient: fakeDocClient({ Attributes: {} }), tableName: 'TestTable' });
    const event = {
      pathParameters: { location_id: 'LC3-F1-R101' },
      body: 'invalid-json{',
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid',
            'cognito:groups': 'staff',
          },
        },
      },
    };

    const response = await handler(event);

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');

    const body = JSON.parse(response.body);
    assert.match(body.error, /Invalid JSON/);
  });

  test('returns 400 with CORS headers if no updatable fields provided for authorized caller', async () => {
    const handler = createHandler({ docClient: fakeDocClient({ Attributes: {} }), tableName: 'TestTable' });
    const event = {
      pathParameters: { location_id: 'LC3-F1-R101' },
      body: JSON.stringify({}),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid',
            'cognito:groups': 'staff',
          },
        },
      },
    };

    const response = await handler(event);

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');

    const body = JSON.parse(response.body);
    assert.match(body.error, /No fields provided/);
  });

  test('returns 200 and records updatedBy & updatedAt on success for staff', async () => {
    const capture = {};
    const fakeAttributes = { location_id: 'LC3-F1-R101', name: 'Room 101' };
    const handler = createHandler({
      docClient: fakeDocClient({ Attributes: fakeAttributes }, capture),
      tableName: 'TestTable',
    });
    const event = {
      pathParameters: { location_id: 'LC3-F1-R101' },
      body: JSON.stringify({ name: 'Room 101', updatedBy: 'spoofed-user' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid-123',
            'cognito:username': 'staff@torch.dev',
            'cognito:groups': 'staff',
          },
        },
      },
    };

    const response = await handler(event);

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');

    const values = capture.command?.input?.ExpressionAttributeValues;
    assert.ok(values, 'UpdateCommand should contain ExpressionAttributeValues');
    const valEntries = Object.values(values);
    assert.ok(valEntries.includes('staff@torch.dev'), 'updatedBy must come from token claims');
  });

  test('returns 200 when caller is admin', async () => {
    const capture = {};
    const handler = createHandler({
      docClient: fakeDocClient({ Attributes: {} }, capture),
      tableName: 'TestTable',
    });
    const event = {
      pathParameters: { location_id: 'LC3-F1-R101' },
      body: JSON.stringify({ capacity: 50 }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid-999',
            'cognito:groups': ['admin'],
          },
        },
      },
    };

    const response = await handler(event);

    assert.equal(response.statusCode, 200);
    const values = capture.command?.input?.ExpressionAttributeValues;
    const valEntries = Object.values(values);
    assert.ok(valEntries.includes('admin-uuid-999'));
  });
});
