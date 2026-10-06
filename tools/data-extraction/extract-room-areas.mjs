/**
 * Lifts the LC3 room-area rectangles out of the floor-plan SVGs.
 *
 *   node tools/data-extraction/extract-room-areas.mjs
 *
 * Every <rect> painted in one of the four Figma "room" colours is matched to the seed
 * record whose (x, y) falls inside it, and the winning geometry is written to
 * frontend/src/components/map/roomAreaGeometry.ts. strip-baked-room-labels.mjs uses those
 * areas to tell which room a baked room number belongs to.
 *
 * Read-only on the artwork: the SVGs keep their own colours and legend, so running this
 * never changes an asset hash in source-manifest.json.
 */

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEED_PATH = join(REPO_ROOT, 'tools', 'data-extraction', 'lc3', 'lc3-locations.seed.json');
const OUT_PATH = join(REPO_ROOT, 'frontend', 'src', 'components', 'map', 'roomAreaGeometry.ts');

/**
 * The fills used for room interiors. #B3FCFF / #BAE6FD (river) and #A29393
 * (courtyard / void) are deliberately excluded — they are structure, not rooms.
 */
const ROOM_FILLS = [
  '#EDE9FE', '#FAE8FF', '#CCFBF1', '#D1FAE5', '#ECFCCB', '#FEF3C7',
  '#F5CAAB', '#BFD8EB', '#CBE6D8', '#F0E3EB'
];

const FLOORS = [
  { floor: 1, path: join(REPO_ROOT, 'frontend', 'public', 'maps', 'lc3', 'floor-1.svg') },
  { floor: 2, path: join(REPO_ROOT, 'frontend', 'public', 'maps', 'lc3', 'floor-2.svg') },
];

const attr = (tag, name) => {
  const m = tag.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : null;
};

/** Collapses a rotated rect to its axis-aligned bounding box. */
function boundingBox(tag) {
  let x = Number(attr(tag, 'x') ?? 0);
  let y = Number(attr(tag, 'y') ?? 0);
  let width = Number(attr(tag, 'width'));
  let height = Number(attr(tag, 'height'));

  const transform = attr(tag, 'transform');
  if (transform) {
    const rotate = transform.match(/rotate\((-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\)/);
    assert.ok(rotate, 'unsupported transform on a room rect: ' + transform);
    const angle = Number(rotate[1]);
    const cx = Number(rotate[2]);
    const cy = Number(rotate[3]);
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height],
    ].map(([px, py]) => {
      const dx = px - cx;
      const dy = py - cy;
      return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
    });
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    x = Math.min(...xs);
    y = Math.min(...ys);
    width = Math.max(...xs) - x;
    height = Math.max(...ys) - y;
  }

  const round = (n) => Math.round(n * 100) / 100;
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

const contains = (box, px, py) =>
  px >= box.x - 1 && px <= box.x + box.width + 1 && py >= box.y - 1 && py <= box.y + box.height + 1;

const area = (box) => box.width * box.height;

function collectRoomRects(svg) {
  const rects = [];
  for (const match of svg.matchAll(/<rect[^>]*>/g)) {
    const tag = match[0];
    if (!ROOM_FILLS.includes(attr(tag, 'fill'))) continue;
    rects.push({ tag, index: match.index, box: boundingBox(tag) });
  }
  return rects;
}

function processFloor({ floor, path }, records) {
  const rects = collectRoomRects(readFileSync(path, 'utf8'));
  assert.ok(rects.length > 0, 'floor ' + floor + ': no room-colour fills found in ' + path);

  const floorRecords = records.filter((r) => r.floor === floor);
  const claimed = new Set(); // index into rects
  const areas = new Map(); // location_id -> box
  const unmatched = [];

  for (const record of floorRecords) {
    const hit = rects
      .map((rect, i) => ({ rect, i }))
      .filter(({ rect }) => contains(rect.box, record.x, record.y))
      .sort((a, b) => area(a.rect.box) - area(b.rect.box))
      .find(({ i }) => !claimed.has(i));

    if (!hit) {
      unmatched.push(record);
      continue;
    }
    claimed.add(hit.i);
    areas.set(record.location_id, hit.rect.box);
  }

  return { floor, path, rects: rects.length, records: floorRecords.length, unmatched, areas };
}

function renderModule(results) {
  const entries = [];
  for (const result of results) {
    for (const [id, box] of result.areas) {
      entries.push(
        "  '" +
          id +
          "': { floor: " +
          result.floor +
          ', x: ' +
          box.x +
          ', y: ' +
          box.y +
          ', width: ' +
          box.width +
          ', height: ' +
          box.height +
          ' },'
      );
    }
  }

  return `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: node tools/data-extraction/extract-room-areas.mjs
 *
 * Axis-aligned bounds of each room's floor-plan area, in the SVG user-unit space of
 * frontend/public/maps/lc3/floor-{1,2}.svg — the same space Room.coordinates uses.
 *
 * tools/data-extraction/strip-baked-room-labels.mjs matches baked room numbers to rooms by
 * these areas. Rooms absent from this map (corridor POIs such as toilets and stairs, plus a
 * couple of rooms whose seed point sits outside its rect) fall back to distance there.
 */

export interface RoomArea {
  floor: number
  x: number
  y: number
  width: number
  height: number
}

export const ROOM_AREAS: Record<string, RoomArea> = {
${entries.join('\n')}
}
`;
}

function main() {
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  const results = FLOORS.map((f) => processFloor(f, seed.records));

  writeFileSync(OUT_PATH, renderModule(results), { encoding: 'utf8' });

  let totalAreas = 0;
  let totalUnmatched = 0;

  for (const r of results) {
    totalAreas += r.areas.size;
    totalUnmatched += r.unmatched.length;
    console.log('floor ' + r.floor + '  (' + r.path.replace(REPO_ROOT, '.') + ')');
    console.log('  room-colour rects : ' + r.rects);
    console.log('  seed records      : ' + r.records);
    console.log('  matched to a rect : ' + r.areas.size);
    if (r.unmatched.length) {
      console.log('  UNMATCHED (' + r.unmatched.length + '):');
      for (const u of r.unmatched) {
        console.log('    ' + u.location_id.padEnd(20) + u.category.padEnd(16) + 'at ' + u.x + ',' + u.y);
      }
    }
    console.log('');
  }

  console.log('Wrote ' + OUT_PATH.replace(REPO_ROOT, '.') + ' — ' + totalAreas + ' room areas.');
  console.log(totalUnmatched + ' records have no area geometry.');
}

main();
