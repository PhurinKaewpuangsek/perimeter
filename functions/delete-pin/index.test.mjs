import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';

function fakeDocClient({ error = null, onSend = null } = {}) {
  return {
    async send(command) {
      if (onSend) onSend(command);
      if (error) throw error;
      return {};
    },
  };
}

describe('DeletePinFunction Lambda Handler', () => {
  test('returns 401 with CORS headers when event has no authorizer claims or sub', async () => {
    const handler = createHandler({ docClient: fakeDocClient(), tableName: 'SmartFacultyPins' });

    const res1 = await handler({
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
    });
    assert.equal(res1.statusCode, 401);
    assert.equal(res1.headers['Access-Control-Allow-Origin'], '*');
    assert.match(JSON.parse(res1.body).error, /Unauthorized/);

    const res2 = await handler({
      pathParameters: { room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' },
      requestContext: { authorizer: { claims: {} } },
    });
    assert.equal(res2.statusCode, 401);
  });

  test('returns 400 when room_code or schedule_slot is missing from pathParameters', async () => {
    const handler = createHandler({ docClient: fakeDocClient(), tableName: 'SmartFacultyPins' });
    const authContext = {
      requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    };

    // Missing room_code
    const res1 = await handler({
      ...authContext,
      pathParameters: { schedule_slot: 'MON#09:00#CS333' },
    });
    assert.equal(res1.statusCode, 400);
    assert.match(JSON.parse(res1.body).error, /room_code/);

    // Missing schedule_slot
    const res2 = await handler({
      ...authContext,
      pathParameters: { room_code: 'LC3-101/1' },
    });
    assert.equal(res2.statusCode, 400);
    assert.match(JSON.parse(res2.body).error, /schedule_slot/);
  });

  test('successfully deletes pin and enforces user isolation', async () => {
    let capturedCommand = null;
    const handler = createHandler({
      docClient: fakeDocClient({
        onSend: (cmd) => {
          capturedCommand = cmd;
        },
      }),
      tableName: 'SmartFacultyPins',
    });

    const response = await handler({
      pathParameters: {
        room_code: encodeURIComponent('LC3-101/1'),
        schedule_slot: encodeURIComponent('MON#09:00#CS333'),
      },
      queryStringParameters: { user_id: 'victim-sub-999' },
      body: JSON.stringify({ user_id: 'victim-sub-999' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'caller-sub-555',
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');

    // Verify DynamoDB DeleteCommand Key
    const key = capturedCommand.input.Key;
    assert.equal(key.user_id, 'caller-sub-555');
    assert.equal(key.pin_key, 'LC3-101/1#MON#09:00#CS333');
    assert.equal(capturedCommand.input.TableName, 'SmartFacultyPins');
  });

  test('returns 500 when DynamoDB delete operation fails', async () => {
    const handler = createHandler({
      docClient: fakeDocClient({ error: new Error('DynamoDB delete failure') }),
      tableName: 'SmartFacultyPins',
    });

    const response = await handler({
      pathParameters: {
        room_code: 'LC3-101',
        schedule_slot: 'MON#09:00#CS333',
      },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'caller-sub-555',
          },
        },
      },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Failed to delete pin/);
    assert.equal(body.message, undefined);
  });
});
