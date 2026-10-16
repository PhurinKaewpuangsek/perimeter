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
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.mjs';

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
  if (args.type !== 'locations' && args.type !== 'schedules') {
    throw new Error(`Unknown --type: ${args.type}. Must be 'locations' or 'schedules'.`);
  }
  return args;
}

/** Splits records into bounded concurrent write groups. */
export function chunk(items, size = WRITE_CONCURRENCY) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * DynamoDB rejects empty strings inside sets and undefined values outright.
 * The seed only ever carries JSON scalars, arrays, and plain objects, so a
 * shallow undefined strip is all that is needed to make every record writable.
 */
export function toItem(record) {
  return JSON.parse(JSON.stringify(record));
}

/**
 * Loads the schedule seed when requested and the location seed otherwise.
 * Returns its records, resolved path, and required partition-key name. Throws when
 * the file has no records or a record lacks that key.
 */
export function readSeedRecords(type = 'locations') {
  const seedPath = type === 'schedules'
    ? join(HERE, 'lc3-schedules.seed.csv')
    : join(HERE, 'lc3-locations.seed.json');
  const pk = type === 'schedules' ? 'room_code' : 'location_id';

  const records = type === 'schedules'
    ? parseCsv(readFileSync(seedPath, 'utf8')).map((record) => {
        if (!record.event_date) delete record.event_date;
        return {
          ...record,
          schedule_slot: `${record.day_of_week}#${record.start_time}#${record.event_code}`,
        };
      })
    : JSON.parse(readFileSync(seedPath, 'utf8')).records;

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`No records found in ${seedPath}`);
  }
  const missingKey = records.find((r) => !r[pk]);
  if (missingKey) {
    throw new Error(`Every record needs a ${pk} (partition key); found one without.`);
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

  const seen = new Set();
  for (const r of records) {
    const key = type === 'schedules' ? `${r[pk]}#${r.schedule_slot}` : r[pk];
    if (seen.has(key)) throw new Error(`Duplicate DynamoDB key found: ${key}`);
    seen.add(key);
  }

  return { records, seedPath, pk };
}

function recordKey(record, pk, sk) {
  return JSON.stringify(sk ? [record[pk], record[sk]] : [record[pk]]);
}

/** Reads all current keys and updatedBy attributes to calculate a dry-run plan. */
export async function readExistingItems(docClient, ScanCommand, tableName, pk, sk) {
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
export function planSeedWrites(records, existingItems, pk, sk) {
  const existingByKey = new Map(
    existingItems.map((item) => [recordKey(item, pk, sk), item])
  );

  return records.reduce(
    (counts, record) => {
      const existing = existingByKey.get(recordKey(record, pk, sk));
      if (existing && Object.hasOwn(existing, 'updatedBy')) counts.skipped += 1;
      else counts.written += 1;
      return counts;
    },
    { written: 0, skipped: 0 }
  );
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

/**
 * Seeds the dataset selected by the command line. Dry-run performs a read-only scan;
 * write mode conditionally puts each record and propagates non-conflict failures.
 */
async function main() {
  const { table, dryRun, region, type } = parseArgs(process.argv.slice(2));
  const { records, seedPath, pk } = readSeedRecords(type);
  const sk = type === 'schedules' ? 'schedule_slot' : undefined;
  const batches = chunk(records);

  console.log(`Seed file : ${resolve(seedPath)}`);
  console.log(`Table     : ${table}`);
  console.log(`Records   : ${records.length}`);
  console.log(`Batches   : ${batches.length} (${batches.map((b) => b.length).join('/')})`);
  console.log(`Mode      : ${dryRun ? 'DRY RUN — read-only AWS scan, no writes' : 'WRITE'}`);
  console.log('');

  // Imported lazily so reading the seed remains testable without AWS dependencies.
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, PutCommand, ScanCommand } = await import('@aws-sdk/lib-dynamodb');

  const docClient = DynamoDBDocumentClient.from(
    new DynamoDBClient(region ? { region } : {}),
    { marshallOptions: { removeUndefinedValues: true } }
  );

  if (dryRun) {
    const existingItems = await readExistingItems(docClient, ScanCommand, table, pk, sk);
    const counts = planSeedWrites(records, existingItems, pk, sk);
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
