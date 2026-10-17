import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeScheduleRecord, parseCsv } from './csv.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(HERE, 'lc3-schedules.seed.csv');
const JSON_PATH = join(HERE, 'lc3-schedules.seed.json');

const records = parseCsv(readFileSync(CSV_PATH, 'utf8')).map(normalizeScheduleRecord);

writeFileSync(JSON_PATH, JSON.stringify({ records }, null, 2));
console.log(`Wrote ${records.length} records to ${JSON_PATH}`);
