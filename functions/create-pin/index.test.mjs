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

describe('CreatePinFunction Lambda Handler', () => {
  test('returns 401 with CORS headers when event has no authorizer claims or sub', async () => {
    const handler = createHandler({ docClient: fakeDocClient(), tableName: 'SmartFacultyPins' });

    const res1 = await handler({
      body: JSON.stringify({ room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' }),
    });
    assert.equal(res1.statusCode, 401);
    assert.equal(res1.headers['Access-Control-Allow-Origin'], '*');
    assert.match(JSON.parse(res1.body).error, /Unauthorized/);

    const res2 = await handler({
      body: JSON.stringify({ room_code: 'LC3-101/1', schedule_slot: 'MON#09:00#CS333' }),
      requestContext: { authorizer: { claims: {} } },
    });
    assert.equal(res2.statusCode, 401);
  });

  test('returns 400 when body is invalid JSON or missing required fields', async () => {
    const handler = createHandler({ docClient: fakeDocClient(), tableName: 'SmartFacultyPins' });
    const authContext = {
      requestContext: { authorizer: { claims: { sub: 'user-sub-123' } } },
    };

    // Invalid JSON
    const res1 = await handler({ ...authContext, body: '{malformed' });
    assert.equal(res1.statusCode, 400);
    assert.match(JSON.parse(res1.body).error, /Invalid JSON/);

    // Missing room_code
    const res2 = await handler({
      ...authContext,
      body: JSON.stringify({ schedule_slot: 'MON#09:00#CS333' }),
    });
    assert.equal(res2.statusCode, 400);
    assert.match(JSON.parse(res2.body).error, /room_code/);

    // Missing schedule_slot
    const res3 = await handler({
      ...authContext,
      body: JSON.stringify({ room_code: 'LC3-101/1' }),
    });
    assert.equal(res3.statusCode, 400);
    assert.match(JSON.parse(res3.body).error, /schedule_slot/);
  });

  test('successfully creates a pin and enforces user isolation (ignores body.user_id)', async () => {
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
      requestContext: {
        authorizer: {
          claims: {
            sub: 'legitimate-user-sub',
          },
        },
      },
      body: JSON.stringify({
        user_id: 'spoofed-user-id', // MUST BE IGNORED
        room_code: 'LC3-201',
        schedule_slot: 'WED#13:30#CS211',
        event_code: 'CS211',
        event_name: 'Computer Organization',
        day_of_week: 'WED',
        start_time: '13:30',
        end_time: '16:30',
        event_type: 'class',
      }),
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');

    const item = capturedCommand.input.Item;
    assert.equal(item.user_id, 'legitimate-user-sub');
    assert.equal(item.pin_key, 'LC3-201#WED#13:30#CS211');
    assert.equal(item.room_code, 'LC3-201');
    assert.equal(item.schedule_slot, 'WED#13:30#CS211');
    assert.equal(item.event_code, 'CS211');
    assert.equal(item.event_name, 'Computer Organization');
    assert.ok(item.created_at);
  });

  test('accepts camelCase properties as well as snake_case', async () => {
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
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-camel-sub',
          },
        },
      },
      body: JSON.stringify({
        roomCode: 'LC3-105',
        scheduleSlot: 'MON#09:00#CS102',
        eventCode: 'CS102',
        eventName: 'Intro to Programming',
        dayOfWeek: 'MON',
        startTime: '09:00',
        endTime: '12:00',
        eventType: 'exam',
        eventDate: '2026-05-18',
      }),
    });

    assert.equal(response.statusCode, 201);
    const item = capturedCommand.input.Item;
    assert.equal(item.user_id, 'user-camel-sub');
    assert.equal(item.pin_key, 'LC3-105#MON#09:00#CS102');
    assert.equal(item.room_code, 'LC3-105');
    assert.equal(item.schedule_slot, 'MON#09:00#CS102');
    assert.equal(item.event_date, '2026-05-18');
  });

  test('returns 500 when DynamoDB put operation fails', async () => {
    const handler = createHandler({
      docClient: fakeDocClient({ error: new Error('DynamoDB write error') }),
      tableName: 'SmartFacultyPins',
    });

    const response = await handler({
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-sub-123',
          },
        },
      },
      body: JSON.stringify({
        room_code: 'LC3-105',
        schedule_slot: 'MON#09:00#CS102',
      }),
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.match(JSON.parse(response.body).error, /Failed to pin schedule/);
  });
});
