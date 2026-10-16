import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(HERE, 'lc3-schedules.seed.csv');
const JSON_PATH = join(HERE, 'lc3-schedules.seed.json');

const records = parseCsv(readFileSync(CSV_PATH, 'utf8')).map((record) => {
  if (!record.event_date) delete record.event_date;

  // Format: partition key = room_code, sort key = schedule_slot
  // schedule_slot = ${day_of_week}#${start_time}#${event_code}
  record.schedule_slot = `${record.day_of_week}#${record.start_time}#${record.event_code}`;

  return record;
});

writeFileSync(JSON_PATH, JSON.stringify({ records }, null, 2));
console.log(`Wrote ${records.length} records to ${JSON_PATH}`);
