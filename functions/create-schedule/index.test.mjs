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

  describe('event_date validation', () => {
    const staffContext = {
      authorizer: { claims: { sub: 'staff-uuid', 'cognito:username': 'staff@torch.dev', 'cognito:groups': 'staff' } },
    };
    const baseBody = { room_code: 'LC3-103', day_of_week: 'MON', start_time: '13:00', event_code: 'BAS350' };

    async function create(extra, capture = {}) {
      const handler = createHandler({ docClient: fakeDocClient({}, capture), tableName: 'TestTable' });
      return handler({ body: JSON.stringify({ ...baseBody, ...extra }), requestContext: staffContext });
    }

    test('stores a valid event_date on an exam row', async () => {
      const capture = {};
      const response = await create({ event_type: 'exam', event_date: '2026-05-18' }, capture);
      assert.equal(response.statusCode, 200);
      assert.equal(capture.command.input.Item.event_date, '2026-05-18');
    });

    test('rejects an exam row without event_date', async () => {
      const capture = {};
      const response = await create({ event_type: 'exam' }, capture);
      assert.equal(response.statusCode, 400);
      assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
      assert.match(JSON.parse(response.body).error, /event_date is required for exam rows/);
      assert.equal(capture.command, undefined, 'nothing is written');
    });

    test('rejects an exam row with an empty event_date', async () => {
      const response = await create({ event_type: 'exam', event_date: '' });
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /event_date is required/);
    });

    test('rejects event_date in the wrong format', async () => {
      for (const bad of ['18/05/2026', '2026-5-18', '20260518', 2026, '2026-05-18T00:00:00Z']) {
        const response = await create({ event_type: 'exam', event_date: bad });
        assert.equal(response.statusCode, 400, `should reject ${bad}`);
        assert.match(JSON.parse(response.body).error, /Invalid event_date/);
      }
    });

    test('rejects a date that does not exist on the calendar', async () => {
      for (const bad of ['2026-02-30', '2026-13-01', '2026-04-31', '2026-00-10']) {
        const response = await create({ event_type: 'exam', event_date: bad });
        assert.equal(response.statusCode, 400, `should reject ${bad}`);
        assert.match(JSON.parse(response.body).error, /Invalid event_date/);
      }
    });

    test('accepts a leap day', async () => {
      const response = await create({ event_type: 'exam', event_date: '2028-02-29' });
      assert.equal(response.statusCode, 200);
    });

    test('still creates a class row without event_date', async () => {
      const capture = {};
      const response = await create({ event_type: 'class' }, capture);
      assert.equal(response.statusCode, 200);
      assert.equal('event_date' in capture.command.input.Item, false);
    });

    test('stores event_type in lowercase so later date guards match it', async () => {
      const capture = {};
      const response = await create({ event_type: 'Exam', event_date: '2026-05-18' }, capture);
      assert.equal(response.statusCode, 200);
      assert.equal(capture.command.input.Item.event_type, 'exam');
    });

    test('treats EXAM in any letter case as an exam row', async () => {
      const response = await create({ event_type: 'Exam' });
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /event_date is required/);
    });

    test('syncs day_of_week automatically from a valid event_date (BUG-06)', async () => {
      const capture = {};
      // 2026-10-30 is a Friday (FRI), even though baseBody sends day_of_week: 'MON'
      const response = await create({ event_type: 'exam', event_date: '2026-10-30' }, capture);
      assert.equal(response.statusCode, 200);
      assert.equal(capture.command.input.Item.day_of_week, 'FRI');
      assert.equal(capture.command.input.Item.schedule_slot, 'FRI#13:00#BAS350');
    });
  });

  describe('time validation (BUG-06)', () => {
    const staffContext = {
      authorizer: { claims: { sub: 'staff-uuid', 'cognito:username': 'staff@torch.dev', 'cognito:groups': 'staff' } },
    };
    const baseBody = { room_code: 'LC3-103', day_of_week: 'MON', start_time: '09:00', end_time: '12:00', event_code: 'CS101' };

    async function create(extra, capture = {}) {
      const handler = createHandler({ docClient: fakeDocClient({}, capture), tableName: 'TestTable' });
      return handler({ body: JSON.stringify({ ...baseBody, ...extra }), requestContext: staffContext });
    }

    test('rejects start_time or end_time that is not in 24-hour HH:MM format', async () => {
      for (const badStart of ['9:00', '25:00', '12:60', '24:00', 'abc']) {
        const res = await create({ start_time: badStart });
        assert.equal(res.statusCode, 400, `should reject start_time=${badStart}`);
      }
      for (const badEnd of ['9:00', '25:99', '12:60', '24:00', 'abc']) {
        const res = await create({ end_time: badEnd });
        assert.equal(res.statusCode, 400, `should reject end_time=${badEnd}`);
      }
    });

    test('rejects when start_time >= end_time', async () => {
      for (const [start_time, end_time] of [['16:00', '09:00'], ['09:00', '09:00']]) {
        const res = await create({ start_time, end_time });
        assert.equal(res.statusCode, 400, `should reject ${start_time}..${end_time}`);
      }
    });
  });
});
