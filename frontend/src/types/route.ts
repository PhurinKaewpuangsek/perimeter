/** Why GET /api/route returned `found: false` (contract from #144). */
export type RouteFailureReason = 'NO_PATH' | 'DESTINATION_CLOSED' | 'ORIGIN_CLOSED' | 'UNKNOWN_LOCATION'

/** One graph node on the route. x/y are SVG coordinates of that floor, like `Room.coordinates`. */
export interface RoutePoint {
  nodeId: string
  floor: number
  x: number
  y: number
  locationId?: string
}

/** A closed node or edge the route had to go around. */
export interface RouteClosure {
  elementId: string
  reason?: string
}

export interface FoundRoute {
  found: true
  distance: number
  /** Floors in the order the route visits them. */
  floors: number[]
  path: RoutePoint[]
  closuresAvoided: RouteClosure[]
}

export interface MissingRoute {
  found: false
  reason: RouteFailureReason
}

export type RouteResult = FoundRoute | MissingRoute

export interface RawRoutePoint {
  node_id?: string
  floor?: number | string
  x?: number | string
  y?: number | string
  location_id?: string
}

export interface RawRouteResponse {
  found?: boolean
  distance?: number
  floors?: unknown[]
  path?: RawRoutePoint[]
  closures_avoided?: { element_id?: string; reason?: string }[]
  reason?: string
}
