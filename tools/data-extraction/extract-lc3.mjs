/**
 * Extracts the LC3 (อาคาร LC3) location inventory from the legacy CS232 map graph.
 *
 * Node 24 stdlib only — AGENTS.md §8.3 forbids installing dependencies at the repo
 * root, and no service package.json exists yet, so this script must stay dependency-free.
 *
 *   node tools/data-extraction/extract-lc3.mjs                 regenerate the node inventory
 *   node tools/data-extraction/extract-lc3.mjs --verify-assets re-check asset hashes and bounds
 *
 * Rooms, toilets and stairs become the location seed (issue #8). Every node and all 302 edges
 * also become the routing graph seed, lc3-graph.seed.json (issue #143); see lc3/routing-graph.mjs.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraphSeed } from './lc3/routing-graph.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATASET_DIR = join(REPO_ROOT, 'tools', 'data-extraction', 'lc3');
const MANIFEST_PATH = join(DATASET_DIR, 'source', 'source-manifest.json');
const GRAPH_PATH = join(DATASET_DIR, 'source', 'graph.source.json');
const INVENTORY_PATH = join(DATASET_DIR, 'reports', 'node-inventory.csv');
const SURVEY_PATH = join(DATASET_DIR, 'survey', 'lc3-field-survey.template.csv');
const SEED_JSON_PATH = join(DATASET_DIR, 'lc3-locations.seed.json');
const SEED_CSV_PATH = join(DATASET_DIR, 'lc3-locations.seed.csv');
const GRAPH_SEED_PATH = join(DATASET_DIR, 'lc3-graph.seed.json');

/**
 * Beyond this many walkable hops a POI stops being a useful landmark. 15 is not arbitrary:
 * measured over the source graph, the furthest any room sits from a toilet is 14 hops, so
 * this covers every room without inventing reachability that is not there.
 */
const MAX_LANDMARK_HOPS = 15;

/**
 * Edge types that represent movement within one floor. "walk" is corridor movement; "up"
 * links a corridor junction to a stairwell landing on the same floor. "stairs" edges cross
 * between floors and are excluded, or a floor-2 room would look adjacent to a floor-1 toilet.
 */
const SAME_FLOOR_EDGE_TYPES = new Set(['walk', 'up']);

/**
 * Things a person has to stand in the building to confirm. Rows for these are pre-filled in
 * the survey template so the field pass is a fill-in-the-blanks job.
 *
 * The lift has no node in the source graph at all, and building entrances are not modelled
 * separately (the source graph's 93 "entrance" nodes are room doorways), so both are seeded
 * as blank rows rather than derived.
 */
const SURVEY_PLACEHOLDERS = [
  { source_node_id: '', room_code: '', floor: 1, subject: 'elevator', note: 'ไม่มี node ลิฟต์ในข้อมูลต้นทาง — ระบุตำแหน่งจากหน้างาน' },
  { source_node_id: '', room_code: '', floor: 2, subject: 'elevator', note: 'ไม่มี node ลิฟต์ในข้อมูลต้นทาง — ระบุตำแหน่งจากหน้างาน' },
  { source_node_id: '', room_code: '', floor: 1, subject: 'building_entrance', note: 'ทางเข้าอาคารหลัก — ระบุตำแหน่งและฝั่ง' },
  { source_node_id: '', room_code: '', floor: 1, subject: 'building_entrance', note: 'ทางเข้าอาคารรอง — ระบุตำแหน่งและฝั่ง' },
];

/**
 * Expected source composition. A mismatch means upstream changed and the rules need review.
 * `includeGraph` nodes are routing-only: 149 junctions and doorways plus the 8 QR anchors.
 * The 8 unmatched graph nodes are those QR anchors, typed `room` upstream with no location.
 */
const EXPECTED = { total: 288, include: 131, includeGraph: 157, needsFieldValidation: 6, edges: 302, unmatchedGraphNodes: 8 };

/**
 * Thai label prefix -> category. Order matters and is load-bearing:
 * "ห้องประชุม/บรรยาย" must beat "ห้องประชุม", and "ห้องพักอาจารย์และเตรียมปฏิบัติการ..."
 * must beat "ห้องปฏิบัติการ". First match wins.
 */
const CATEGORY_RULES = [
  ['ห้องประชุม/บรรยาย', 'lecture_room'],
  ['ห้องบรรยาย', 'lecture_room'],
  ['ห้องสัมมนา', 'seminar_room'],
  ['ห้องประชุม', 'meeting_room'],
  ['ห้องพักอาจารย์', 'faculty_office'],
  ['ห้องพักนักศึกษา', 'student_room'],
  ['ห้องเตรียมปฏิบัติการ', 'laboratory'],
  ['ห้องปฏิบัติการ', 'laboratory'],
  ['ห้องวิจัย', 'research_room'],
  ['ห้องสำนักงานภาควิชา', 'department_office'],
  ['ห้องเจ้าหน้าที่', 'staff_room'],
  ['ห้องเก็บของ', 'storage'],
  ['ห้องควบคุม', 'utility'],
  ['ห้องโครงการ', 'service_room'],
];

/** Toilet nodes carry no label; side and gender are encoded in the node name. */
const TOILET_CODES = {
  LM: 'ห้องน้ำชาย (ฝั่งซ้าย)',
  LF: 'ห้องน้ำหญิง (ฝั่งซ้าย)',
  RM: 'ห้องน้ำชาย (ฝั่งขวา)',
  RF: 'ห้องน้ำหญิง (ฝั่งขวา)',
};

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function categoryFor(label) {
  for (const [prefix, category] of CATEGORY_RULES) {
    if (label.startsWith(prefix)) return category;
  }
  return 'unknown';
}

/** "104/1" must sort between "104" and "105", which a plain string compare gets wrong. */
function naturalCompare(a, b) {
  const split = (s) => s.split(/(\d+)/).filter(Boolean);
  const left = split(a);
  const right = split(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const bothNumeric = /^\d+$/.test(l) && /^\d+$/.test(r);
    const cmp = bothNumeric ? Number(l) - Number(r) : l.localeCompare(r, 'en');
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/**
 * Assigns exactly one disposition to a node. Returns the seed-facing fields too, so the
 * classification and the derived values can never disagree about what a node is.
 */
function classify(node) {
  const isQrAnchor = /^QR\d+$/.test(node.name);

  // Both stay out of the location seed but are routable nodes in the graph seed.
  if (isQrAnchor) {
    return { disposition: 'include_graph', reason: 'qr_anchor_not_a_room' };
  }
  if (node.type === 'junction' || node.type === 'entrance') {
    return { disposition: 'include_graph', reason: 'routing_topology_not_a_location' };
  }
  if (node.type === 'facility') {
    const code = node.name.slice(0, 2).toUpperCase();
    const nameTh = TOILET_CODES[code];
    if (!nameTh) {
      return { disposition: 'exclude_unclassified', reason: 'unrecognised_facility_code' };
    }
    // Side/gender is inferred from the name code, not observed — the field pass confirms it.
    return {
      disposition: 'include',
      reason: '',
      kind: 'poi',
      category: 'toilet',
      nameTh,
      nameVerification: 'inferred',
    };
  }
  if (node.type === 'stairs') {
    const ordinal = node.name.replace(/^stair-/, '');
    return {
      disposition: 'include',
      reason: '',
      kind: 'poi',
      category: 'stairs',
      nameTh: `บันได ${ordinal}`,
      nameVerification: 'inferred',
    };
  }
  if (node.type === 'room') {
    if (!node.label) {
      return {
        disposition: 'include',
        reason: 'missing_thai_name_verify_on_site',
        kind: 'room',
        category: 'unknown',
        nameTh: '',
        nameVerification: 'pending_survey',
        needsFieldValidation: true,
      };
    }
    return {
      disposition: 'include',
      reason: '',
      kind: 'room',
      category: categoryFor(node.label),
      nameTh: node.label,
      nameVerification: 'from_source',
    };
  }
  return { disposition: 'exclude_unclassified', reason: 'unknown_node_type' };
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** "101/1" -> "101-1"; ids stay URL- and SQL-safe without losing the slash's meaning. */
const slug = (name) => name.toUpperCase().replace(/\//g, '-').replace(/[^A-Z0-9-]/g, '');

/**
 * Nearest toilet and nearest stairs, measured in walkable hops over the source graph's own
 * edges rather than straight-line pixels. A wall between two rooms makes them far apart even
 * when their pins are 20px apart, and only the edge topology knows that.
 *
 * Routing data stays out of the location seed; the edges ship separately in lc3-graph.seed.json.
 */
function deriveLandmarks(graph, includedByNodeId) {
  const neighbours = new Map();
  for (const node of graph.nodes) neighbours.set(node.id, []);
  for (const edge of graph.edges) {
    if (!SAME_FLOOR_EDGE_TYPES.has(edge.type)) continue;
    neighbours.get(edge.from)?.push(edge.to);
    neighbours.get(edge.to)?.push(edge.from);
  }

  const landmarksFor = new Map();
  for (const [nodeId, record] of includedByNodeId) {
    if (record.location_kind !== 'room') continue;
    const found = { toilet: null, stairs: null };
    const seen = new Set([nodeId]);
    let frontier = [nodeId];
    for (let hops = 1; hops <= MAX_LANDMARK_HOPS && (!found.toilet || !found.stairs); hops += 1) {
      const next = [];
      for (const current of frontier) {
        for (const neighbour of neighbours.get(current) ?? []) {
          if (seen.has(neighbour)) continue;
          seen.add(neighbour);
          next.push(neighbour);
          const target = includedByNodeId.get(neighbour);
          if (target && !found[target.category] && (target.category === 'toilet' || target.category === 'stairs')) {
            found[target.category] = { record: target, hops };
          }
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    const list = [];
    for (const kind of ['toilet', 'stairs']) {
      if (!found[kind]) continue;
      list.push({
        kind: `near_${kind}`,
        ref_location_id: found[kind].record.location_id,
        walk_hops: found[kind].hops,
        text_th: `ใกล้${found[kind].record.name_th}`,
        // Derived from the upstream walk topology, confirmed by nobody. The field pass decides.
        verification: 'derived_unverified',
      });
    }
    if (list.length > 0) landmarksFor.set(nodeId, list);
  }
  return landmarksFor;
}

/** Flattens one seed record to a CSV row. Multi-valued fields use `|`. */
const SEED_CSV_COLUMNS = [
  'location_id', 'building_code', 'floor', 'location_kind', 'room_code', 'aliases',
  'name_th', 'category', 'map_asset_id', 'x', 'y', 'detail_th', 'landmarks',
  'source_node_id', 'source_x', 'source_y', 'flags',
];

function seedToCsv(records) {
  const lines = [SEED_CSV_COLUMNS.join(',')];
  for (const r of records) {
    const flat = {
      ...r,
      aliases: r.aliases.join('|'),
      landmarks: r.landmarks.map((l) => `${l.kind}:${l.ref_location_id}:${l.walk_hops}`).join('|'),
      source_node_id: r.source.node_id,
      source_x: r.source.x,
      source_y: r.source.y,
      flags: r.flags.join('|'),
    };
    lines.push(SEED_CSV_COLUMNS.map((c) => csvCell(flat[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

function main() {
  const verifyAssets = process.argv.includes('--verify-assets');
  const manifest = readJson(MANIFEST_PATH);
  const graph = readJson(GRAPH_PATH);
  const problems = [];

  // Gate on provenance before trusting any coordinate derived from these files.
  const graphHash = sha256(GRAPH_PATH);
  if (graphHash !== manifest.graph.sha256) {
    problems.push(`graph.source.json sha256 drifted\n  manifest: ${manifest.graph.sha256}\n  actual:   ${graphHash}`);
  }
  const assetsByFloor = new Map();
  for (const asset of manifest.assets) {
    assetsByFloor.set(asset.floor, asset);
    const assetPath = join(REPO_ROOT, asset.dest_path);
    const actual = sha256(assetPath);
    if (actual !== asset.sha256) {
      problems.push(`${asset.dest_path} sha256 drifted\n  manifest: ${asset.sha256}\n  actual:   ${actual}`);
    }
    if (verifyAssets) {
      // The translation constants are only valid for this exact artwork at this exact size.
      const head = readFileSync(assetPath, 'utf8').slice(0, 400);
      const declared = /viewBox="([^"]+)"/.exec(head)?.[1];
      const expected = asset.viewbox.join(' ');
      if (declared !== expected) {
        problems.push(`${asset.dest_path} viewBox is "${declared}", manifest says "${expected}"`);
      }
    }
  }

  if (graph.nodes.length !== EXPECTED.total) {
    problems.push(`expected ${EXPECTED.total} source nodes, found ${graph.nodes.length}`);
  }

  const rows = [];
  const seedByNodeId = new Map();
  const counts = { include: 0, include_graph: 0, exclude_unclassified: 0, needs_field_validation: 0 };

  for (const node of graph.nodes) {
    const asset = assetsByFloor.get(node.floor);
    if (!asset) {
      problems.push(`node ${node.id} is on floor ${node.floor}, which has no map asset`);
      continue;
    }
    const { translate_x: dx, translate_y: dy } = asset.coordinate_transform;
    const x = node.x + dx;
    const y = node.y + dy;
    const c = classify(node);
    counts[c.disposition] += 1;
    if (c.needsFieldValidation) counts.needs_field_validation += 1;

    // Every node is drawn on the map now: a location pin or a point on a route.
    const [, , vbWidth, vbHeight] = asset.viewbox;
    if (x < 0 || x > vbWidth || y < 0 || y > vbHeight) {
      problems.push(`node ${node.id} lands at (${x},${y}), outside ${asset.map_asset_id} ${vbWidth}x${vbHeight}`);
    }

    rows.push({
      source_node_id: node.id,
      source_name: node.name,
      node_type: node.type,
      floor: node.floor,
      source_x: node.x,
      source_y: node.y,
      map_asset_id: asset.map_asset_id,
      x,
      y,
      // The slash in "101/1" is part of the room number — 101/1 and 101/2 are different
      // rooms with different purposes. Never split on it to derive a "base" room code.
      room_code: c.disposition === 'include' && c.kind === 'room' ? `LC3-${node.name}` : '',
      location_kind: c.kind ?? '',
      category: c.category ?? '',
      name_th: c.nameTh ?? '',
      name_verification: c.nameVerification ?? '',
      disposition: c.disposition,
      reason: c.reason,
      flags: c.needsFieldValidation ? 'needs_field_validation' : '',
    });

    if (c.disposition !== 'include') continue;

    const prefix = c.kind === 'room' ? 'R' : 'P';
    const aliases = c.kind === 'room'
      ? [`LC3-${node.name}`, `LC3_${node.name}`, node.name]
      : [];
    seedByNodeId.set(node.id, {
      location_id: `LC3-F${node.floor}-${prefix}${slug(node.name)}`,
      building_code: 'LC3',
      floor: node.floor,
      location_kind: c.kind,
      room_code: c.kind === 'room' ? `LC3-${node.name}` : '',
      aliases: [...new Set(aliases)],
      name_th: c.nameTh,
      category: c.category,
      map_asset_id: asset.map_asset_id,
      x,
      y,
      // Only states what is actually known. The landmark clause is appended by the field pass,
      // never generated here — an unverified "ใกล้ห้องน้ำ" in user-facing text is a lie.
      detail_th: c.nameTh
        ? `อาคาร LC3 ชั้น ${node.floor} ${c.kind === 'room' ? `ห้อง ${node.name} — ${c.nameTh}` : c.nameTh}`
        : `อาคาร LC3 ชั้น ${node.floor} ห้อง ${node.name}`,
      landmarks: [],
      source: { node_id: node.id, node_type: node.type, x: node.x, y: node.y, translation: { dx, dy } },
      verification: {
        name_th: c.nameVerification,
        category: c.category === 'unknown' ? 'pending_survey' : 'derived',
        coordinates: 'svg_verified',
        detail_th: c.nameTh ? 'derived' : 'pending_survey',
        landmarks: 'pending_survey',
      },
      flags: c.needsFieldValidation ? ['needs_field_validation'] : [],
    });
  }

  for (const [key, expected] of [
    ['include', EXPECTED.include],
    ['include_graph', EXPECTED.includeGraph],
    ['needs_field_validation', EXPECTED.needsFieldValidation],
  ]) {
    if (counts[key] !== expected) problems.push(`expected ${expected} ${key} nodes, found ${counts[key]}`);
  }
  if (counts.exclude_unclassified !== 0) {
    problems.push(`${counts.exclude_unclassified} nodes could not be classified`);
  }
  const dispositioned = counts.include + counts.include_graph + counts.exclude_unclassified;
  if (dispositioned !== graph.nodes.length) {
    problems.push(`${dispositioned} dispositions for ${graph.nodes.length} nodes — every node must get exactly one`);
  }
  const labelled = rows.filter((r) => r.location_kind === 'room' && r.name_th && r.category === 'unknown');
  if (labelled.length > 0) {
    problems.push(`${labelled.length} labelled rooms fell through the category rules: ${labelled.map((r) => r.source_node_id).join(', ')}`);
  }

  if (graph.edges.length !== EXPECTED.edges) {
    problems.push(`expected ${EXPECTED.edges} source edges, found ${graph.edges.length}`);
  }
  let graphSeed;
  try {
    graphSeed = buildGraphSeed({ graph, manifest, locationRecords: [...seedByNodeId.values()] });
    const unmatched = graphSeed.unmatched_room_or_facility_nodes;
    const unexpected = unmatched.filter((id) => !/^LC3_QR\d+$/.test(id));
    if (unmatched.length !== EXPECTED.unmatchedGraphNodes || unexpected.length > 0) {
      problems.push(`expected ${EXPECTED.unmatchedGraphNodes} graph nodes without a location (the QR anchors), found ${unmatched.join(', ')}`);
    }
  } catch (error) {
    problems.push(error.message);
  }

  if (problems.length > 0) {
    console.error('extract-lc3: FAILED\n');
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }

  rows.sort(
    (a, b) =>
      a.floor - b.floor ||
      a.disposition.localeCompare(b.disposition, 'en') ||
      (a.location_kind || 'z').localeCompare(b.location_kind || 'z', 'en') ||
      naturalCompare(a.source_name, b.source_name) ||
      naturalCompare(a.source_node_id, b.source_node_id)
  );

  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n';
  writeFileSync(INVENTORY_PATH, csv, 'utf8');

  // Survey template: everything that cannot be settled from the source data alone.
  const surveySubjects = rows
    .filter((r) => r.disposition === 'include' && (r.flags || r.category === 'toilet' || r.category === 'stairs'))
    .map((r) => ({
      source_node_id: r.source_node_id,
      room_code: r.room_code,
      floor: r.floor,
      subject: r.flags ? 'unnamed_room' : r.category,
      note: r.flags ? 'ไม่มีชื่อห้องในข้อมูลต้นทาง — อ่านจากป้ายหน้าห้อง' : `ยืนยัน "${r.name_th}" (อนุมานจากรหัส node)`,
    }));
  const surveyHeaders = [
    'source_node_id', 'room_code', 'floor', 'subject',
    'room_name_observed', 'nearest_landmark', 'relation', 'detail_th',
    'observed_by', 'observed_at', 'evidence_ref', 'note',
  ];
  const surveyRows = [...surveySubjects, ...SURVEY_PLACEHOLDERS].map((s) =>
    surveyHeaders.map((h) => csvCell(s[h] ?? '')).join(',')
  );
  writeFileSync(SURVEY_PATH, [surveyHeaders.join(','), ...surveyRows].join('\n') + '\n', 'utf8');

  // Seed dataset. Built from one records[] array and serialized twice, so JSON and CSV
  // cannot disagree by construction.
  const landmarksFor = deriveLandmarks(graph, seedByNodeId);
  for (const [nodeId, list] of landmarksFor) seedByNodeId.get(nodeId).landmarks = list;

  const seedRecords = [...seedByNodeId.values()].sort(
    (a, b) =>
      a.floor - b.floor ||
      a.location_kind.localeCompare(b.location_kind, 'en') ||
      naturalCompare(a.source.node_id, b.source.node_id)
  );

  const withLandmarks = seedRecords.filter((r) => r.landmarks.length > 0).length;
  const seedDoc = {
    generated_by: 'tools/data-extraction/extract-lc3.mjs',
    manifest: 'source/source-manifest.json',
    building: { code: 'LC3', name_th: 'อาคาร LC3', aliases: ['LC3'] },
    floors: manifest.assets.map((a) => ({
      floor: a.floor,
      map_asset_id: a.map_asset_id,
      asset: a.dest_path,
      viewbox: a.viewbox,
      coordinate_transform: a.coordinate_transform,
    })),
    counts: {
      records: seedRecords.length,
      rooms: seedRecords.filter((r) => r.location_kind === 'room').length,
      poi: seedRecords.filter((r) => r.location_kind === 'poi').length,
      needs_field_validation: counts.needs_field_validation,
      with_derived_landmarks: withLandmarks,
    },
    records: seedRecords,
  };
  writeFileSync(SEED_JSON_PATH, JSON.stringify(seedDoc, null, 2) + '\n', 'utf8');
  writeFileSync(SEED_CSV_PATH, seedToCsv(seedRecords), 'utf8');
  writeFileSync(GRAPH_SEED_PATH, JSON.stringify(graphSeed, null, 2) + '\n', 'utf8');

  console.log('extract-lc3: OK');
  console.log(`  source nodes            ${graph.nodes.length}`);
  console.log(`  include                 ${counts.include}`);
  console.log(`  include_graph           ${counts.include_graph}`);
  console.log(`  needs_field_validation  ${counts.needs_field_validation}`);
  console.log(`  wrote                   ${INVENTORY_PATH.slice(REPO_ROOT.length + 1)}`);
  console.log(`  wrote                   ${SURVEY_PATH.slice(REPO_ROOT.length + 1)} (${surveyRows.length} rows)`);
  console.log(`  wrote                   ${SEED_JSON_PATH.slice(REPO_ROOT.length + 1)} (${seedRecords.length} records, ${withLandmarks} with landmarks)`);
  console.log(`  wrote                   ${SEED_CSV_PATH.slice(REPO_ROOT.length + 1)}`);
  const { counts: g } = graphSeed;
  console.log(`  wrote                   ${GRAPH_SEED_PATH.slice(REPO_ROOT.length + 1)} (${g.nodes} nodes, ${g.edges} edges, ${g.nodes_with_location_id} with location_id)`);
  console.log(`  room/facility nodes without a location_id: ${g.unmatched_room_or_facility_nodes} (${graphSeed.unmatched_room_or_facility_nodes.join(', ')})`);
}

main();
