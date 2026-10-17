import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';

function fakeDocClient({ items = [], error = null, onSend = null } = {}) {
  return {
    async send(command) {
      if (onSend) onSend(command);
      if (error) throw error;
      return { Items: items };
    },
  };
}

describe('GetPinsFunction Lambda Handler', () => {
  test('returns 401 with CORS headers when event has no authorizer claims or sub', async () => {
    const handler = createHandler({ docClient: fakeDocClient(), tableName: 'SmartFacultyPins' });

    // No requestContext
    const res1 = await handler({});
    assert.equal(res1.statusCode, 401);
    assert.equal(res1.headers['Access-Control-Allow-Origin'], '*');
    assert.match(JSON.parse(res1.body).error, /Unauthorized/);

    // Empty claims
    const res2 = await handler({
      requestContext: { authorizer: { claims: {} } },
    });
    assert.equal(res2.statusCode, 401);
  });

  test('successfully queries pins for authenticated caller sub', async () => {
    let capturedCommand = null;
    const mockPins = [
      {
        user_id: 'sub-user-123',
        pin_key: 'LC3-101/1#MON#09:00#CS333',
        room_code: 'LC3-101/1',
        schedule_slot: 'MON#09:00#CS333',
        event_code: 'CS333',
        event_name: 'Software Engineering',
        day_of_week: 'MON',
        start_time: '09:00',
        end_time: '12:00',
        event_type: 'class',
      },
    ];

    const handler = createHandler({
      docClient: fakeDocClient({
        items: mockPins,
        onSend: (cmd) => {
          capturedCommand = cmd;
        },
      }),
      tableName: 'SmartFacultyPins',
    });

    const response = await handler({
      requestContext: {
        authorizer: {
          claims: {
            sub: 'sub-user-123',
            email: 'user123@dome.tu.ac.th',
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Content-Type'], 'application/json');

    const body = JSON.parse(response.body);
    assert.equal(body.count, 1);
    assert.deepEqual(body.records, mockPins);

    // Verify DynamoDB query parameters
    assert.equal(capturedCommand.input.TableName, 'SmartFacultyPins');
    assert.equal(capturedCommand.input.KeyConditionExpression, 'user_id = :userId');
    assert.equal(capturedCommand.input.ExpressionAttributeValues[':userId'], 'sub-user-123');
  });

  test('user isolation: strictly uses claims.sub ignoring any query or path user_id parameters', async () => {
    let capturedUserId = null;
    const handler = createHandler({
      docClient: fakeDocClient({
        onSend: (cmd) => {
          capturedUserId = cmd.input.ExpressionAttributeValues[':userId'];
        },
      }),
      tableName: 'SmartFacultyPins',
    });

    await handler({
      queryStringParameters: { user_id: 'victim-sub-999', userId: 'victim-sub-999' },
      pathParameters: { user_id: 'victim-sub-999' },
      body: JSON.stringify({ user_id: 'victim-sub-999' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'attacker-sub-111',
          },
        },
      },
    });

    assert.equal(capturedUserId, 'attacker-sub-111');
  });

  test('returns 500 with CORS headers when DynamoDB query fails', async () => {
    const handler = createHandler({
      docClient: fakeDocClient({ error: new Error('DynamoDB connection timeout') }),
      tableName: 'SmartFacultyPins',
    });

    const response = await handler({
      requestContext: {
        authorizer: {
          claims: {
            sub: 'sub-user-123',
          },
        },
      },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Failed to fetch pins/);
    assert.equal(body.message, undefined);
  });
});
