/**
 * Routing graph types (#143, #147). Vocabulary from CONTEXT.md: a Graph Node is a room
 * entrance, junction or stairs landing; a Graph Edge is a walkway between two nodes; a
 * Closure marks either one impassable for an Availability Window.
 */

/** A staff closure. A node or edge without `closed: true` is open. */
export interface Closure {
  closed: boolean
  /** ISO-8601 with offset, e.g. 2026-10-29T08:00:00+07:00. Missing = closed from now. */
  closedFrom?: string
  /** ISO-8601 with offset. Missing = closed until staff open it again. */
  closedUntil?: string
  closedReason?: string
}

export type NodeType = 'room' | 'junction' | 'entrance' | 'facility' | 'stairs' | string
export type EdgeType = 'walk' | 'up' | 'stairs' | string

export interface GraphNode extends Closure {
  /** `NODE#<node_id>`, the key PUT /api/graph/closures takes. */
  elementId: string
  nodeId: string
  floor: number
  x: number
  y: number
  nodeType: NodeType
  /** SmartFacultyLocations id when the node is a room, toilet or stairwell. */
  locationId?: string
}

export interface GraphEdge extends Closure {
  /** `EDGE#<from>|<to>`; may contain `/` (e.g. LC3_124/2), so it is never put in a URL path. */
  elementId: string
  from: string
  to: string
  edgeType: EdgeType
  distance: number
}

export interface Graph {
  graphId: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** Closure fields as GET /api/graph returns them. */
export interface RawClosureFields {
  closed?: boolean
  closed_from?: string
  closed_until?: string
  closed_reason?: string
}

export interface RawGraphNode extends RawClosureFields {
  graph_id?: string
  element_id?: string
  node_id?: string
  floor?: number | string
  x?: number | string
  y?: number | string
  node_type?: string
  location_id?: string
}

export interface RawGraphEdge extends RawClosureFields {
  graph_id?: string
  element_id?: string
  from?: string
  to?: string
  edge_type?: string
  distance?: number | string
}

export interface GraphDataResponse {
  graph_id?: string
  nodes?: RawGraphNode[]
  edges?: RawGraphEdge[]
}

/** One change sent to PUT /api/graph/closures. */
export interface ClosureChange {
  element_id: string
  closed: boolean
  closed_from?: string
  closed_until?: string
  closed_reason?: string
}
