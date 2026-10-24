import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findRoute, isElementClosed } from './route.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('isElementClosed helper', () => {
  const at = new Date('2026-10-25T10:00:00+07:00');

  test('returns false when closed is false or undefined', () => {
    assert.equal(isElementClosed({}, at), false);
    assert.equal(isElementClosed({ closed: false }, at), false);
  });

  test('returns true when closed is true without bounds', () => {
    assert.equal(isElementClosed({ closed: true }, at), true);
  });

  test('returns true when target time is within [closed_from, closed_until]', () => {
    const element = {
      closed: true,
      closed_from: '2026-10-25T08:00:00+07:00',
      closed_until: '2026-10-25T12:00:00+07:00',
    };
    assert.equal(isElementClosed(element, at), true);
  });

  test('returns false when closure is expired (closed_until < at)', () => {
    const element = {
      closed: true,
      closed_from: '2026-10-25T07:00:00+07:00',
      closed_until: '2026-10-25T09:00:00+07:00',
    };
    assert.equal(isElementClosed(element, at), false);
  });

  test('returns false when closure is in future (closed_from > at)', () => {
    const element = {
      closed: true,
      closed_from: '2026-10-25T14:00:00+07:00',
      closed_until: '2026-10-25T18:00:00+07:00',
    };
    assert.equal(isElementClosed(element, at), false);
  });

  test('handles open-ended bounds correctly', () => {
    assert.equal(
      isElementClosed({ closed: true, closed_from: '2026-10-25T08:00:00+07:00' }, at),
      true
    );
    assert.equal(
      isElementClosed({ closed: true, closed_until: '2026-10-25T12:00:00+07:00' }, at),
      true
    );
    assert.equal(
      isElementClosed({ closed: true, closed_until: '2026-10-25T09:00:00+07:00' }, at),
      false
    );
  });
});

describe('findRoute pure algorithm', () => {
  const sampleNodes = [
    { node_id: 'N1', floor: 1, x: 10, y: 10, node_type: 'entrance', location_id: 'LOC-ENTRANCE' },
    { node_id: 'N2', floor: 1, x: 20, y: 10, node_type: 'junction' },
    { node_id: 'N3', floor: 1, x: 30, y: 10, node_type: 'room', location_id: 'LOC-ROOM-A' },
    { node_id: 'N4', floor: 1, x: 20, y: 30, node_type: 'junction' },
    { node_id: 'N5', floor: 1, x: 30, y: 30, node_type: 'room', location_id: 'LOC-ROOM-B' },
    // Multi-door room
    { node_id: 'N6_1', floor: 1, x: 50, y: 10, node_type: 'room', location_id: 'LOC-ROOM-MULTI' },
    { node_id: 'N6_2', floor: 1, x: 70, y: 10, node_type: 'room', location_id: 'LOC-ROOM-MULTI' },
    // Floor 2 and stairs
    { node_id: 'STAIR_F1', floor: 1, x: 15, y: 10, node_type: 'stairs' },
    { node_id: 'STAIR_F2', floor: 2, x: 15, y: 10, node_type: 'stairs' },
    { node_id: 'N_F2_1', floor: 2, x: 25, y: 10, node_type: 'room', location_id: 'LOC-ROOM-F2' },
  ];

  const sampleEdges = [
    { from: 'N1', to: 'STAIR_F1', distance: 5, edge_type: 'walk' },
    { from: 'STAIR_F1', to: 'N2', distance: 5, edge_type: 'walk' },
    { from: 'N2', to: 'N3', distance: 10, edge_type: 'walk', element_id: 'EDGE#N2|N3' },
    // Detour to N3 via N4
    { from: 'N2', to: 'N4', distance: 20, edge_type: 'walk' },
    { from: 'N4', to: 'N3', distance: 20, edge_type: 'walk' },
    // Multi-door connections
    { from: 'N3', to: 'N6_1', distance: 20, edge_type: 'walk' },
    { from: 'N3', to: 'N6_2', distance: 40, edge_type: 'walk' },
    // Stairs connection between floors
    { from: 'STAIR_F1', to: 'STAIR_F2', distance: 0, edge_type: 'stairs' },
    { from: 'STAIR_F2', to: 'N_F2_1', distance: 10, edge_type: 'walk' },
  ];

  test('finds normal route on the same floor', () => {
    const result = findRoute({
      nodes: sampleNodes,
      edges: sampleEdges,
      from: 'LOC-ENTRANCE',
      to: 'LOC-ROOM-A',
      at: '2026-10-25T10:00:00+07:00',
    });

    assert.equal(result.found, true);
    assert.equal(result.distance, 20); // N1 -> STAIR_F1 (5) + STAIR_F1 -> N2 (5) + N2 -> N3 (10)
    assert.deepEqual(result.floors, [1]);
    assert.deepEqual(
      result.path.map((p) => p.node_id),
      ['N1', 'STAIR_F1', 'N2', 'N3']
    );
    assert.deepEqual(result.closures_avoided, []);
  });

  test('finds route crossing floors via stairs', () => {
    const result = findRoute({
      nodes: sampleNodes,
      edges: sampleEdges,
      from: 'N1',
      to: 'LOC-ROOM-F2',
      at: '2026-10-25T10:00:00+07:00',
    });

    assert.equal(result.found, true);
    assert.equal(result.distance, 15); // N1 -> STAIR_F1 (5) + STAIR_F1 -> STAIR_F2 (0) + STAIR_F2 -> N_F2_1 (10)
    assert.deepEqual(result.floors, [1, 2]);
    assert.deepEqual(
      result.path.map((p) => p.node_id),
      ['N1', 'STAIR_F1', 'STAIR_F2', 'N_F2_1']
    );
  });

  test('avoids closed edge, finds longer detour, and records closures_avoided', () => {
    const edgesWithClosure = sampleEdges.map((e) => {
      if (e.from === 'N2' && e.to === 'N3') {
        return {
          ...e,
          closed: true,
          closed_from: '2026-10-25T08:00:00+07:00',
          closed_until: '2026-10-25T18:00:00+07:00',
          closed_reason: 'Floor maintenance',
        };
      }
      return e;
    });

    const result = findRoute({
      nodes: sampleNodes,
      edges: edgesWithClosure,
      from: 'LOC-ENTRANCE',
      to: 'LOC-ROOM-A',
      at: '2026-10-25T10:00:00+07:00',
    });

    assert.equal(result.found, true);
    // Path goes N1 -> STAIR_F1 (5) -> N2 (5) -> N4 (20) -> N3 (20) = 50
    assert.equal(result.distance, 50);
    assert.deepEqual(
      result.path.map((p) => p.node_id),
      ['N1', 'STAIR_F1', 'N2', 'N4', 'N3']
    );
    assert.equal(result.closures_avoided.length, 1);
    assert.equal(result.closures_avoided[0].element_id, 'EDGE#N2|N3');
    assert.equal(result.closures_avoided[0].reason, 'Floor maintenance');
  });

  test('ignores expired closure on edge (closed_until < at)', () => {
    const edgesWithExpiredClosure = sampleEdges.map((e) => {
      if (e.from === 'N2' && e.to === 'N3') {
        return {
          ...e,
          closed: true,
          closed_from: '2026-10-25T07:00:00+07:00',
          closed_until: '2026-10-25T09:00:00+07:00',
          closed_reason: 'Morning cleaning',
        };
      }
      return e;
    });

    const result = findRoute({
      nodes: sampleNodes,
      edges: edgesWithExpiredClosure,
      from: 'LOC-ENTRANCE',
      to: 'LOC-ROOM-A',
      at: '2026-10-25T10:00:00+07:00',
    });

    assert.equal(result.found, true);
    assert.equal(result.distance, 20); // Normal short path used
    assert.deepEqual(result.closures_avoided, []);
  });

  test('ignores future closure on edge (closed_from > at)', () => {
    const edgesWithFutureClosure = sampleEdges.map((e) => {
      if (e.from === 'N2' && e.to === 'N3') {
        return {
          ...e,
          closed: true,
          closed_from: '2026-10-25T14:00:00+07:00',
          closed_until: '2026-10-25T16:00:00+07:00',
        };
      }
      return e;
    });

    const result = findRoute({
      nodes: sampleNodes,
      edges: edgesWithFutureClosure,
      from: 'LOC-ENTRANCE',
      to: 'LOC-ROOM-A',
      at: '2026-10-25T10:00:00+07:00',
    });

    assert.equal(result.found, true);
    assert.equal(result.distance, 20);
    assert.deepEqual(result.closures_avoided, []);
  });

  test('returns NO_PATH when all paths to destination are closed', () => {
    const blockedEdges = sampleEdges.map((e) => {
      if ((e.from === 'N2' && e.to === 'N3') || (e.from === 'N4' && e.to === 'N3')) {
        return { ...e, closed: true };
      }
      return e;
    });

    const result = findRoute({
      nodes: sampleNodes,
      edges: blockedEdges,
      from: 'LOC-ENTRANCE',
      to: 'LOC-ROOM-A',
      at: '2026-10-25T10:00:00+07:00',
    });

    assert.deepEqual(result, {
      found: false,
      reason: 'NO_PATH',
    });
  });

  test('returns DESTINATION_CLOSED when destination node is closed', () => {
    const closedNodes = sampleNodes.map((n) => {
      if (n.node_id === 'N3') {
        return { ...n, closed: true, closed_reason: 'Exam in progress' };
      }
      return n;
    });

    const result = findRoute({
      nodes: closedNodes,
      edges: sampleEdges,
      from: 'LOC-ENTRANCE',
      to: 'LOC-ROOM-A',
      at: '2026-10-25T10:00:00+07:00',
    });

    assert.deepEqual(result, {
      found: false,
      reason: 'DESTINATION_CLOSED',
    });
  });

  test('returns ORIGIN_CLOSED when origin node is closed', () => {
    const closedNodes = sampleNodes.map((n) => {
      if (n.node_id === 'N1') {
        return { ...n, closed: true, closed_reason: 'Entrance blocked' };
      }
      return n;
    });

    const result = findRoute({
      nodes: closedNodes,
      edges: sampleEdges,
      from: 'LOC-ENTRANCE',
      to: 'LOC-ROOM-A',
      at: '2026-10-25T10:00:00+07:00',
    });

    assert.deepEqual(result, {
      found: false,
      reason: 'ORIGIN_CLOSED',
    });
  });

  test('returns UNKNOWN_LOCATION when from or to does not exist', () => {
    const resultUnknownFrom = findRoute({
      nodes: sampleNodes,
      edges: sampleEdges,
      from: 'NON_EXISTENT',
      to: 'LOC-ROOM-A',
      at: '2026-10-25T10:00:00+07:00',
    });
    assert.deepEqual(resultUnknownFrom, {
      found: false,
      reason: 'UNKNOWN_LOCATION',
    });

    const resultUnknownTo = findRoute({
      nodes: sampleNodes,
      edges: sampleEdges,
      from: 'LOC-ENTRANCE',
      to: 'NON_EXISTENT',
      at: '2026-10-25T10:00:00+07:00',
    });
    assert.deepEqual(resultUnknownTo, {
      found: false,
      reason: 'UNKNOWN_LOCATION',
    });
  });

  test('picks nearest door when room has multiple nodes', () => {
    const result = findRoute({
      nodes: sampleNodes,
      edges: sampleEdges,
      from: 'LOC-ROOM-A',
      to: 'LOC-ROOM-MULTI',
      at: '2026-10-25T10:00:00+07:00',
    });

    assert.equal(result.found, true);
    // N6_1 distance is 20, N6_2 distance is 40
    assert.equal(result.distance, 20);
    assert.equal(result.path[result.path.length - 1].node_id, 'N6_1');
  });

  test('resolves when from and to are same node', () => {
    const result = findRoute({
      nodes: sampleNodes,
      edges: sampleEdges,
      from: 'N1',
      to: 'N1',
      at: '2026-10-25T10:00:00+07:00',
    });

    assert.equal(result.found, true);
    assert.equal(result.distance, 0);
    assert.deepEqual(result.floors, [1]);
    assert.equal(result.path.length, 1);
    assert.equal(result.path[0].node_id, 'N1');
  });
});

describe('real LC3 graph topology route calculation', () => {
  const graphSourcePath = join(__dirname, '../../tools/data-extraction/lc3/source/graph.source.json');
  const graphData = JSON.parse(readFileSync(graphSourcePath, 'utf8'));

  // Transform graph data nodes and edges to match expected schema
  const nodes = graphData.nodes.map((n) => ({
    ...n,
    node_id: n.id,
    node_type: n.type,
    // Add location_id for room codes matching LC3-103, LC3-104, LC3-105, LC3-227
    location_id: n.name ? `LC3-${n.name}` : undefined,
  }));

  const nodesById = new Map(nodes.map((n) => [n.node_id, n]));

  // Simulate #143 extractor: calculate Euclidean distance for walking edges, keep internal 0-distance links
  const edges = graphData.edges.map((e) => {
    const fromNode = nodesById.get(e.from);
    const toNode = nodesById.get(e.to);
    const isInternalRoomLink =
      (e.from === 'LC3_124/2' && e.to === 'LC3_124/1') ||
      (e.from === 'LC3_124/1' && e.to === 'LC3_124/2');

    let dist = 0;
    if (!isInternalRoomLink && fromNode && toNode) {
      dist = Math.round(Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y));
    }

    return {
      ...e,
      distance: dist,
      element_id: `EDGE#${e.from}|${e.to}`,
    };
  });

  test('calculates route from building entrance LC3_entry_101 to all exam rooms', () => {
    const examRooms = ['103', '104', '105', '227'];

    for (const room of examRooms) {
      // Find matching room node in source graph
      const destNode = nodes.find((n) => n.name === room && n.node_type === 'room');
      assert.ok(destNode, `Room ${room} node should exist in graph`);

      const result = findRoute({
        nodes,
        edges,
        from: 'LC3_entry_101',
        to: destNode.node_id,
        at: new Date().toISOString(),
      });

      assert.equal(
        result.found,
        true,
        `Route from entrance to exam room ${room} should be found (got: ${JSON.stringify(result)})`
      );
      assert.ok(result.distance > 0, `Distance to room ${room} should be positive`);
      assert.ok(result.path.length >= 2, `Path to room ${room} should contain multiple nodes`);
      assert.equal(result.path[0].node_id, 'LC3_entry_101');
      assert.equal(result.path[result.path.length - 1].node_id, destNode.node_id);
    }
  });
});
