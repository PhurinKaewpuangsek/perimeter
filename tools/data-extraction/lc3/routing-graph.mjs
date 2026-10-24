/**
 * Builds the LC3 routing graph seed (lc3-graph.seed.json) from the source graph, issue #143.
 *
 * Pure: extract-lc3.mjs writes whatever this returns, and validate-lc3-seed.mjs rebuilds it
 * from the same inputs, so a committed file that the extractor would not reproduce fails CI.
 *
 * Items are shaped exactly as they are stored in SmartFacultyGraph (docs/adr/0001):
 *   node  { graph_id, element_id: NODE#<node_id>, node_id, floor, x, y, node_type, location_id? }
 *   edge  { graph_id, element_id: EDGE#<from>|<to>, from, to, edge_type, distance }
 * The closure fields (closed, closed_from, closed_until, closed_reason) are never seeded: they
 * belong to staff (#147), and an absent `closed` means open.
 */

export const GRAPH_ID = 'LC3';

/**
 * Cost of crossing one floor by stairs, in map units. A `stairs` edge joins two floor plans
 * drawn in different coordinate frames, so a straight-line length between its ends means
 * nothing, and the source stores 0. Measured over every node pair, a cost of 0 would let a
 * same-floor route save up to 144 map units by climbing to the other floor and back; any cost
 * above 72 per crossing prevents that. 150 doubles the margin, so a route only changes floor
 * when its destination is on the other floor.
 */
export const STAIRS_DISTANCE = 150;

/**
 * Where a visitor walks into the building. The source graph does not model building entrances
 * (its `entrance` nodes are room doorways), so this one is read off the floor plans and stays
 * unverified until the field survey confirms it.
 */
export const BUILDING_ENTRANCES = [
  {
    node_id: 'LC3_Junction_SM',
    floor: 1,
    verification: 'derived_unverified',
    basis: 'Floor-1 south corridor where it opens to the outside, under the floor-2 balcony (ระเบียง) and beside the QR1 anchor.',
  },
];

/** Node types that stand for a place in SmartFacultyLocations and should carry its location_id. */
const LOCATION_NODE_TYPES = new Set(['room', 'facility']);

const byKey = (a, b) => (a.element_id < b.element_id ? -1 : a.element_id > b.element_id ? 1 : 0);

/**
 * Same-floor edges cost their straight-line length; the source's own `distance` is 0 on every
 * edge, so it carries no information. Rounded to 0.01 so the seed is stable across platforms.
 */
export function edgeDistance(from, to) {
  if (from.floor !== to.floor) return STAIRS_DISTANCE * Math.abs(from.floor - to.floor);
  return Math.round(Math.hypot(from.x - to.x, from.y - to.y) * 100) / 100;
}

/**
 * @param {object} input
 * @param {{ nodes: object[], edges: object[] }} input.graph  graph.source.json
 * @param {{ assets: object[] }} input.manifest  source-manifest.json
 * @param {object[]} input.locationRecords  lc3-locations.seed.json records
 */
export function buildGraphSeed({ graph, manifest, locationRecords }) {
  const transformByFloor = new Map(manifest.assets.map((a) => [a.floor, a.coordinate_transform]));
  const locationIdByNode = new Map(locationRecords.map((r) => [r.source.node_id, r.location_id]));

  const nodesById = new Map();
  for (const node of graph.nodes) {
    const transform = transformByFloor.get(node.floor);
    if (!transform) throw new Error(`node ${node.id} is on floor ${node.floor}, which has no map asset`);
    const item = {
      graph_id: GRAPH_ID,
      element_id: `NODE#${node.id}`,
      node_id: node.id,
      floor: node.floor,
      x: node.x + transform.translate_x,
      y: node.y + transform.translate_y,
      node_type: node.type,
    };
    const locationId = locationIdByNode.get(node.id);
    if (locationId) item.location_id = locationId;
    nodesById.set(node.id, item);
  }

  const edges = graph.edges.map((edge) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) throw new Error(`edge ${edge.from} -> ${edge.to} references a node that does not exist`);
    return {
      graph_id: GRAPH_ID,
      element_id: `EDGE#${edge.from}|${edge.to}`,
      from: edge.from,
      to: edge.to,
      edge_type: edge.type,
      distance: edgeDistance(from, to),
    };
  });

  const nodes = [...nodesById.values()].sort((a, b) => a.floor - b.floor || byKey(a, b));
  edges.sort(byKey);

  // Reported, not hidden: a room or facility node with no location cannot be routed to by name.
  const unmatched = nodes
    .filter((n) => LOCATION_NODE_TYPES.has(n.node_type) && !n.location_id)
    .map((n) => n.node_id);

  return {
    generated_by: 'tools/data-extraction/extract-lc3.mjs',
    source: 'source/graph.source.json',
    graph_id: GRAPH_ID,
    distance_rule: {
      unit: 'map_units',
      same_floor: 'straight-line length between the transformed x,y of both ends, rounded to 0.01',
      per_floor_crossed: STAIRS_DISTANCE,
    },
    building_entrances: BUILDING_ENTRANCES,
    counts: {
      nodes: nodes.length,
      edges: edges.length,
      items: nodes.length + edges.length,
      nodes_with_location_id: nodes.filter((n) => n.location_id).length,
      unmatched_room_or_facility_nodes: unmatched.length,
    },
    unmatched_room_or_facility_nodes: unmatched,
    nodes,
    edges,
  };
}
