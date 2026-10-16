import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planSeedWrites, readSeedRecords, writeRecords } from './seed-dynamodb.mjs';

class FakePutCommand {
  constructor(input) {
    this.input = input;
  }
}

describe('schedule seeder', () => {
  test('skips admin-edited records and writes records that remain seed-managed', async () => {
    const writes = [];
    const docClient = {
      async send(command) {
        writes.push(command.input);
        if (command.input.Item.schedule_slot.endsWith('#ADMIN-EDITED')) {
          const error = new Error('The item was edited by an administrator');
          error.name = 'ConditionalCheckFailedException';
          throw error;
        }
      },
    };
    const records = [
      { room_code: 'LC3-103', schedule_slot: 'MON#09:00#ADMIN-EDITED', event_date: '2026-05-18' },
      { room_code: 'LC3-103', schedule_slot: 'MON#13:00#SEED-MANAGED', event_date: '2026-05-18' },
    ];

    const result = await writeRecords(docClient, FakePutCommand, 'Schedules', records);

    assert.deepEqual(result, { written: 1, skipped: 1 });
    assert.equal(writes.length, 2);
    assert.ok(writes.every((input) => input.ConditionExpression === 'attribute_not_exists(updatedBy)'));
  });

  test('propagates write errors other than conditional conflicts', async () => {
    const docClient = {
      async send() {
        throw new Error('ProvisionedThroughputExceededException');
      },
    };

    await assert.rejects(
      writeRecords(
        docClient,
        FakePutCommand,
        'Schedules',
        [{ room_code: 'LC3-103', schedule_slot: 'MON#13:00#CS102' }]
      ),
      /ProvisionedThroughputExceededException/
    );
  });

  test('dry-run counts an existing updatedBy item as skipped', () => {
    const records = [
      { room_code: 'LC3-103', schedule_slot: 'MON#09:00#A' },
      { room_code: 'LC3-103', schedule_slot: 'MON#10:00#B' },
      { room_code: 'LC3-104', schedule_slot: 'TUE#09:00#C' },
    ];
    const existingItems = [
      { room_code: 'LC3-103', schedule_slot: 'MON#09:00#A', updatedBy: 'staff@example.com' },
      { room_code: 'LC3-103', schedule_slot: 'MON#10:00#B' },
    ];

    assert.deepEqual(
      planSeedWrites(records, existingItems, 'room_code', 'schedule_slot'),
      { written: 2, skipped: 1 }
    );
  });

  test('reads all ten exam dates and leaves class rows without event_date', () => {
    const { records } = readSeedRecords('schedules');
    const exams = records.filter((record) => record.event_type === 'exam');
    const classes = records.filter((record) => record.event_type === 'class');

    assert.equal(exams.length, 10);
    assert.ok(exams.every((record) => /^\d{4}-\d{2}-\d{2}$/.test(record.event_date)));
    assert.ok(classes.every((record) => !Object.hasOwn(record, 'event_date')));
  });
});
