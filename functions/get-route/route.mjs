/**
 * Priority Queue (Min-Heap) implementation for Dijkstra's algorithm.
 */
class MinHeap {
  constructor() {
    this.heap = [];
  }

  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this._sinkDown(0);
    }
    return top;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _bubbleUp(index) {
    const item = this.heap[index];
    while (index > 0) {
      const parentIdx = (index - 1) >> 1;
      const parent = this.heap[parentIdx];
      if (item.dist >= parent.dist) break;
      this.heap[index] = parent;
      index = parentIdx;
    }
    this.heap[index] = item;
  }

  _sinkDown(index) {
    const length = this.heap.length;
    const item = this.heap[index];
    while (true) {
      const leftChildIdx = (index << 1) + 1;
      const rightChildIdx = leftChildIdx + 1;
      let swapIdx = null;

      if (leftChildIdx < length) {
        if (this.heap[leftChildIdx].dist < item.dist) {
          swapIdx = leftChildIdx;
        }
      }

      if (rightChildIdx < length) {
        if (
          (swapIdx === null && this.heap[rightChildIdx].dist < item.dist) ||
          (swapIdx !== null && this.heap[rightChildIdx].dist < this.heap[leftChildIdx].dist)
        ) {
          swapIdx = rightChildIdx;
        }
      }

      if (swapIdx === null) break;
      this.heap[index] = this.heap[swapIdx];
      index = swapIdx;
    }
    this.heap[index] = item;
  }
}

/**
 * Checks whether a graph element (node or edge) is actively closed at the given target time.
 * A closure is active when closed === true and target time is within [closed_from, closed_until].
 * Missing bounds are treated as unbounded.
 *
 * @param {object} element
 * @param {Date|string|number} at
 * @returns {boolean}
 */
export function isElementClosed(element, at) {
  if (!element || element.closed !== true) {
    return false;
  }

  const targetTime = at instanceof Date ? at.getTime() : new Date(at).getTime();

  if (element.closed_from) {
    const fromTime = new Date(element.closed_from).getTime();
    if (!isNaN(fromTime) && targetTime < fromTime) {
      return false;
    }
  }

  if (element.closed_until) {
    const untilTime = new Date(element.closed_until).getTime();
    if (!isNaN(untilTime) && targetTime > untilTime) {
      return false;
    }
  }

  return true;
}

/**
 * Resolves a given identifier (node_id or location_id) to matching graph nodes.
 *
 * @param {string} id
 * @param {Array<object>} nodes
 * @returns {Array<object>}
 */
function resolveNodes(id, nodes) {
  if (!id || typeof id !== 'string') return [];
  const trimmed = id.trim();
  if (!trimmed) return [];

  // Match by node_id first
  const byNodeId = nodes.filter((n) => n.node_id === trimmed);
  if (byNodeId.length > 0) return byNodeId;

  // Match by location_id
  const byLocationId = nodes.filter((n) => n.location_id === trimmed);
  if (byLocationId.length > 0) return byLocationId;

  return [];
}

/**
 * Computes an element ID for an edge if not already present.
 */
function getEdgeElementId(edge) {
  if (edge.element_id) return edge.element_id;
  return `EDGE#${edge.from}|${edge.to}`;
}

/**
 * Reconstructs path and traversed edges from Dijkstra predecessor map.
 */
function reconstructPath(endNodeId, prev, nodesById) {
  const path = [];
  const edges = [];
  let curr = endNodeId;

  while (curr) {
    path.unshift(nodesById.get(curr));
    const step = prev.get(curr);
    if (step && step.edge) {
      edges.unshift(step.edge);
      curr = step.nodeId;
    } else {
      break;
    }
  }

  return { path, edges };
}

/**
 * Runs Dijkstra's shortest path algorithm.
 *
 * @param {object} options
 * @param {Array<string>} options.startNodeIds
 * @param {Set<string>} options.destNodeIds
 * @param {Map<string, object>} options.nodesById
 * @param {Map<string, Array<object>>} options.adj
 * @param {boolean} options.avoidClosures
 * @param {Date|string|number} options.at
 * @param {Set<string>} [options.ignoredEdgeIds]
 * @returns {object|null}
 */
function runDijkstra({
  startNodeIds,
  destNodeIds,
  nodesById,
  adj,
  avoidClosures,
  at,
  ignoredEdgeIds = new Set(),
}) {
  const dist = new Map();
  const prev = new Map();
  const pq = new MinHeap();

  for (const startId of startNodeIds) {
    dist.set(startId, 0);
    pq.push({ id: startId, dist: 0 });
  }

  while (!pq.isEmpty()) {
    const { id, dist: currentDist } = pq.pop();

    if (currentDist > dist.get(id)) continue;

    if (destNodeIds.has(id)) {
      const { path, edges } = reconstructPath(id, prev, nodesById);
      return {
        endNodeId: id,
        distance: currentDist,
        path,
        edges,
      };
    }

    const neighbors = adj.get(id) || [];
    for (const neighbor of neighbors) {
      const edgeId = neighbor.elementId;
      if (ignoredEdgeIds.has(edgeId)) continue;

      if (avoidClosures && isElementClosed(neighbor.edge, at)) {
        continue;
      }

      const nextId = neighbor.to;
      const nextNode = nodesById.get(nextId);
      if (!nextNode) continue;

      // If next node is closed, we can't step into it (unless it's already an open destination)
      if (avoidClosures && !destNodeIds.has(nextId) && isElementClosed(nextNode, at)) {
        continue;
      }

      const newDist = currentDist + neighbor.distance;
      const existingDist = dist.has(nextId) ? dist.get(nextId) : Infinity;

      if (newDist < existingDist) {
        dist.set(nextId, newDist);
        prev.set(nextId, { nodeId: id, edge: neighbor.edge });
        pq.push({ id: nextId, dist: newDist });
      }
    }
  }

  return null;
}

/**
 * Calculates the shortest route avoiding closed edges and rooms.
 *
 * @param {object} params
 * @param {Array<object>} params.nodes - Array of graph node objects
 * @param {Array<object>} params.edges - Array of graph edge objects
 * @param {string} params.from - Start node_id or location_id
 * @param {string} params.to - Destination node_id or location_id
 * @param {Date|string|number} [params.at] - Evaluation timestamp
 * @returns {object}
 */
export function findRoute({ nodes = [], edges = [], from, to, at = new Date() }) {
  const targetDate = at instanceof Date ? at : new Date(at);

  const startNodes = resolveNodes(from, nodes);
  if (startNodes.length === 0) {
    return { found: false, reason: 'UNKNOWN_LOCATION' };
  }

  const destNodes = resolveNodes(to, nodes);
  if (destNodes.length === 0) {
    return { found: false, reason: 'UNKNOWN_LOCATION' };
  }

  // Check if all candidate start nodes are closed
  const openStartNodes = startNodes.filter((n) => !isElementClosed(n, targetDate));
  if (openStartNodes.length === 0) {
    return { found: false, reason: 'ORIGIN_CLOSED' };
  }

  // Check if all candidate destination nodes are closed
  const openDestNodes = destNodes.filter((n) => !isElementClosed(n, targetDate));
  if (openDestNodes.length === 0) {
    return { found: false, reason: 'DESTINATION_CLOSED' };
  }

  // Check trivial case: start and destination overlap
  const destNodeIdSet = new Set(openDestNodes.map((n) => n.node_id));
  const overlappingNode = openStartNodes.find((n) => destNodeIdSet.has(n.node_id));
  if (overlappingNode) {
    return {
      found: true,
      distance: 0,
      floors: [overlappingNode.floor],
      path: [
        {
          node_id: overlappingNode.node_id,
          floor: overlappingNode.floor,
          x: overlappingNode.x,
          y: overlappingNode.y,
          ...(overlappingNode.location_id ? { location_id: overlappingNode.location_id } : {}),
        },
      ],
      closures_avoided: [],
    };
  }

  // Build graph indexing
  const nodesById = new Map();
  for (const node of nodes) {
    nodesById.set(node.node_id, node);
  }

  const adj = new Map();
  for (const node of nodes) {
    adj.set(node.node_id, []);
  }

  for (const edge of edges) {
    if (!edge.from || !edge.to) continue;
    const distance = Math.max(0, Number(edge.distance) >= 0 ? Number(edge.distance) : 0);
    const elementId = getEdgeElementId(edge);

    if (adj.has(edge.from)) {
      adj.get(edge.from).push({
        to: edge.to,
        distance,
        edge,
        elementId,
      });
    }

    if (adj.has(edge.to)) {
      adj.get(edge.to).push({
        to: edge.from,
        distance,
        edge,
        elementId,
      });
    }
  }

  const startNodeIds = openStartNodes.map((n) => n.node_id);

  // 1. Run constrained Dijkstra (respecting closures)
  const constrainedResult = runDijkstra({
    startNodeIds,
    destNodeIds: destNodeIdSet,
    nodesById,
    adj,
    avoidClosures: true,
    at: targetDate,
  });

  if (!constrainedResult) {
    return { found: false, reason: 'NO_PATH' };
  }

  // 2. Identify closures avoided
  // We discover which closed elements forced a longer path or detour
  const closuresAvoidedMap = new Map();
  const ignoredEdgeIds = new Set();

  // Run unconstrained Dijkstra in a loop to collect closed edges/nodes on paths shorter than constrained distance
  let searchLimit = 20; // safety ceiling to prevent infinite loops
  while (searchLimit-- > 0) {
    const unconstrained = runDijkstra({
      startNodeIds: startNodes.map((n) => n.node_id),
      destNodeIds: new Set(destNodes.map((n) => n.node_id)),
      nodesById,
      adj,
      avoidClosures: false,
      at: targetDate,
      ignoredEdgeIds,
    });

    if (!unconstrained || unconstrained.distance >= constrainedResult.distance) {
      break;
    }

    let closedFoundOnPath = false;

    // Check edges on unconstrained path
    for (const edge of unconstrained.edges) {
      if (isElementClosed(edge, targetDate)) {
        const edgeId = getEdgeElementId(edge);
        if (!closuresAvoidedMap.has(edgeId)) {
          closuresAvoidedMap.set(edgeId, {
            element_id: edgeId,
            ...(edge.closed_reason ? { reason: edge.closed_reason } : {}),
          });
        }
        ignoredEdgeIds.add(edgeId);
        closedFoundOnPath = true;
      }
    }

    // Check intermediate nodes on unconstrained path
    for (let i = 1; i < unconstrained.path.length - 1; i++) {
      const node = unconstrained.path[i];
      if (isElementClosed(node, targetDate)) {
        const nodeId = node.element_id || `NODE#${node.node_id}`;
        if (!closuresAvoidedMap.has(nodeId)) {
          closuresAvoidedMap.set(nodeId, {
            element_id: nodeId,
            ...(node.closed_reason ? { reason: node.closed_reason } : {}),
          });
        }
        closedFoundOnPath = true;
      }
    }

    // If no closed element was on this unconstrained path, stop search
    if (!closedFoundOnPath) {
      break;
    }
  }

  // Format path response
  const path = constrainedResult.path.map((node) => ({
    node_id: node.node_id,
    floor: node.floor,
    x: node.x,
    y: node.y,
    ...(node.location_id ? { location_id: node.location_id } : {}),
  }));

  // Distinct floors visited in order of appearance
  const floors = [];
  for (const node of constrainedResult.path) {
    if (!floors.includes(node.floor)) {
      floors.push(node.floor);
    }
  }

  return {
    found: true,
    distance: constrainedResult.distance,
    floors,
    path,
    closures_avoided: Array.from(closuresAvoidedMap.values()),
  };
}
