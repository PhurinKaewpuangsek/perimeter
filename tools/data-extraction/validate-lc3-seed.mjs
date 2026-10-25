/**
 * Validates the LC3 seed dataset against its provenance manifest and the invariants that
 * make the coordinates trustworthy.
 *
 *   node --test tools/data-extraction/validate-lc3-seed.mjs
 *
 * Uses node:test and node:assert from the Node 24 stdlib. No npm dependency, because
 * AGENTS.md §8.3 forbids installing at the repo root and no service owns this data.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildGraphSeed, STAIRS_DISTANCE } from './lc3/routing-graph.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATASET_DIR = join(REPO_ROOT, 'tools', 'data-extraction', 'lc3');

const read = (...p) => readFileSync(join(DATASET_DIR, ...p), 'utf8');
const readJson = (...p) => JSON.parse(read(...p));

const manifest = readJson('source', 'source-manifest.json');
const seed = readJson('lc3-locations.seed.json');
const seedCsvText = read('lc3-locations.seed.csv');
const inventoryText = read('reports', 'node-inventory.csv');

const floorsById = new Map(seed.floors.map((f) => [f.map_asset_id, f]));
const byId = new Map(seed.records.map((r) => [r.location_id, r]));

/** Minimal RFC 4180 reader. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

const seedCsv = parseCsv(seedCsvText);

/* --------------------------------------------------------------------- provenance ----- */

test('assets and source graph match the hashes recorded in the manifest', () => {
  const sha = (p) => createHash('sha256').update(readFileSync(join(REPO_ROOT, p))).digest('hex');
  assert.equal(sha(manifest.graph.dest_path), manifest.graph.sha256, 'graph.source.json drifted');
  for (const asset of manifest.assets) {
    assert.equal(sha(asset.dest_path), asset.sha256, `${asset.dest_path} drifted`);
  }
});

test('each asset declares the viewBox the manifest and seed rely on', () => {
  for (const asset of manifest.assets) {
    const head = readFileSync(join(REPO_ROOT, asset.dest_path), 'utf8').slice(0, 400);
    assert.equal(/viewBox="([^"]+)"/.exec(head)?.[1], asset.viewbox.join(' '), asset.dest_path);
  }
});

test('assets are LF, because the manifest hashes are of the upstream LF blob', () => {
  for (const asset of manifest.assets) {
    const bytes = readFileSync(join(REPO_ROOT, asset.dest_path));
    assert.equal(bytes.includes('\r\n'), false, `${asset.dest_path} contains CRLF`);
  }
});

/* --------------------------------------------------------------------- invariants ----- */

test('the dataset holds exactly the 131 records the seeder ships to DynamoDB', () => {
  assert.equal(seed.records.length, 131, 'record count changed — update the seeder and API expectations');
  assert.equal(seed.counts.records, seed.records.length, 'counts.records disagrees with records[]');
  assert.equal(seed.records.filter((r) => !r.location_id).length, 0, 'record without a partition key');
});

test('identifiers are unique', () => {
  assert.equal(byId.size, seed.records.length, 'duplicate location_id');
  const rooms = seed.records.filter((r) => r.location_kind === 'room');
  assert.equal(new Set(rooms.map((r) => r.room_code)).size, rooms.length, 'duplicate room_code');
  assert.equal(new Set(seed.records.map((r) => r.source.node_id)).size, seed.records.length, 'duplicate source node');
});

test('aliases do not collide across different locations', () => {
  const owner = new Map();
  for (const r of seed.records) {
    for (const alias of r.aliases) {
      const previous = owner.get(alias);
      assert.equal(previous, undefined, `alias "${alias}" claimed by both ${previous} and ${r.location_id}`);
      owner.set(alias, r.location_id);
    }
  }
});

test('every room carries canonical and source search forms', () => {
  for (const r of seed.records.filter((x) => x.location_kind === 'room')) {
    const roomNumber = r.room_code.slice('LC3-'.length);
    for (const alias of [r.room_code, `LC3_${roomNumber}`, roomNumber]) {
      assert.ok(r.aliases.includes(alias), `${r.location_id} has no "${alias}" alias`);
    }
  }
});

test('coordinates equal source plus the floor transform, and land inside the viewBox', () => {
  for (const r of seed.records) {
    const floor = floorsById.get(r.map_asset_id);
    assert.ok(floor, `${r.location_id} references unknown asset ${r.map_asset_id}`);
    assert.equal(floor.floor, r.floor, `${r.location_id} asset/floor mismatch`);
    const { translate_x: dx, translate_y: dy } = floor.coordinate_transform;
    assert.equal(r.source.translation.dx, dx, `${r.location_id} records a stale dx`);
    assert.equal(r.source.translation.dy, dy, `${r.location_id} records a stale dy`);
    assert.equal(r.x, r.source.x + dx, `${r.location_id} x is not source.x + dx`);
    assert.equal(r.y, r.source.y + dy, `${r.location_id} y is not source.y + dy`);
    const [, , w, h] = floor.viewbox;
    assert.ok(r.x >= 0 && r.x <= w, `${r.location_id} x=${r.x} outside 0..${w}`);
    assert.ok(r.y >= 0 && r.y <= h, `${r.location_id} y=${r.y} outside 0..${h}`);
  }
});

test('no two locations on a floor share a pin position', () => {
  const seen = new Map();
  for (const r of seed.records) {
    const key = `${r.floor}:${r.x},${r.y}`;
    assert.equal(seen.get(key), undefined, `${r.location_id} and ${seen.get(key)} share ${key}`);
    seen.set(key, r.location_id);
  }
});

test('every landmark reference resolves to a real location on the same floor', () => {
  for (const r of seed.records) {
    for (const l of r.landmarks) {
      const target = byId.get(l.ref_location_id);
      assert.ok(target, `${r.location_id} references missing landmark ${l.ref_location_id}`);
      assert.equal(target.floor, r.floor, `${r.location_id} references a landmark on another floor`);
      assert.notEqual(target.location_id, r.location_id, `${r.location_id} is its own landmark`);
    }
  }
});

/* ------------------------------------------------------------------- truthfulness ----- */

test('nothing claims field verification without survey evidence', () => {
  // The whole point of the verification block: "field_verified" must mean somebody checked.
  const survey = parseCsv(read('survey', 'lc3-field-survey.template.csv'));
  const evidenced = new Set(survey.filter((s) => s.evidence_ref.trim()).map((s) => s.source_node_id));
  for (const r of seed.records) {
    for (const [field, status] of Object.entries(r.verification)) {
      if (status !== 'field_verified') continue;
      assert.ok(evidenced.has(r.source.node_id), `${r.location_id}.${field} claims field_verified with no survey evidence_ref`);
    }
  }
});

test('detail_th never asserts an unverified landmark', () => {
  for (const r of seed.records) {
    if (r.verification.landmarks === 'field_verified') continue;
    assert.ok(!r.detail_th.includes('ใกล้'), `${r.location_id} detail_th asserts proximity that nobody verified`);
  }
});

test('no placeholder text survived into the dataset', () => {
  const banned = /\b(TBD|TODO|FIXME|unknown|XXX|N\/A)\b/i;
  for (const r of seed.records) {
    for (const field of ['name_th', 'detail_th', 'room_code']) {
      assert.ok(!banned.test(r[field]), `${r.location_id}.${field} contains placeholder text: ${r[field]}`);
    }
  }
});

test('unnamed rooms are flagged rather than silently given a name', () => {
  for (const r of seed.records) {
    const unnamed = r.name_th === '';
    assert.equal(
      unnamed,
      r.flags.includes('needs_field_validation'),
      `${r.location_id}: empty name and needs_field_validation flag disagree`
    );
    if (unnamed) {
      assert.equal(r.category, 'unknown');
      assert.equal(r.verification.name_th, 'pending_survey');
    }
  }
});

test('no labelled room fell through the category rules', () => {
  for (const r of seed.records) {
    if (r.name_th && r.location_kind === 'room') {
      assert.notEqual(r.category, 'unknown', `${r.location_id} has a name but no category`);
    }
  }
});

/* ------------------------------------------------------------- JSON / CSV agreement ---- */

test('CSV and JSON describe exactly the same records', () => {
  assert.equal(seedCsv.length, seed.records.length, 'row count differs');
  for (const row of seedCsv) {
    const r = byId.get(row.location_id);
    assert.ok(r, `CSV row ${row.location_id} is not in the JSON`);
    assert.equal(row.room_code, r.room_code);
    assert.equal(Number(row.floor), r.floor);
    assert.equal(Number(row.x), r.x);
    assert.equal(Number(row.y), r.y);
    assert.equal(row.name_th, r.name_th);
    assert.equal(row.category, r.category);
    assert.equal(row.detail_th, r.detail_th);
    assert.equal(row.aliases, r.aliases.join('|'));
    assert.equal(row.landmarks, r.landmarks.map((l) => `${l.kind}:${l.ref_location_id}:${l.walk_hops}`).join('|'));
  }
});

test('no field value contains the pipe used as the CSV multi-value separator', () => {
  for (const r of seed.records) {
    for (const value of [r.name_th, r.detail_th, r.room_code, ...r.aliases]) {
      assert.ok(!String(value).includes('|'), `${r.location_id} contains a literal pipe: ${value}`);
    }
  }
});

test('generated files are LF and end with exactly one newline', () => {
  const generated = [
    ['seed.csv', seedCsvText],
    ['node-inventory.csv', inventoryText],
    ['lc3-graph.seed.json', read('lc3-graph.seed.json')],
  ];
  for (const [name, text] of generated) {
    assert.ok(!text.includes('\r'), `${name} contains CR`);
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), `${name} newline ending`);
  }
});

/* ------------------------------------------------------------------------ coverage ---- */

test('every source node is accounted for exactly once', () => {
  const inventory = parseCsv(inventoryText);
  assert.equal(inventory.length, manifest.graph.node_count, 'inventory does not cover all source nodes');
  assert.equal(new Set(inventory.map((r) => r.source_node_id)).size, inventory.length, 'duplicate node in inventory');
  for (const row of inventory) {
    assert.ok(row.disposition, `${row.source_node_id} has no disposition`);
    if (row.disposition !== 'include') {
      assert.ok(row.reason, `${row.source_node_id} excluded with no reason`);
    }
  }
  const included = inventory.filter((r) => r.disposition === 'include');
  assert.equal(included.length, seed.records.length, 'inventory includes differ from seed records');
});

test('QR anchors stay out of the location seed — they are deep-link targets, not rooms', () => {
  const inventory = parseCsv(inventoryText);
  const qr = inventory.filter((r) => /^QR\d+$/.test(r.source_name));
  assert.equal(qr.length, 8);
  for (const row of qr) {
    assert.equal(row.disposition, 'include_graph');
    assert.equal(row.reason, 'qr_anchor_not_a_room');
  }
});

test('junctions and doorways are routing-graph nodes, not locations', () => {
  const inventory = parseCsv(inventoryText);
  const topology = inventory.filter((r) => r.node_type === 'junction' || r.node_type === 'entrance');
  assert.equal(topology.length, 149);
  for (const row of topology) {
    assert.equal(row.disposition, 'include_graph', `${row.source_node_id} disposition`);
    assert.equal(row.reason, 'routing_topology_not_a_location', `${row.source_node_id} reason`);
  }
});

test('no routing topology leaked into the seed', () => {
  for (const r of seed.records) {
    assert.ok(['room', 'facility', 'stairs'].includes(r.source.node_type), `${r.location_id} came from a ${r.source.node_type} node`);
  }
  assert.ok(!('edges' in seed), 'seed document carries edges');
});

/* ================================================================ schedule seed ===== */
/*
 * The tests below validate tools/data-extraction/lc3/lc3-schedules.seed.csv.
 *
 * Key invariant (acceptance criterion from Issue #47):
 *   Every row's room_code MUST resolve to a known location_id in the locations seed.
 *   If any row cannot be resolved the script exits non-zero immediately — no silent skip.
 *
 * The suite is skipped gracefully when the CSV contains only the header row
 * (i.e. no data has been keyed yet) so the existing CI remains green while
 * the field team is still entering data from the survey photos.
 */

const ALLOWED_DAYS = new Set(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
const ALLOWED_EVENT_TYPES = new Set(['class', 'exam', 'activity']);
const TIME_RE = /^\d{2}:\d{2}$/;
const EVENT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCHEDULE_REQUIRED_FIELDS = ['event_code', 'event_name', 'room_code', 'day_of_week', 'start_time', 'end_time', 'event_type'];
const THAI_MONTH_NUMBERS = new Map([
  ['ม.ค.', 1], ['มกราคม', 1],
  ['ก.พ.', 2], ['กุมภาพันธ์', 2],
  ['มี.ค.', 3], ['มีนาคม', 3],
  ['เม.ย.', 4], ['เมษายน', 4],
  ['พ.ค.', 5], ['พฤษภาคม', 5],
  ['มิ.ย.', 6], ['มิถุนายน', 6],
  ['ก.ค.', 7], ['กรกฎาคม', 7],
  ['ส.ค.', 8], ['สิงหาคม', 8],
  ['ก.ย.', 9], ['กันยายน', 9],
  ['ต.ค.', 10], ['ตุลาคม', 10],
  ['พ.ย.', 11], ['พฤศจิกายน', 11],
  ['ธ.ค.', 12], ['ธันวาคม', 12],
]);
const THAI_DATE_RE = /(\d{1,2})\s+(ม\.ค\.|มกราคม|ก\.พ\.|กุมภาพันธ์|มี\.ค\.|มีนาคม|เม\.ย\.|เมษายน|พ\.ค\.|พฤษภาคม|มิ\.ย\.|มิถุนายน|ก\.ค\.|กรกฎาคม|ส\.ค\.|สิงหาคม|ก\.ย\.|กันยายน|ต\.ค\.|ตุลาคม|พ\.ย\.|พฤศจิกายน|ธ\.ค\.|ธันวาคม)\s+(\d{4})/u;

export function parseThaiDateFromEventName(eventName) {
  const match = THAI_DATE_RE.exec(eventName);
  if (!match) return null;
  const [, day, thaiMonth, buddhistYear] = match;
  const month = THAI_MONTH_NUMBERS.get(thaiMonth);
  if (!month) return null;
  return `${Number(buddhistYear) - 543}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Build room_code → location_id lookup from the locations seed (rooms only).
const roomCodeToLocationId = new Map(
  seed.records
    .filter((r) => r.location_kind === 'room' && r.room_code)
    .map((r) => [r.room_code, r.location_id])
);

/**
 * Resolves a canonical room_code (e.g. "LC3-101/1", "LC3-103") to its
 * corresponding location_id (e.g. "LC3-F1-R101-1", "LC3-F1-R103") in the locations seed.
 *
 * If the room_code cannot be resolved, throws an AssertionError (fail-fast, NO silent skip).
 */
export function resolveRoomCodeToLocationId(roomCode, lookupMap = roomCodeToLocationId) {
  assert.ok(
    typeof roomCode === 'string' && roomCode.trim() !== '',
    'room_code must be a non-empty string'
  );
  const locationId = lookupMap.get(roomCode);
  assert.ok(
    locationId !== undefined,
    `room_code "${roomCode}" cannot be resolved to any location_id in lc3-locations.seed.json — check for typos or add the room to the locations seed first`
  );
  return locationId;
}

test('resolveRoomCodeToLocationId resolves valid canonical room codes to location_id', () => {
  assert.equal(resolveRoomCodeToLocationId('LC3-101/1'), 'LC3-F1-R101-1');
  assert.equal(resolveRoomCodeToLocationId('LC3-103'), 'LC3-F1-R103');
  assert.equal(resolveRoomCodeToLocationId('LC3-118/1'), 'LC3-F1-R118-1');
  assert.equal(resolveRoomCodeToLocationId('LC3-122'), 'LC3-F1-R122');
});

test('resolveRoomCodeToLocationId throws on unknown room codes (NO silent skip)', () => {
  assert.throws(
    () => resolveRoomCodeToLocationId('LC3-999'),
    /room_code "LC3-999" cannot be resolved to any location_id/
  );
  assert.throws(
    () => resolveRoomCodeToLocationId(''),
    /room_code must be a non-empty string/
  );
});

let scheduleRows;
try {
  const scheduleCsvText = read('lc3-schedules.seed.csv');
  scheduleRows = parseCsv(scheduleCsvText);
} catch {
  // File is missing entirely — not an error at this stage; skip schedule tests.
  scheduleRows = null;
}

const scheduleDataExists = scheduleRows !== null && scheduleRows.length > 0;

test('schedule seed — CSV exists and has the required header columns', () => {
  if (scheduleRows === null) return; // File doesn't exist yet; nothing to check.
  const rawText = read('lc3-schedules.seed.csv');
  const headerLine = rawText.split('\n')[0].replace(/\r/, '');
  const actualHeaders = headerLine.split(',');
  for (const field of [...SCHEDULE_REQUIRED_FIELDS, 'event_date']) {
    assert.ok(actualHeaders.includes(field), `lc3-schedules.seed.csv is missing required column: "${field}"`);
  }
});

test('schedule seed — every row has all required fields non-empty', () => {
  if (!scheduleDataExists) return; // No data rows yet — skip.
  for (let i = 0; i < scheduleRows.length; i += 1) {
    const row = scheduleRows[i];
    for (const field of SCHEDULE_REQUIRED_FIELDS) {
      assert.ok(
        row[field] !== undefined && row[field].trim() !== '',
        `lc3-schedules.seed.csv row ${i + 2}: field "${field}" is empty`
      );
    }
  }
});

test('schedule seed — day_of_week values are valid', () => {
  if (!scheduleDataExists) return;
  for (let i = 0; i < scheduleRows.length; i += 1) {
    const { day_of_week } = scheduleRows[i];
    assert.ok(
      ALLOWED_DAYS.has(day_of_week),
      `lc3-schedules.seed.csv row ${i + 2}: invalid day_of_week "${day_of_week}" — must be one of ${[...ALLOWED_DAYS].join(', ')}`
    );
  }
});

test('schedule seed — exams have valid event_date values matching day_of_week', () => {
  if (!scheduleDataExists) return;
  const weekdayByDate = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  for (let i = 0; i < scheduleRows.length; i += 1) {
    const { day_of_week, event_date, event_name, event_type } = scheduleRows[i];
    if (event_type !== 'exam') continue;

    assert.ok(
      EVENT_DATE_RE.test(event_date),
      `lc3-schedules.seed.csv row ${i + 2}: exam event_date "${event_date}" must be YYYY-MM-DD`
    );

    const [year, month, day] = event_date.split('-').map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    assert.equal(
      parsedDate.toISOString().slice(0, 10),
      event_date,
      `lc3-schedules.seed.csv row ${i + 2}: exam event_date "${event_date}" is not a real date`
    );
    const sourceDate = parseThaiDateFromEventName(event_name);
    assert.ok(
      sourceDate,
      `lc3-schedules.seed.csv row ${i + 2}: exam event_name does not include its source date`
    );
    assert.equal(
      event_date,
      sourceDate,
      `lc3-schedules.seed.csv row ${i + 2}: event_date does not match the Thai date in event_name`
    );
    assert.equal(
      weekdayByDate[parsedDate.getUTCDay()],
      day_of_week,
      `lc3-schedules.seed.csv row ${i + 2}: ${event_date} is ${weekdayByDate[parsedDate.getUTCDay()]}, not ${day_of_week}`
    );
  }
});

test('Thai exam dates are parsed for every month and supported month-name form', () => {
  const abbreviations = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ];
  const fullNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];

  for (let month = 1; month <= 12; month += 1) {
    const expected = `2026-${String(month).padStart(2, '0')}-08`;
    assert.equal(parseThaiDateFromEventName(`Exam (8 ${abbreviations[month - 1]} 2569)`), expected);
    assert.equal(parseThaiDateFromEventName(`Exam (8 ${fullNames[month - 1]} 2569)`), expected);
  }
  assert.equal(parseThaiDateFromEventName('Exam date not announced'), null);
});

test('schedule seed — start_time and end_time are in HH:MM format and end > start', () => {
  if (!scheduleDataExists) return;
  for (let i = 0; i < scheduleRows.length; i += 1) {
    const { start_time, end_time } = scheduleRows[i];
    assert.ok(TIME_RE.test(start_time), `lc3-schedules.seed.csv row ${i + 2}: start_time "${start_time}" is not HH:MM`);
    assert.ok(TIME_RE.test(end_time), `lc3-schedules.seed.csv row ${i + 2}: end_time "${end_time}" is not HH:MM`);
    assert.ok(
      end_time > start_time,
      `lc3-schedules.seed.csv row ${i + 2}: end_time "${end_time}" is not after start_time "${start_time}"`
    );
  }
});

test('schedule seed — event_type values are valid', () => {
  if (!scheduleDataExists) return;
  for (let i = 0; i < scheduleRows.length; i += 1) {
    const { event_type } = scheduleRows[i];
    assert.ok(
      ALLOWED_EVENT_TYPES.has(event_type),
      `lc3-schedules.seed.csv row ${i + 2}: invalid event_type "${event_type}" — must be one of ${[...ALLOWED_EVENT_TYPES].join(', ')}`
    );
  }
});

test('schedule seed — every room_code resolves to a known location_id (NO silent skip)', () => {
  if (!scheduleDataExists) return;
  // KEY acceptance criterion from Issue #47:
  // Any unresolvable room_code is an immediate hard failure — no silent skip allowed.
  for (let i = 0; i < scheduleRows.length; i += 1) {
    const { room_code } = scheduleRows[i];
    const locationId = resolveRoomCodeToLocationId(room_code);
    assert.ok(
      locationId !== undefined,
      `lc3-schedules.seed.csv row ${i + 2}: room_code "${room_code}" cannot be resolved to any location_id in lc3-locations.seed.json — check for typos or add the room to the locations seed first`
    );
  }
});

test('schedule seed — no two rows share the same room + day + start_time (no duplicate slots)', () => {
  if (!scheduleDataExists) return;
  const seenClass = new Map();
  const seenExam = new Map();
  for (let i = 0; i < scheduleRows.length; i += 1) {
    const { room_code, day_of_week, start_time, event_type, event_code } = scheduleRows[i];
    if (event_type === 'class') {
      const key = `${room_code}|${day_of_week}|${start_time}`;
      assert.ok(
        !seenClass.has(key),
        `lc3-schedules.seed.csv row ${i + 2}: duplicate class slot — room "${room_code}" on ${day_of_week} at ${start_time} already claimed by row ${seenClass.get(key)}`
      );
      seenClass.set(key, i + 2);
    } else if (event_type === 'exam') {
      const key = `${room_code}|${day_of_week}|${start_time}|${event_code}`;
      assert.ok(
        !seenExam.has(key),
        `lc3-schedules.seed.csv row ${i + 2}: duplicate exam slot — course "${event_code}" in room "${room_code}" on ${day_of_week} at ${start_time} already claimed by row ${seenExam.get(key)}`
      );
      seenExam.set(key, i + 2);
    }
  }
});

test('schedule seed — generated DynamoDB room_code + schedule_slot keys are unique', () => {
  if (!scheduleDataExists) return;
  const seen = new Map();
  for (let i = 0; i < scheduleRows.length; i += 1) {
    const row = scheduleRows[i];
    const scheduleSlot = `${row.day_of_week}#${row.start_time}#${row.event_code}`;
    const key = `${row.room_code}#${scheduleSlot}`;
    assert.ok(
      !seen.has(key),
      `lc3-schedules.seed.csv row ${i + 2}: duplicate DynamoDB key "${key}" already used by row ${seen.get(key)}`
    );
    seen.set(key, i + 2);
  }
});

/* ================================================================= routing graph ===== */
/*
 * The tests below validate tools/data-extraction/lc3/lc3-graph.seed.json (issue #143).
 * Its nodes and edges are written to SmartFacultyGraph as they stand, so these are the
 * guarantees the route API (#144) and the closure editor (#147) build on.
 */

const sourceGraph = JSON.parse(readFileSync(join(REPO_ROOT, manifest.graph.dest_path), 'utf8'));
const graphSeedText = read('lc3-graph.seed.json');
const graphSeed = JSON.parse(graphSeedText);
const graphNodes = new Map(graphSeed.nodes.map((n) => [n.node_id, n]));
const floorOf = (nodeId) => graphNodes.get(nodeId)?.floor;

function adjacency(nodeIds, edges, weight = () => 1) {
  const adj = new Map(nodeIds.map((id) => [id, []]));
  for (const e of edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue;
    adj.get(e.from).push([e.to, weight(e)]);
    adj.get(e.to).push([e.from, weight(e)]);
  }
  return adj;
}

/** Groups of node ids that can reach each other over `edges`, largest first. */
function components(nodeIds, edges) {
  const adj = adjacency(nodeIds, edges);
  const seen = new Set();
  const groups = [];
  for (const start of nodeIds) {
    if (seen.has(start)) continue;
    const group = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const id = stack.pop();
      group.push(id);
      for (const [next] of adj.get(id)) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}

/** Shortest walking distance from `start` to every node it can reach. */
function shortestDistances(start, nodeIds, edges) {
  const adj = adjacency(nodeIds, edges, (e) => e.distance);
  const dist = new Map([[start, 0]]);
  const done = new Set();
  for (;;) {
    let current = null;
    for (const [id, d] of dist) {
      if (!done.has(id) && (current === null || d < dist.get(current))) current = id;
    }
    if (current === null) return dist;
    done.add(current);
    for (const [next, w] of adj.get(current)) {
      const candidate = dist.get(current) + w;
      if (candidate < (dist.get(next) ?? Infinity)) dist.set(next, candidate);
    }
  }
}

const describeGroups = (groups) =>
  groups
    .slice(1)
    .map((g) => `[${g.length} nodes: ${g.slice(0, 5).join(', ')}${g.length > 5 ? ', ...' : ''}]`)
    .join(' ');

test('graph seed is exactly what the extractor builds from the source graph', () => {
  const rebuilt = buildGraphSeed({ graph: sourceGraph, manifest, locationRecords: seed.records });
  assert.equal(
    graphSeedText,
    JSON.stringify(rebuilt, null, 2) + '\n',
    'lc3-graph.seed.json is stale — run: node tools/data-extraction/extract-lc3.mjs'
  );
});

test('graph holds every source node and edge exactly once, keyed as SmartFacultyGraph expects', () => {
  assert.equal(graphSeed.nodes.length, manifest.graph.node_count, 'node count');
  assert.equal(graphSeed.edges.length, manifest.graph.edge_count, 'edge count');
  assert.equal(graphSeed.counts.items, graphSeed.nodes.length + graphSeed.edges.length, 'counts.items');
  const keys = new Set();
  for (const n of graphSeed.nodes) {
    assert.equal(n.graph_id, 'LC3');
    assert.equal(n.element_id, `NODE#${n.node_id}`);
    keys.add(n.element_id);
  }
  for (const e of graphSeed.edges) {
    assert.equal(e.graph_id, 'LC3');
    assert.equal(e.element_id, `EDGE#${e.from}|${e.to}`);
    keys.add(e.element_id);
  }
  assert.equal(keys.size, graphSeed.counts.items, 'duplicate element_id');
  // The graph is undirected: A|B and B|A would be one walkway under two keys, and closing one
  // would leave the other open for routing.
  const pairs = new Map();
  for (const e of graphSeed.edges) {
    const pair = [e.from, e.to].sort().join('|');
    assert.equal(pairs.get(pair), undefined, `${e.element_id} duplicates ${pairs.get(pair)} in the other direction`);
    pairs.set(pair, e.element_id);
  }
  assert.deepEqual(
    [...graphNodes.keys()].sort(),
    sourceGraph.nodes.map((n) => n.id).sort(),
    'graph nodes differ from source nodes'
  );
});

test('every edge references nodes that exist', () => {
  for (const e of graphSeed.edges) {
    assert.ok(graphNodes.has(e.from), `${e.element_id} starts at missing node ${e.from}`);
    assert.ok(graphNodes.has(e.to), `${e.element_id} ends at missing node ${e.to}`);
    assert.notEqual(e.from, e.to, `${e.element_id} is a self-loop`);
  }
});

test('each floor is one connected walkway network, and the stairs join the floors', () => {
  for (const floor of new Set(graphSeed.nodes.map((n) => n.floor))) {
    const ids = graphSeed.nodes.filter((n) => n.floor === floor).map((n) => n.node_id);
    const sameFloor = graphSeed.edges.filter((e) => floorOf(e.from) === floor && floorOf(e.to) === floor);
    const groups = components(ids, sameFloor);
    assert.equal(groups.length, 1, `floor ${floor} splits into ${groups.length} groups; cut off: ${describeGroups(groups)}`);
  }
  const whole = components([...graphNodes.keys()], graphSeed.edges);
  assert.equal(whole.length, 1, `the building splits into ${whole.length} groups; cut off: ${describeGroups(whole)}`);
});

test('every test room can be walked to from the building entrance', () => {
  // The rooms the schedule seed puts classes and exams in, plus LC3-103 for an empty CSV.
  const testRooms = new Set(['LC3-103', ...(scheduleRows ?? []).map((r) => r.room_code)]);
  assert.ok(graphSeed.building_entrances.length > 0, 'no building entrance declared');
  for (const entrance of graphSeed.building_entrances) {
    const node = graphNodes.get(entrance.node_id);
    assert.ok(node, `building entrance ${entrance.node_id} is not a graph node`);
    assert.equal(node.floor, entrance.floor, `building entrance ${entrance.node_id} floor`);
    const reachable = shortestDistances(entrance.node_id, [...graphNodes.keys()], graphSeed.edges);
    for (const roomCode of testRooms) {
      const locationId = resolveRoomCodeToLocationId(roomCode);
      const roomNodes = graphSeed.nodes.filter((n) => n.location_id === locationId);
      assert.equal(roomNodes.length, 1, `${roomCode} (${locationId}) has ${roomNodes.length} graph nodes`);
      assert.ok(reachable.has(roomNodes[0].node_id), `${roomCode} cannot be reached from ${entrance.node_id}`);
    }
  }
});

test('graph node coordinates equal source plus the floor transform, and land inside the viewBox', () => {
  const assetsByFloor = new Map(manifest.assets.map((a) => [a.floor, a]));
  for (const source of sourceGraph.nodes) {
    const n = graphNodes.get(source.id);
    const asset = assetsByFloor.get(n.floor);
    assert.equal(n.floor, source.floor, `${n.node_id} floor`);
    assert.equal(n.x, source.x + asset.coordinate_transform.translate_x, `${n.node_id} x`);
    assert.equal(n.y, source.y + asset.coordinate_transform.translate_y, `${n.node_id} y`);
    const [, , w, h] = asset.viewbox;
    assert.ok(n.x >= 0 && n.x <= w, `${n.node_id} x=${n.x} outside 0..${w}`);
    assert.ok(n.y >= 0 && n.y <= h, `${n.node_id} y=${n.y} outside 0..${h}`);
  }
});

test('location_id links point at the location built from the same node; only QR anchors go without', () => {
  for (const n of graphSeed.nodes.filter((x) => x.location_id)) {
    const location = byId.get(n.location_id);
    assert.ok(location, `${n.node_id} links missing location ${n.location_id}`);
    assert.equal(location.source.node_id, n.node_id, `${n.node_id} links a location built from another node`);
  }
  assert.equal(graphSeed.counts.nodes_with_location_id, seed.records.length, 'a location has no graph node');
  const unmatched = graphSeed.nodes
    .filter((n) => ['room', 'facility'].includes(n.node_type) && !n.location_id)
    .map((n) => n.node_id);
  assert.deepEqual(unmatched, graphSeed.unmatched_room_or_facility_nodes);
  for (const id of unmatched) assert.match(id, /^LC3_QR\d+$/, `${id} is a room or facility with no location`);
});

test('edge types are known, and an edge is stairs exactly when it changes floor', () => {
  for (const e of graphSeed.edges) {
    assert.ok(['walk', 'up', 'stairs'].includes(e.edge_type), `${e.element_id} has unknown edge_type ${e.edge_type}`);
    const crossesFloors = floorOf(e.from) !== floorOf(e.to);
    assert.equal(e.edge_type === 'stairs', crossesFloors, `${e.element_id} is ${e.edge_type} but crossesFloors=${crossesFloors}`);
  }
});

test('edge distances follow the documented rule', () => {
  for (const e of graphSeed.edges) {
    const a = graphNodes.get(e.from);
    const b = graphNodes.get(e.to);
    assert.ok(Number.isFinite(e.distance) && e.distance > 0, `${e.element_id} distance ${e.distance}`);
    if (a.floor === b.floor) {
      assert.equal(e.distance, Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 100) / 100, `${e.element_id} length`);
    } else {
      assert.equal(e.distance, STAIRS_DISTANCE * Math.abs(a.floor - b.floor), `${e.element_id} stairs cost`);
    }
  }
});

test('the stairs cost keeps a same-floor route on its own floor', () => {
  // Floor plans use different coordinate frames, so a cheap floor change could look like a
  // shortcut. Every same-floor shortest path must be no longer than its floor-only twin.
  const ids = [...graphNodes.keys()];
  const sameFloorEdges = graphSeed.edges.filter((e) => floorOf(e.from) === floorOf(e.to));
  for (const start of ids) {
    const anyRoute = shortestDistances(start, ids, graphSeed.edges);
    const floorOnly = shortestDistances(start, ids, sameFloorEdges);
    for (const [target, d] of floorOnly) {
      assert.ok(anyRoute.get(target) >= d - 1e-9, `${start} -> ${target} is shorter via another floor`);
    }
  }
});

test('the seed carries no closure fields — staff own those (#147)', () => {
  for (const item of [...graphSeed.nodes, ...graphSeed.edges]) {
    const closure = Object.keys(item).filter((k) => k.startsWith('closed'));
    assert.deepEqual(closure, [], `${item.element_id} seeds ${closure.join(', ')}`);
  }
});
