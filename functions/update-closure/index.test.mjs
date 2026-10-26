import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, parseClosureTime, validateClosure, MAX_ITEMS } from './index.mjs';

// ── helpers ──────────────────────────────────────────────────────────────────

const staff = { authorizer: { claims: { sub: 'staff-uuid', 'cognito:username': 'staff@torch.dev', 'cognito:groups': 'staff' } } };
const admin = { authorizer: { claims: { sub: 'admin-uuid', 'cognito:username': 'admin@torch.dev', 'cognito:groups': '[admin]' } } };
const user = { authorizer: { claims: { sub: 'user-uuid', 'cognito:groups': 'user' } } };

const ROOM = 'NODE#LC3_101';
const WALKWAY = 'EDGE#LC3_124/2|LC3_124/1';

/** Fake client that records every command and optionally throws on send. */
function fakeDocClient(error) {
  const commands = [];
  return {
    commands,
    async send(command) {
      commands.push(command);
      if (error) throw error;
      return {};
    },
  };
}

// Fixed clock for every test: 2026-10-28 09:00 Bangkok, the day before the sample closures.
const NOW = new Date('2026-10-28T09:00:00+07:00');

async function put(body, { requestContext = staff, docClient = fakeDocClient(), now = () => NOW } = {}) {
  const handler = createHandler({ docClient, tableName: 'GraphTable', now });
  const response = await handler({ body: JSON.stringify(body), requestContext });
  return { response, docClient, json: JSON.parse(response.body) };
}

function canceled(codes) {
  return Object.assign(new Error('Transaction cancelled'), {
    name: 'TransactionCanceledException',
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

const updates = (docClient) => docClient.commands[0].input.TransactItems.map((t) => t.Update);

// ── tests ────────────────────────────────────────────────────────────────────

describe('update-closure Lambda', () => {
  describe('authorization', () => {
    test('returns 403 without authorizer claims and writes nothing', async () => {
      const docClient = fakeDocClient();
      const handler = createHandler({ docClient, tableName: 'GraphTable' });
      const response = await handler({ body: JSON.stringify({ element_id: ROOM, closed: true }) });
      assert.equal(response.statusCode, 403);
      assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
      assert.equal(docClient.commands.length, 0);
    });

    test('returns 403 for a user who is not staff or admin', async () => {
      const { response, docClient } = await put({ element_id: ROOM, closed: true }, { requestContext: user });
      assert.equal(response.statusCode, 403);
      assert.equal(docClient.commands.length, 0);
    });

    test('accepts admin (groups written as "[admin]")', async () => {
      const { response } = await put({ element_id: ROOM, closed: true }, { requestContext: admin });
      assert.equal(response.statusCode, 200);
    });
  });

  describe('closing and opening', () => {
    test('closes a room with a window and reason, recording who did it', async () => {
      const { response, docClient, json } = await put({
        element_id: ROOM,
        closed: true,
        closed_from: '2026-10-29T08:00:00+07:00',
        closed_until: '2026-10-29T12:00:00+07:00',
        closed_reason: '  ปรับปรุงห้อง  ',
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
      const [update] = updates(docClient);
      assert.equal(update.TableName, 'GraphTable');
      assert.deepEqual(update.Key, { graph_id: 'LC3', element_id: ROOM });
      assert.equal(update.ConditionExpression, 'attribute_exists(#elementId)');
      assert.equal(update.UpdateExpression.includes('REMOVE'), false);
      assert.deepEqual(update.ExpressionAttributeValues, {
        ':closed': true,
        ':closedBy': 'staff@torch.dev',
        ':closed_from': '2026-10-29T08:00:00+07:00',
        ':closed_until': '2026-10-29T12:00:00+07:00',
        ':closed_reason': 'ปรับปรุงห้อง',
      });
      assert.equal(json.data[0].closed_reason, 'ปรับปรุงห้อง');
    });

    test('closes a walkway whose id contains "/" and "|"', async () => {
      const { response, docClient } = await put({ element_id: WALKWAY, closed: true });
      assert.equal(response.statusCode, 200);
      assert.equal(updates(docClient)[0].Key.element_id, WALKWAY);
    });

    test('a closure without a window removes any stale window and reason', async () => {
      const { docClient } = await put({ element_id: ROOM, closed: true });
      const [update] = updates(docClient);
      assert.match(update.UpdateExpression, /REMOVE #closed_from, #closed_until, #closed_reason$/);
    });

    test('closed: false opens the element and removes window and reason', async () => {
      const { response, docClient } = await put({ element_id: ROOM, closed: false });
      assert.equal(response.statusCode, 200);
      const [update] = updates(docClient);
      assert.equal(update.ExpressionAttributeValues[':closed'], false);
      assert.match(update.UpdateExpression, /REMOVE #closed_from, #closed_until, #closed_reason$/);
    });

    test('closed: false with a window is rejected', async () => {
      const { response, docClient } = await put({ element_id: ROOM, closed: false, closed_reason: 'x' });
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /cannot be set when closed is false/);
      assert.equal(docClient.commands.length, 0);
    });
  });

  describe('several items', () => {
    test('closes a whole path in one transaction', async () => {
      const { response, docClient, json } = await put({
        items: [
          { element_id: WALKWAY, closed: true, closed_reason: 'ซ่อมพื้น' },
          { element_id: 'EDGE#LC3_A|LC3_B', closed: true, closed_reason: 'ซ่อมพื้น' },
        ],
      });
      assert.equal(response.statusCode, 200);
      assert.equal(docClient.commands.length, 1, 'one all-or-nothing transaction');
      assert.deepEqual(updates(docClient).map((u) => u.Key.element_id), [WALKWAY, 'EDGE#LC3_A|LC3_B']);
      assert.match(json.message, /2 closures updated/);
    });

    test('names the item that failed validation', async () => {
      const { response, docClient } = await put({
        items: [{ element_id: ROOM, closed: true }, { element_id: 'LC3_101', closed: true }],
      });
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /^items\[1\]: element_id must start with NODE#/);
      assert.equal(docClient.commands.length, 0);
    });

    test('rejects the same element twice', async () => {
      const { response } = await put({ items: [{ element_id: ROOM, closed: true }, { element_id: ROOM, closed: false }] });
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /appears more than once/);
    });

    test('rejects an empty list and more than the transaction limit', async () => {
      assert.equal((await put({ items: [] })).response.statusCode, 400);
      const tooMany = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({ element_id: `NODE#N${i}`, closed: true }));
      const { response } = await put({ items: tooMany });
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /At most 100/);
    });
  });

  describe('validation (400)', () => {
    const cases = [
      ['element_id missing', { closed: true }, /element_id must start/],
      ['element_id not NODE#/EDGE#', { element_id: 'LC3-F1-R101', closed: true }, /element_id must start/],
      ['closed not boolean', { element_id: ROOM, closed: 'true' }, /closed must be true or false/],
      ['time without offset', { element_id: ROOM, closed: true, closed_from: '2026-10-29T08:00:00' }, /closed_from must be an ISO-8601/],
      ['date only', { element_id: ROOM, closed: true, closed_until: '2026-10-29' }, /closed_until must be an ISO-8601/],
      ['impossible date', { element_id: ROOM, closed: true, closed_from: '2026-02-30T08:00:00+07:00' }, /closed_from must be an ISO-8601/],
      [
        'window backwards',
        { element_id: ROOM, closed: true, closed_from: '2026-10-29T12:00:00+07:00', closed_until: '2026-10-29T08:00:00+07:00' },
        /closed_from must be on or before closed_until/,
      ],
      ['reason not string', { element_id: ROOM, closed: true, closed_reason: 5 }, /closed_reason must be a string/],
      ['reason too long', { element_id: ROOM, closed: true, closed_reason: 'ก'.repeat(201) }, /at most 200 characters/],
    ];

    for (const [name, body, message] of cases) {
      test(name, async () => {
        const { response, docClient } = await put(body);
        assert.equal(response.statusCode, 400);
        assert.match(JSON.parse(response.body).error, message);
        assert.equal(docClient.commands.length, 0);
      });
    }

    test('invalid JSON', async () => {
      const handler = createHandler({ docClient: fakeDocClient(), tableName: 'GraphTable' });
      const response = await handler({ body: '{not json', requestContext: staff });
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /Invalid JSON/);
    });

    test('compares the window as instants across offsets', async () => {
      // 08:00+07:00 is 01:00Z, so it is before 02:00Z even though "08" > "02".
      const { response } = await put({
        element_id: ROOM,
        closed: true,
        closed_from: '2026-10-29T08:00:00+07:00',
        closed_until: '2026-10-29T02:00:00Z',
      });
      assert.equal(response.statusCode, 200);
    });

    test('rejects a closure that has already ended (e.g. wrong year)', async () => {
      const { response, docClient } = await put({
        element_id: ROOM,
        closed: true,
        closed_from: '2025-10-29T08:00:00+07:00',
        closed_until: '2025-10-29T12:00:00+07:00',
      });
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /closed_until is already in the past/);
      assert.equal(docClient.commands.length, 0);
    });

    test('allows a closure that started earlier and is still running', async () => {
      const { response } = await put({
        element_id: ROOM,
        closed: true,
        closed_from: '2026-10-27T08:00:00+07:00',
        closed_until: '2026-10-28T17:00:00+07:00',
      });
      assert.equal(response.statusCode, 200);
    });

    test('a window with only one bound is allowed', async () => {
      const { response } = await put({ element_id: ROOM, closed: true, closed_until: '2026-10-29T12:00+07:00' });
      assert.equal(response.statusCode, 200);
    });
  });

  describe('errors from DynamoDB', () => {
    test('returns 404 naming the element that does not exist', async () => {
      const docClient = fakeDocClient(canceled(['None', 'ConditionalCheckFailed']));
      const { response, json } = await put(
        { items: [{ element_id: ROOM, closed: true }, { element_id: 'NODE#LC3_999', closed: true }] },
        { docClient }
      );
      assert.equal(response.statusCode, 404);
      assert.deepEqual(json.element_ids, ['NODE#LC3_999']);
    });

    test('returns 500 without leaking the SDK message', async () => {
      const docClient = fakeDocClient(Object.assign(new Error('User arn:aws:iam::123:role/x is not authorized'), { name: 'AccessDeniedException' }));
      const { response, json } = await put({ element_id: ROOM, closed: true }, { docClient });
      assert.equal(response.statusCode, 500);
      assert.deepEqual(json, { error: 'Failed to update closures' });
    });
  });
});

describe('parseClosureTime', () => {
  test('accepts offsets and Z, with or without seconds', () => {
    assert.equal(parseClosureTime('2026-10-29T08:00:00+07:00'), Date.parse('2026-10-29T01:00:00Z'));
    assert.equal(parseClosureTime('2026-10-29T08:00+07:00'), Date.parse('2026-10-29T01:00:00Z'));
    assert.equal(parseClosureTime('2026-10-29T01:00:00.000Z'), Date.parse('2026-10-29T01:00:00Z'));
  });

  test('rejects missing offset, impossible dates and times', () => {
    for (const value of ['2026-10-29T08:00:00', '2026-02-29T08:00+07:00', '2026-10-29T24:00+07:00', 'tomorrow', 42]) {
      assert.equal(parseClosureTime(value), null, String(value));
    }
  });
});

describe('validateClosure', () => {
  test('drops an empty reason instead of storing ""', () => {
    assert.deepEqual(validateClosure({ element_id: ROOM, closed: true, closed_reason: '   ' }), {
      item: { element_id: ROOM, closed: true },
    });
  });
});
