import type {
  Closure,
  Graph,
  GraphDataResponse,
  GraphEdge,
  GraphNode,
  RawClosureFields,
  RawGraphEdge,
  RawGraphNode,
} from '../types/graph.ts'

/**
 * Base URL of the deployed API Gateway stage, from VITE_API_BASE_URL.
 * `import.meta.env` is optional-chained so this module also runs under plain `node --test`.
 */
const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export const GRAPH_ENDPOINT = `${API_BASE_URL}/api/graph`

function toNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeClosure(raw: RawClosureFields): Closure {
  return {
    closed: raw.closed === true,
    ...(raw.closed_from ? { closedFrom: raw.closed_from } : {}),
    ...(raw.closed_until ? { closedUntil: raw.closed_until } : {}),
    ...(raw.closed_reason ? { closedReason: raw.closed_reason } : {}),
  }
}

export function normalizeNode(raw: RawGraphNode): GraphNode {
  return {
    elementId: text(raw.element_id),
    nodeId: text(raw.node_id),
    floor: toNumber(raw.floor),
    x: toNumber(raw.x),
    y: toNumber(raw.y),
    nodeType: text(raw.node_type),
    ...(raw.location_id ? { locationId: raw.location_id } : {}),
    ...normalizeClosure(raw),
  }
}

export function normalizeEdge(raw: RawGraphEdge): GraphEdge {
  return {
    elementId: text(raw.element_id),
    from: text(raw.from),
    to: text(raw.to),
    edgeType: text(raw.edge_type),
    distance: toNumber(raw.distance),
    ...normalizeClosure(raw),
  }
}

/** GET /api/graph — the whole LC3 routing graph with each element's closure. */
export async function getGraph(): Promise<Graph> {
  const response = await fetch(GRAPH_ENDPOINT || '/api/graph', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch graph: ${response.status} ${response.statusText}`)
  }

  const data: GraphDataResponse = await response.json()
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Invalid graph data format: expected "nodes" and "edges" arrays')
  }

  return {
    graphId: text(data.graph_id),
    nodes: data.nodes.map(normalizeNode),
    edges: data.edges.map(normalizeEdge),
  }
}

/**
 * True when the closure blocks the element at `at`. Same rule as `isElementClosed` in
 * functions/get-route/route.mjs, so the map and the route API agree: closed must be true
 * and `at` inside [closedFrom, closedUntil]; a missing bound is open-ended.
 */
export function isClosedAt(closure: Closure, at: Date = new Date()): boolean {
  if (closure.closed !== true) return false
  const t = at.getTime()
  if (closure.closedFrom) {
    const from = new Date(closure.closedFrom).getTime()
    if (!Number.isNaN(from) && t < from) return false
  }
  if (closure.closedUntil) {
    const until = new Date(closure.closedUntil).getTime()
    if (!Number.isNaN(until) && t > until) return false
  }
  return true
}

/**
 * True for a closure staff still need to see: active now, or scheduled to start later.
 * A closure whose window has already ended is no longer listed.
 */
export function isClosureCurrentOrUpcoming(closure: Closure, at: Date = new Date()): boolean {
  if (closure.closed !== true) return false
  if (!closure.closedUntil) return true
  const until = new Date(closure.closedUntil).getTime()
  return Number.isNaN(until) || at.getTime() <= until
}
