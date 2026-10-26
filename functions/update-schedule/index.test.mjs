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

  describe('event_date validation', () => {
    const staffContext = {
      authorizer: { claims: { sub: 'staff-uuid', 'cognito:username': 'staff@torch.dev', 'cognito:groups': 'staff' } },
    };
    const pathParameters = { room_code: 'LC3-103', schedule_slot: 'MON#13:00#BAS350' };
    const storedSlot = {
      room_code: 'LC3-103',
      schedule_slot: 'MON#13:00#BAS350',
      day_of_week: 'MON',
      start_time: '13:00',
      event_code: 'BAS350',
    };

    /** Fake client that answers GetCommand with storedItem and records every command. */
    function scriptedDocClient({ storedItem, updateError } = {}) {
      const commands = [];
      return {
        commands,
        async send(command) {
          commands.push(command);
          const name = command.constructor.name;
          if (name === 'GetCommand') return { Item: storedItem };
          if (name === 'UpdateCommand' && updateError) throw updateError;
          return { Attributes: {} };
        },
      };
    }

    async function update(body, docClient) {
      const handler = createHandler({ docClient, tableName: 'TestTable' });
      return handler({ pathParameters, body: JSON.stringify(body), requestContext: staffContext });
    }

    test('sets a valid event_date', async () => {
      const docClient = scriptedDocClient();
      const response = await update({ event_date: '2026-05-18' }, docClient);
      assert.equal(response.statusCode, 200);
      const input = docClient.commands[0].input;
      assert.ok(Object.values(input.ExpressionAttributeNames).includes('event_date'));
      assert.ok(Object.values(input.ExpressionAttributeValues).includes('2026-05-18'));
    });

    test('rejects event_date in the wrong format without writing', async () => {
      const docClient = scriptedDocClient();
      const response = await update({ event_date: '18/05/2026' }, docClient);
      assert.equal(response.statusCode, 400);
      assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
      assert.match(JSON.parse(response.body).error, /Invalid event_date/);
      assert.equal(docClient.commands.length, 0);
    });

    test('rejects a date that does not exist on the calendar', async () => {
      const response = await update({ event_date: '2026-02-30' }, scriptedDocClient());
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /Invalid event_date/);
    });

    test('rejects changing a row to exam while clearing its date', async () => {
      const docClient = scriptedDocClient();
      const response = await update({ event_type: 'exam', event_date: null }, docClient);
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /event_date is required for exam rows/);
      assert.equal(docClient.commands.length, 0);
    });

    test('guards changing a row to exam without a date by requiring a stored date', async () => {
      const docClient = scriptedDocClient();
      await update({ event_type: 'exam' }, docClient);
      const input = docClient.commands[0].input;
      assert.match(input.ConditionExpression, /attribute_exists\(#eventDate\)/);
      assert.equal(input.ExpressionAttributeNames['#eventDate'], 'event_date');
    });

    test('guards clearing the date so a stored exam row keeps one', async () => {
      const docClient = scriptedDocClient();
      await update({ event_date: '' }, docClient);
      const input = docClient.commands[0].input;
      assert.match(input.UpdateExpression, /REMOVE #eventDate/);
      assert.match(input.ConditionExpression, /NOT \(#eventType = :examType\)/);
      assert.equal(input.ExpressionAttributeValues[':examType'], 'exam');
    });

    test('returns 400 (not 404) when the stored exam row would lose its date', async () => {
      const error = Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException',
        Item: { event_type: { S: 'exam' } },
      });
      const response = await update({ event_date: null }, scriptedDocClient({ updateError: error }));
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /event_date is required for exam rows/);
    });

    test('still returns 404 when the row does not exist', async () => {
      const error = Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException',
      });
      const response = await update({ end_time: '16:00' }, scriptedDocClient({ updateError: error }));
      assert.equal(response.statusCode, 404);
    });

    test('stores event_type in lowercase so the exam-date condition matches it', async () => {
      const docClient = scriptedDocClient();
      await update({ event_type: 'EXAM', event_date: '2026-05-18' }, docClient);
      const input = docClient.commands[0].input;
      assert.ok(Object.values(input.ExpressionAttributeValues).includes('exam'));
      assert.ok(!Object.values(input.ExpressionAttributeValues).includes('EXAM'));
    });

    test('rejects a mixed-case exam type while clearing its date', async () => {
      const docClient = scriptedDocClient();
      const response = await update({ event_type: 'Exam', event_date: null }, docClient);
      assert.equal(response.statusCode, 400);
      assert.equal(docClient.commands.length, 0);
    });

    test('class row without a date can still be edited without extra conditions', async () => {
      const docClient = scriptedDocClient();
      const response = await update({ event_type: 'class', end_time: '14:30' }, docClient);
      assert.equal(response.statusCode, 200);
      assert.equal(docClient.commands[0].input.ConditionExpression, 'attribute_exists(schedule_slot)');
    });

    test('rejects re-creating an exam row (slot change) that has no date', async () => {
      const docClient = scriptedDocClient({
        storedItem: { ...storedSlot, event_type: 'exam' },
      });
      const response = await update({ start_time: '14:00' }, docClient);
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /event_date is required for exam rows/);
      assert.equal(docClient.commands.length, 1, 'only the GetCommand ran');
    });

    test('re-creates an exam row (slot change) and keeps its stored date', async () => {
      const docClient = scriptedDocClient({
        storedItem: { ...storedSlot, event_type: 'exam', event_date: '2026-05-18' },
      });
      const response = await update({ start_time: '14:00' }, docClient);
      assert.equal(response.statusCode, 200);
      const put = docClient.commands[1].input.TransactItems[1].Put.Item;
      assert.equal(put.schedule_slot, 'MON#14:00#BAS350');
      assert.equal(put.event_date, '2026-05-18');
    });

    test('re-creating with a cleared date removes it from the new row', async () => {
      const docClient = scriptedDocClient({
        storedItem: { ...storedSlot, event_type: 'other', event_date: '2026-05-18' },
      });
      const response = await update({ start_time: '14:00', event_date: null }, docClient);
      assert.equal(response.statusCode, 200);
      const put = docClient.commands[1].input.TransactItems[1].Put.Item;
      assert.equal('event_date' in put, false);
    });

    test('rejects invalid time formats or start_time >= end_time (BUG-06)', async () => {
      const docClient = scriptedDocClient({
        storedItem: { ...storedSlot, end_time: '16:00' },
      });
      for (const badBody of [
        { start_time: '25:99' },
        { end_time: '9:00' },
        { end_time: '12:00' }, // slot start_time in path is 13:00
        { start_time: '16:00', end_time: '09:00' },
        { start_time: '12:00', end_time: '12:00' },
        { start_time: '17:00' }, // stored end_time is 16:00
      ]) {
        const res = await update(badBody, docClient);
        assert.equal(res.statusCode, 400, `should reject ${JSON.stringify(badBody)}`);
      }
    });

    test('allows clearing end_time with empty string or null', async () => {
      const docClient = scriptedDocClient();
      const response = await update({ end_time: '' }, docClient);
      assert.equal(response.statusCode, 200);
      const input = docClient.commands[0].input;
      assert.match(input.UpdateExpression, /REMOVE #endTime/);
      assert.equal(input.ExpressionAttributeNames['#endTime'], 'end_time');
    });

    test('syncs day_of_week and re-creates schedule_slot when event_date weekday differs (BUG-06)', async () => {
      const docClient = scriptedDocClient({
        storedItem: { ...storedSlot, end_time: '16:00', event_type: 'exam', event_date: '2026-05-18' },
      });
      // 2026-10-30 is Friday (FRI), storedSlot is MON
      const response = await update({ event_date: '2026-10-30' }, docClient);
      assert.equal(response.statusCode, 200);
      const put = docClient.commands[1].input.TransactItems[1].Put.Item;
      assert.equal(put.day_of_week, 'FRI');
      assert.equal(put.schedule_slot, 'FRI#13:00#BAS350');
      assert.equal(put.event_date, '2026-10-30');
    });
  });
  describe('moving a row to another room (room_code in body)', () => {
    const staffContext = {
      authorizer: { claims: { sub: 'staff-uuid', 'cognito:username': 'staff@torch.dev', 'cognito:groups': 'staff' } },
    };
    const pathParameters = { room_code: 'LC3-104', schedule_slot: 'MON#09:00#CS333' };
    const storedRow = {
      room_code: 'LC3-104',
      schedule_slot: 'MON#09:00#CS333',
      day_of_week: 'MON',
      start_time: '09:00',
      end_time: '12:00',
      event_code: 'CS333',
      event_name: 'Cloud Computing',
      event_type: 'lecture',
    };
    const targetRoom = { location_id: 'LC3-F1-R105', room_code: 'LC3-105' };
    const moveTo105 = { room_code: 'LC3-105', location_id: 'LC3-F1-R105' };

    /**
     * Fake client: GetCommand on the locations table answers targetRoom, on the schedules
     * table answers storedRow; TransactWriteCommand throws transactError when given.
     */
    function moveDocClient({ room = targetRoom, row = storedRow, transactError } = {}) {
      const commands = [];
      return {
        commands,
        async send(command) {
          commands.push(command);
          const name = command.constructor.name;
          if (name === 'GetCommand') {
            return { Item: (command.input.TableName === 'LocationsTable' ? room : row) ?? undefined };
          }
          if (name === 'TransactWriteCommand' && transactError) throw transactError;
          return { Attributes: {} };
        },
      };
    }

    async function move(body, docClient, requestContext = staffContext) {
      const handler = createHandler({ docClient, tableName: 'TestTable', locationsTableName: 'LocationsTable' });
      return handler({ pathParameters, body: JSON.stringify(body), requestContext });
    }

    function transactCanceled(reasons) {
      return Object.assign(new Error('Transaction cancelled'), {
        name: 'TransactionCanceledException',
        CancellationReasons: reasons,
      });
    }

    test('moves the row in one transaction: deletes the old key and puts every field under the new room', async () => {
      const docClient = moveDocClient();
      const response = await move(moveTo105, docClient);

      assert.equal(response.statusCode, 200);
      assert.match(JSON.parse(response.body).message, /moved/);
      const [locationGet, rowGet, transact] = docClient.commands;
      assert.deepEqual(locationGet.input, { TableName: 'LocationsTable', Key: { location_id: 'LC3-F1-R105' } });
      assert.deepEqual(rowGet.input.Key, { room_code: 'LC3-104', schedule_slot: 'MON#09:00#CS333' });

      const [del, put] = transact.input.TransactItems;
      assert.deepEqual(del.Delete.Key, { room_code: 'LC3-104', schedule_slot: 'MON#09:00#CS333' });
      assert.equal(del.Delete.ConditionExpression, 'attribute_exists(schedule_slot)');
      assert.equal(put.Put.ConditionExpression, 'attribute_not_exists(schedule_slot)');
      assert.deepEqual(
        { ...put.Put.Item, updatedAt: undefined },
        { ...storedRow, room_code: 'LC3-105', updatedBy: 'staff@torch.dev', updatedAt: undefined },
      );
      assert.equal('location_id' in put.Put.Item, false, 'location_id is not stored on the schedule row');
    });

    test('keeps event_date when an exam row is moved', async () => {
      const examRow = { ...storedRow, event_type: 'exam', event_date: '2026-12-01' };
      const docClient = moveDocClient({ row: examRow });
      const response = await move(moveTo105, docClient);

      assert.equal(response.statusCode, 200);
      const put = docClient.commands[2].input.TransactItems[1].Put.Item;
      assert.equal(put.event_date, '2026-12-01');
    });

    test('moves and changes the time together (new room and new schedule_slot)', async () => {
      const docClient = moveDocClient();
      const response = await move({ ...moveTo105, start_time: '13:00', end_time: '16:00' }, docClient);

      assert.equal(response.statusCode, 200);
      const put = docClient.commands[2].input.TransactItems[1].Put.Item;
      assert.equal(put.room_code, 'LC3-105');
      assert.equal(put.schedule_slot, 'MON#13:00#CS333');
      assert.equal(put.end_time, '16:00');
    });

    test('returns 400 when the target room does not exist, without touching schedules', async () => {
      const docClient = moveDocClient({ room: null });
      const response = await move(moveTo105, docClient);

      assert.equal(response.statusCode, 400);
      assert.equal(JSON.parse(response.body).error, 'Target room not found');
      assert.equal(docClient.commands.length, 1, 'only the location lookup ran');
    });

    test('returns 400 when location_id points at a different room than room_code', async () => {
      const docClient = moveDocClient({ room: { location_id: 'LC3-F1-R105', room_code: 'LC3-106' } });
      const response = await move(moveTo105, docClient);

      assert.equal(response.statusCode, 400);
      assert.equal(JSON.parse(response.body).error, 'Target room not found');
    });

    test('returns 400 when moving without the target location_id', async () => {
      const docClient = moveDocClient();
      const response = await move({ room_code: 'LC3-105' }, docClient);

      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /location_id/);
      assert.equal(docClient.commands.length, 0);
    });

    test('returns 400 when room_code is not a string', async () => {
      const docClient = moveDocClient();
      const response = await move({ room_code: 105, location_id: 'LC3-F1-R105' }, docClient);
      assert.equal(response.statusCode, 400);
      assert.equal(docClient.commands.length, 0);
    });

    test('returns 409 with a readable message when the target room already has the slot', async () => {
      const error = transactCanceled([{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }]);
      const response = await move(moveTo105, moveDocClient({ transactError: error }));

      assert.equal(response.statusCode, 409);
      assert.equal(JSON.parse(response.body).error, 'มีรายการเวลา/รหัสเดียวกันในห้องนั้นแล้ว');
    });

    test('returns 404 when the source row was deleted before the move committed', async () => {
      const error = transactCanceled([{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }]);
      const response = await move(moveTo105, moveDocClient({ transactError: error }));
      assert.equal(response.statusCode, 404);
    });

    test('returns 404 when the source row does not exist', async () => {
      const docClient = moveDocClient({ row: null });
      const response = await move(moveTo105, docClient);

      assert.equal(response.statusCode, 404);
      assert.equal(docClient.commands.some((c) => c.constructor.name === 'TransactWriteCommand'), false);
    });

    test('rejects moving an exam row that has no event_date', async () => {
      const docClient = moveDocClient({ row: { ...storedRow, event_type: 'exam' } });
      const response = await move(moveTo105, docClient);

      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /event_date is required for exam rows/);
      assert.equal(docClient.commands.some((c) => c.constructor.name === 'TransactWriteCommand'), false);
    });

    test('rejects moving a row into an exam without a date', async () => {
      const docClient = moveDocClient();
      const response = await move({ ...moveTo105, event_type: 'exam' }, docClient);
      assert.equal(response.statusCode, 400);
      assert.equal(docClient.commands.some((c) => c.constructor.name === 'TransactWriteCommand'), false);
    });

    test('returns 403 for a user who is not staff or admin', async () => {
      const docClient = moveDocClient();
      const userContext = { authorizer: { claims: { sub: 'user-uuid', 'cognito:groups': 'user' } } };
      const response = await move(moveTo105, docClient, userContext);

      assert.equal(response.statusCode, 403);
      assert.equal(docClient.commands.length, 0);
    });

    test('same room_code as the path is a normal update, with no lookup or transaction', async () => {
      const docClient = moveDocClient();
      const response = await move({ room_code: 'LC3-104', location_id: 'LC3-F1-R104', end_time: '12:30' }, docClient);

      assert.equal(response.statusCode, 200);
      assert.equal(docClient.commands.length, 1);
      assert.equal(docClient.commands[0].constructor.name, 'UpdateCommand');
    });

    test('same room_code with no other field still reports nothing to update', async () => {
      const docClient = moveDocClient();
      const response = await move({ room_code: 'LC3-104' }, docClient);
      assert.equal(response.statusCode, 400);
      assert.match(JSON.parse(response.body).error, /No fields provided/);
    });
  });
});
