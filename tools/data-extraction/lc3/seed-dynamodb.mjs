/**
 * Loads the LC3 seed dataset into a DynamoDB locations table.
 *
 *   node tools/data-extraction/lc3/seed-dynamodb.mjs --table <name> [--dry-run]
 *
 * The target table is never defaulted. AGENTS.md §8.4 requires a seed script to be
 * pointed at a personal Learner Lab sandbox table explicitly; production data reaches
 * the shared stack through the CD pipeline, not from someone's laptop.
 *
 * Writes records with a condition that preserves items edited by an administrator.
 * Dry-run scans the target table read-only so its write/skip counts reflect current
 * updatedBy attributes.
 *
 * Graph items (--type graph) are upserted instead: an UpdateItem that sets only the fields
 * the seed owns, so the closure fields staff set on a node or edge (#147) survive every
 * re-seed the CD pipeline runs on merge.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeScheduleRecord, parseCsv } from './csv.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WRITE_CONCURRENCY = 25;

/**
 * Parses command-line tokens into the target table, region, dataset type, and mode.
 * Table and region default from the environment, while the dataset defaults to
 * locations. Throws for unknown options, a missing table, or an unsupported type.
 */
function parseArgs(argv) {
  const args = { table: process.env.TABLE_NAME, dryRun: false, region: process.env.AWS_REGION, type: 'locations' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--table') args.table = argv[++i];
    else if (arg.startsWith('--table=')) args.table = arg.slice('--table='.length);
    else if (arg === '--region') args.region = argv[++i];
    else if (arg.startsWith('--region=')) args.region = arg.slice('--region='.length);
    else if (arg === '--type') args.type = argv[++i];
    else if (arg.startsWith('--type=')) args.type = arg.slice('--type='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.table) {
    throw new Error(
      'Target table is required. Pass --table <name> or set TABLE_NAME.\n' +
        'Point this at your own sandbox table, not the shared production stack (AGENTS.md §8.4).'
    );
  }
  if (!['locations', 'schedules', 'graph'].includes(args.type)) {
    throw new Error(`Unknown --type: ${args.type}. Must be 'locations', 'schedules' or 'graph'.`);
  }
  return args;
}

/**
 * The fields the graph seed owns on each item kind. Anything else on a stored item, the
 * closure fields above all, belongs to someone else and is never written by a re-seed.
 * A required field missing from the seed is an error, never a reason to delete it from the
 * table; only an optional field the seed no longer sets is removed.
 */
const GRAPH_SEED_FIELDS = {
  'NODE#': { required: ['node_id', 'floor', 'x', 'y', 'node_type'], optional: ['location_id'] },
  'EDGE#': { required: ['from', 'to', 'edge_type', 'distance'], optional: [] },
};

/** Splits records into bounded concurrent write groups. */
export function chunk(items, size = WRITE_CONCURRENCY) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function createDynamoDBClientOptions(region) {
  return { ...(region ? { region } : {}), maxAttempts: 6 };
}

/**
 * DynamoDB rejects empty strings inside sets and undefined values outright.
 * The seed only ever carries JSON scalars, arrays, and plain objects, so a
 * shallow undefined strip is all that is needed to make every record writable.
 */
export function toItem(record) {
  return JSON.parse(JSON.stringify(record));
}

const SEED_FILES = {
  locations: { file: 'lc3-locations.seed.json', pk: 'location_id' },
  schedules: { file: 'lc3-schedules.seed.csv', pk: 'room_code', sk: 'schedule_slot' },
  graph: { file: 'lc3-graph.seed.json', pk: 'graph_id', sk: 'element_id' },
};

/** Graph nodes and edges, as the single list of items the graph table stores. */
function readGraphItems(seedPath) {
  const { nodes, edges } = JSON.parse(readFileSync(seedPath, 'utf8'));
  return [...(nodes ?? []), ...(edges ?? [])];
}

/**
 * Loads the seed for the requested dataset (locations by default).
 * Returns its records, resolved path, and key attribute names. Throws when
 * the file has no records or a record lacks a key.
 */
export function readSeedRecords(type = 'locations') {
  const { file, pk, sk } = SEED_FILES[type];
  const seedPath = join(HERE, file);
  const keyAttributes = { pk, sk };

  const records = type === 'schedules'
    ? parseCsv(readFileSync(seedPath, 'utf8')).map(normalizeScheduleRecord)
    : type === 'graph'
      ? readGraphItems(seedPath)
      : JSON.parse(readFileSync(seedPath, 'utf8')).records;

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`No records found in ${seedPath}`);
  }
  const missingKey = records.find((r) => !r[keyAttributes.pk]);
  if (missingKey) {
    throw new Error(`Every record needs a ${keyAttributes.pk} (partition key); found one without.`);
  }

  if (type === 'schedules') {
    const missingField = records.find((r) =>
      ['event_code', 'event_name', 'day_of_week', 'start_time', 'end_time', 'event_type']
        .some((field) => !r[field])
    );
    if (missingField) {
      throw new Error('Every schedule record needs all CSV fields populated.');
    }
    const missingSk = records.find((r) => !r.schedule_slot);
    if (missingSk) {
      throw new Error(`Every schedule record needs a schedule_slot (sort key); found one without.`);
    }
  }

  if (type === 'graph') {
    for (const record of records) assertGraphItem(record);
  }

  const seen = new Set();
  for (const r of records) {
    const key = recordKey(r, keyAttributes);
    if (seen.has(key)) throw new Error(`Duplicate DynamoDB key found: ${key}`);
    seen.add(key);
  }

  return { records, seedPath, keyAttributes };
}

function recordKey(record, { pk, sk }) {
  return JSON.stringify(sk ? [record[pk], record[sk]] : [record[pk]]);
}

const isMissing = (value) => value === undefined || value === null || value === '';

/** Returns the item kind's seed-owned fields, or throws if the item cannot be seeded safely. */
function assertGraphItem(record) {
  const fields = GRAPH_SEED_FIELDS[String(record.element_id).slice(0, 5)];
  if (!fields) {
    throw new Error(`Every graph item needs a NODE# or EDGE# element_id (sort key); found "${record.element_id}".`);
  }
  const missing = fields.required.filter((field) => isMissing(record[field]));
  if (missing.length > 0) {
    throw new Error(`Graph item ${record.element_id} is missing ${missing.join(', ')}; refusing to seed it.`);
  }
  return fields;
}

/**
 * UpdateItem input that upserts one graph item: SET every required field and each optional
 * field the record has, REMOVE an optional field it lacks (a location link the seed no longer
 * makes), and leave every other attribute on the stored item untouched.
 */
export function toGraphUpdate(tableName, record) {
  const { required, optional } = assertGraphItem(record);
  const names = {};
  const values = {};
  const set = [];
  const remove = [];
  [...required, ...optional].forEach((field, i) => {
    names[`#f${i}`] = field;
    if (isMissing(record[field])) {
      remove.push(`#f${i}`);
    } else {
      values[`:v${i}`] = record[field];
      set.push(`#f${i} = :v${i}`);
    }
  });
  return {
    TableName: tableName,
    Key: { graph_id: record.graph_id, element_id: record.element_id },
    UpdateExpression: [`SET ${set.join(', ')}`, ...(remove.length > 0 ? [`REMOVE ${remove.join(', ')}`] : [])].join(' '),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

/** Reads all current keys and updatedBy attributes to calculate a dry-run plan. */
export async function readExistingItems(docClient, ScanCommand, tableName, { pk, sk }) {
  const items = [];
  let exclusiveStartKey;

  do {
    const page = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: sk ? '#pk, #sk, #updatedBy' : '#pk, #updatedBy',
        ExpressionAttributeNames: {
          '#pk': pk,
          ...(sk ? { '#sk': sk } : {}),
          '#updatedBy': 'updatedBy',
        },
        ConsistentRead: true,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );

    if (Array.isArray(page.Items)) items.push(...page.Items);
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

/** Counts seed records blocked from replacement by an existing updatedBy field. */
export function planSeedWrites(records, existingItems, keyAttributes) {
  const existingByKey = new Map(
    existingItems.map((item) => [recordKey(item, keyAttributes), item])
  );

  return records.reduce(
    (counts, record) => {
      const existing = existingByKey.get(recordKey(record, keyAttributes));
      if (existing && Object.hasOwn(existing, 'updatedBy')) counts.skipped += 1;
      else counts.written += 1;
      return counts;
    },
    { written: 0, skipped: 0 }
  );
}

/** Counts graph items a seed run would create and update. Closures never block an update. */
export function planGraphWrites(records, existingItems, keyAttributes) {
  const existing = new Set(existingItems.map((item) => recordKey(item, keyAttributes)));
  const updated = records.filter((record) => existing.has(recordKey(record, keyAttributes))).length;
  return { created: records.length - updated, updated };
}

/** Writes each record without replacing any item marked as edited by an admin. */
export async function writeRecords(docClient, PutCommand, tableName, records) {
  const counts = { written: 0, skipped: 0 };

  for (const batch of chunk(records)) {
    const results = await Promise.allSettled(
      batch.map(async (record) => {
        try {
          await docClient.send(
            new PutCommand({
              TableName: tableName,
              Item: toItem(record),
              ConditionExpression: 'attribute_not_exists(updatedBy)',
            })
          );
          return 'written';
        } catch (error) {
          if (error?.name === 'ConditionalCheckFailedException') return 'skipped';
          throw error;
        }
      })
    );

    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      counts[result.value] += 1;
    }
  }

  return counts;
}

/** Upserts every graph item's seed-owned fields, leaving closure fields as staff set them. */
export async function writeGraphRecords(docClient, UpdateCommand, tableName, records) {
  // Built up front so one malformed item stops the run before anything is written.
  const updates = records.map((record) => toGraphUpdate(tableName, record));
  let written = 0;

  for (const batch of chunk(updates)) {
    const results = await Promise.allSettled(
      batch.map((input) => docClient.send(new UpdateCommand(input)))
    );
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      written += 1;
    }
  }

  return { written, skipped: 0 };
}

/**
 * Seeds the dataset selected by the command line. Dry-run performs a read-only scan;
 * write mode conditionally puts each record and propagates non-conflict failures.
 */
async function main() {
  const { table, dryRun, region, type } = parseArgs(process.argv.slice(2));
  const { records, seedPath, keyAttributes } = readSeedRecords(type);
  const batches = chunk(records);

  console.log(`Seed file : ${resolve(seedPath)}`);
  console.log(`Table     : ${table}`);
  console.log(`Records   : ${records.length}`);
  console.log(`Batches   : ${batches.length} (${batches.map((b) => b.length).join('/')})`);
  console.log(`Mode      : ${dryRun ? 'DRY RUN — read-only AWS scan, no writes' : 'WRITE'}`);
  console.log('');

  // Imported lazily so reading the seed remains testable without AWS dependencies.
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, PutCommand, ScanCommand, UpdateCommand } = await import('@aws-sdk/lib-dynamodb');

  const docClient = DynamoDBDocumentClient.from(
    new DynamoDBClient(createDynamoDBClientOptions(region)),
    { marshallOptions: { removeUndefinedValues: true } }
  );

  if (dryRun && type === 'graph') {
    const existingItems = await readExistingItems(docClient, ScanCommand, table, keyAttributes);
    const { created, updated } = planGraphWrites(records, existingItems, keyAttributes);
    console.log(`Dry run complete. ${created} items would be created and ${updated} updated; closure fields are never written.`);
    return;
  }

  if (type === 'graph') {
    const { written } = await writeGraphRecords(docClient, UpdateCommand, table, records);
    console.log(`\nDone. ${written} graph items upserted in "${table}"; closure fields left as staff set them.`);
    return;
  }

  if (dryRun) {
    const existingItems = await readExistingItems(docClient, ScanCommand, table, keyAttributes);
    const counts = planSeedWrites(records, existingItems, keyAttributes);
    console.log(`Dry run complete. ${counts.written} items would be written; ${counts.skipped} admin-edited items would be skipped.`);
    return;
  }

  const counts = await writeRecords(docClient, PutCommand, table, records);
  console.log(
    `\nDone. ${counts.written} items written and ${counts.skipped} admin-edited items skipped in "${table}".`
  );
}

// Only run when invoked directly, so the helpers above stay unit-testable.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`\nSeeding failed: ${error.message}`);
    process.exitCode = 1;
  });
}
