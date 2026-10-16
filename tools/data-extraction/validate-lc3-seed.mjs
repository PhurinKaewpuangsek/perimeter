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
  for (const [name, text] of [['seed.csv', seedCsvText], ['node-inventory.csv', inventoryText]]) {
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

test('QR anchors are excluded — they are deep-link targets, not rooms', () => {
  const inventory = parseCsv(inventoryText);
  const qr = inventory.filter((r) => /^QR\d+$/.test(r.source_name));
  assert.equal(qr.length, 8);
  for (const row of qr) {
    assert.equal(row.disposition, 'exclude_out_of_scope');
    assert.equal(row.reason, 'qr_anchor_not_a_room');
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
    const thaiDate = /(\d{1,2}) พ\.ค\. (\d{4})/.exec(event_name);
    assert.ok(
      thaiDate,
      `lc3-schedules.seed.csv row ${i + 2}: exam event_name does not include its source date`
    );
    const sourceDate = `${Number(thaiDate[2]) - 543}-05-${thaiDate[1].padStart(2, '0')}`;
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
