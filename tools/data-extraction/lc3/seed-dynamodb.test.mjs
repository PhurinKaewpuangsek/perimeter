import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { normalizeScheduleRecord } from './csv.mjs';
import {
  createDynamoDBClientOptions,
  planGraphWrites,
  planSeedWrites,
  readSeedRecords,
  toGraphUpdate,
  writeGraphRecords,
  writeRecords,
} from './seed-dynamodb.mjs';

class FakePutCommand {
  constructor(input) {
    this.input = input;
  }
}

const FakeUpdateCommand = FakePutCommand;

/**
 * In-memory graph table that applies UpdateItem the way DynamoDB does for the expressions
 * toGraphUpdate builds: upsert by key, SET the named attributes, REMOVE the rest listed.
 */
function fakeGraphTable(initialItems = []) {
  const items = new Map(initialItems.map((item) => [item.element_id, structuredClone(item)]));
  return {
    items,
    async send({ input }) {
      const { Key, UpdateExpression, ExpressionAttributeNames: names, ExpressionAttributeValues: values } = input;
      const item = items.get(Key.element_id) ?? { ...Key };
      const [, setPart, removePart] = /^SET (.+?)(?: REMOVE (.+))?$/.exec(UpdateExpression);
      for (const assignment of setPart.split(', ')) {
        const [name, value] = assignment.split(' = ');
        item[names[name]] = values[value];
      }
      for (const name of removePart?.split(', ') ?? []) delete item[names[name]];
      items.set(Key.element_id, item);
    },
  };
}

const CLOSURE = {
  closed: true,
  closed_from: '2026-10-30T08:00:00+07:00',
  closed_until: '2026-10-30T17:00:00+07:00',
  closed_reason: 'ปิดซ่อมทางเดิน',
  closed_by: 'staff@example.com',
};

describe('schedule seeder', () => {
  test('configures six total DynamoDB request attempts and preserves the selected region', () => {
    assert.deepEqual(createDynamoDBClientOptions(), { maxAttempts: 6 });
    assert.deepEqual(createDynamoDBClientOptions('ap-southeast-1'), {
      region: 'ap-southeast-1',
      maxAttempts: 6,
    });
  });

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
      planSeedWrites(records, existingItems, { pk: 'room_code', sk: 'schedule_slot' }),
      { written: 2, skipped: 1 }
    );
  });

  test('normalizes schedule records consistently for generated JSON and DynamoDB seeding', () => {
    assert.deepEqual(
      normalizeScheduleRecord({
        room_code: 'LC3-103',
        event_code: 'CS102',
        day_of_week: 'MON',
        start_time: '09:00',
        event_date: '',
      }),
      {
        room_code: 'LC3-103',
        event_code: 'CS102',
        day_of_week: 'MON',
        start_time: '09:00',
        schedule_slot: 'MON#09:00#CS102',
      }
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

describe('graph seeder', () => {
  const { records, keyAttributes } = readSeedRecords('graph');
  const node = records.find((r) => r.element_id === 'NODE#LC3_103');
  const edge = records.find((r) => r.element_id.startsWith('EDGE#'));

  test('reads every node and edge of the graph seed, keyed by graph_id and element_id', () => {
    assert.deepEqual(keyAttributes, { pk: 'graph_id', sk: 'element_id' });
    assert.equal(records.length, 590);
    assert.equal(records.filter((r) => r.element_id.startsWith('NODE#')).length, 288);
    assert.equal(records.filter((r) => r.element_id.startsWith('EDGE#')).length, 302);
  });

  test('builds an update that writes only seed-owned fields, aliasing reserved words', () => {
    const input = toGraphUpdate('Graph', edge);
    assert.deepEqual(input.Key, { graph_id: 'LC3', element_id: edge.element_id });
    assert.deepEqual(
      Object.values(input.ExpressionAttributeNames).sort(),
      ['distance', 'edge_type', 'from', 'to']
    );
    // FROM and TO are DynamoDB reserved words, so no field may appear in the expression raw.
    assert.doesNotMatch(input.UpdateExpression, /\b(from|to|closed\w*)\b/);
  });

  test('re-seeding keeps the closures staff set and restores the structure', async () => {
    const table = fakeGraphTable([
      { ...node, x: 0, y: 0, ...CLOSURE },
      { ...edge, distance: 1, ...CLOSURE },
    ]);

    const result = await writeGraphRecords(table, FakeUpdateCommand, 'Graph', [node, edge]);

    assert.deepEqual(result, { written: 2, skipped: 0 });
    assert.deepEqual(table.items.get(node.element_id), { ...node, ...CLOSURE });
    assert.deepEqual(table.items.get(edge.element_id), { ...edge, ...CLOSURE });
  });

  test('creates missing items and drops a location link the seed no longer makes', async () => {
    const { location_id: _dropped, ...unlinked } = node;
    const table = fakeGraphTable([{ ...node, ...CLOSURE }]);

    await writeGraphRecords(table, FakeUpdateCommand, 'Graph', [unlinked, edge]);

    assert.deepEqual(table.items.get(node.element_id), { ...unlinked, ...CLOSURE });
    assert.deepEqual(table.items.get(edge.element_id), edge);
  });

  test('refuses to seed an item missing a required field, before writing anything', async () => {
    const { x: _x, ...noX } = node;
    const { distance: _d, ...noDistance } = edge;
    const table = fakeGraphTable([{ ...node, ...CLOSURE }]);

    assert.throws(() => toGraphUpdate('Graph', noX), /NODE#LC3_103 is missing x; refusing to seed it/);
    assert.throws(() => toGraphUpdate('Graph', { ...edge, edge_type: '' }), /is missing edge_type/);
    assert.throws(() => toGraphUpdate('Graph', { ...node, element_id: 'ROOM#LC3_103' }), /NODE# or EDGE# element_id/);
    await assert.rejects(
      writeGraphRecords(table, FakeUpdateCommand, 'Graph', [edge, noDistance]),
      /is missing distance/
    );
    // Nothing was written, and the stored node kept every field.
    assert.equal(table.items.size, 1);
    assert.deepEqual(table.items.get(node.element_id), { ...node, ...CLOSURE });
  });

  test('propagates write errors', async () => {
    const docClient = {
      async send() {
        throw new Error('AccessDeniedException');
      },
    };

    await assert.rejects(writeGraphRecords(docClient, FakeUpdateCommand, 'Graph', [node]), /AccessDeniedException/);
  });

  test('dry-run counts existing items as updates, whatever closures they carry', () => {
    const existingItems = [
      { graph_id: 'LC3', element_id: node.element_id, updatedBy: 'staff@example.com' },
      { graph_id: 'LC3', element_id: 'NODE#NOT-IN-SEED' },
    ];

    assert.deepEqual(planGraphWrites([node, edge], existingItems, keyAttributes), { created: 1, updated: 1 });
  });
});
