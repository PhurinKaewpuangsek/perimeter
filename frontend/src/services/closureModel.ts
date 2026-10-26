/**
 * Pure helpers for the staff closure tab (#147): readable walkway labels, Bangkok time
 * conversion, and the list of current/upcoming closures. No React, so it is unit tested.
 */
import type { Room } from '../types/room'
import type { Closure, Graph, GraphEdge, GraphNode } from '../types/graph'
import { isClosedAt, isClosureCurrentOrUpcoming } from './graphService'

/** LC3 is in Bangkok; every closure the tab writes uses this offset. */
export const BANGKOK_OFFSET = '+07:00'
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

/** A walkway (edge) the staff can pick, with a label made from the rooms beside it. */
export interface Walkway {
  elementId: string
  floor: number
  label: string
  /** Lower-case text the search box matches: room numbers, codes and Thai names nearby. */
  searchText: string
  x1: number
  y1: number
  x2: number
  y2: number
  closure: Closure
}

/** A closure to show in the "closed now / scheduled" list. */
export interface ClosureListItem {
  elementId: string
  kind: 'room' | 'walkway'
  label: string
  floor: number
  closure: Closure
  activeNow: boolean
}

function roomShortName(room: Room): string {
  return room.roomNumber ? `ห้อง ${room.roomNumber}` : room.nameThai || room.code
}

/** The nearest room (by its map pin) to a point on the same floor. */
function nearestRoom(rooms: Room[], floor: number, x: number, y: number): Room | null {
  let best: Room | null = null
  let bestDistance = Infinity
  for (const room of rooms) {
    if (room.floor !== floor || !room.code) continue
    const d = (room.coordinates.x - x) ** 2 + (room.coordinates.y - y) ** 2
    if (d < bestDistance) {
      bestDistance = d
      best = room
    }
  }
  return best
}

/**
 * Every walkway on `floor` with a label staff can read, e.g. "ทางเดิน ห้อง 104 ↔ ห้อง 105".
 * Staff do not know node ids, so each end is named after the nearest room pin. Stairs edges
 * join two floors, so they are listed on both, named after their stairwell.
 */
export function buildWalkways(graph: Graph, rooms: Room[], floor: number): Walkway[] {
  const nodes = new Map(graph.nodes.map((n) => [n.nodeId, n]))
  const result: Walkway[] = []

  for (const edge of graph.edges) {
    const a = nodes.get(edge.from)
    const b = nodes.get(edge.to)
    if (!a || !b) continue
    if (a.floor !== floor && b.floor !== floor) continue

    let label: string
    let near: Room[]
    if (a.floor !== b.floor) {
      const here = a.floor === floor ? a : b
      const room = nearestRoom(rooms, here.floor, here.x, here.y)
      near = room ? [room] : []
      label = `บันไดระหว่างชั้น ${Math.min(a.floor, b.floor)} ↔ ${Math.max(a.floor, b.floor)}${room ? ` (ใกล้${roomShortName(room)})` : ''}`
    } else {
      const ra = nearestRoom(rooms, a.floor, a.x, a.y)
      const rb = nearestRoom(rooms, b.floor, b.x, b.y)
      near = [ra, rb].filter((r): r is Room => r !== null)
      if (ra && rb && ra.id !== rb.id) {
        label = `ทางเดิน ${roomShortName(ra)} ↔ ${roomShortName(rb)}`
      } else if (ra ?? rb) {
        label = `ทางเดินหน้า${roomShortName((ra ?? rb) as Room)}`
      } else {
        label = 'ทางเดิน'
      }
    }

    // Draw on this floor: for a stairs edge both ends are drawn at the end on this floor.
    const here = a.floor === floor ? a : b
    const there = a.floor === b.floor ? b : here
    result.push({
      elementId: edge.elementId,
      floor,
      label,
      searchText: [label, ...near.flatMap((r) => [r.roomNumber, r.code, r.nameThai])].join(' ').toLowerCase(),
      x1: here.x,
      y1: here.y,
      x2: there.x,
      y2: there.y,
      closure: closureOf(edge),
    })
  }

  // Several walkways can share the same nearest rooms. Number them along the floor plan
  // (left to right, then top to bottom) so each list entry is distinct; hovering one also
  // previews it on the map.
  const byLabel = new Map<string, Walkway[]>()
  for (const w of result) byLabel.set(w.label, [...(byLabel.get(w.label) ?? []), w])
  for (const group of byLabel.values()) {
    if (group.length < 2) continue
    group
      .sort((p, q) => (p.x1 + p.x2) - (q.x1 + q.x2) || (p.y1 + p.y2) - (q.y1 + q.y2))
      .forEach((w, i) => {
        w.label = `${w.label} · ช่วง ${i + 1}`
      })
  }

  return result.sort((p, q) => p.label.localeCompare(q.label, 'th', { numeric: true }))
}

/** Walkways whose label or nearby rooms match what was typed (all of them when blank). */
export function searchWalkways(walkways: Walkway[], query: string): Walkway[] {
  const q = query.trim().toLowerCase()
  if (!q) return walkways
  return walkways.filter((w) => w.searchText.includes(q))
}

/** The graph node of a room, linked through location_id (Room.id). */
export function roomNodeFor(graph: Graph, room: Room): GraphNode | undefined {
  return graph.nodes.find((n) => n.locationId === room.id)
}

function closureOf(element: Closure): Closure {
  return {
    closed: element.closed,
    ...(element.closedFrom ? { closedFrom: element.closedFrom } : {}),
    ...(element.closedUntil ? { closedUntil: element.closedUntil } : {}),
    ...(element.closedReason ? { closedReason: element.closedReason } : {}),
  }
}

/**
 * Every closure staff still need to see (active now or scheduled), rooms first.
 * Ended closures are left out: they no longer block anything.
 */
export function listClosures(graph: Graph, rooms: Room[], now: Date = new Date()): ClosureListItem[] {
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const items: ClosureListItem[] = []

  for (const node of graph.nodes) {
    if (!isClosureCurrentOrUpcoming(node, now)) continue
    const room = node.locationId ? roomById.get(node.locationId) : undefined
    items.push({
      elementId: node.elementId,
      kind: 'room',
      label: room ? `${roomShortName(room)} · ${room.code}` : node.nodeId,
      floor: node.floor,
      closure: closureOf(node),
      activeNow: isClosedAt(node, now),
    })
  }

  const edgesClosed = graph.edges.filter((e: GraphEdge) => isClosureCurrentOrUpcoming(e, now))
  for (const floor of [...new Set(edgesClosed.map((e) => floorOfEdge(graph, e)))]) {
    const labels = new Map(buildWalkways(graph, rooms, floor).map((w) => [w.elementId, w.label]))
    for (const edge of edgesClosed.filter((e) => floorOfEdge(graph, e) === floor)) {
      items.push({
        elementId: edge.elementId,
        kind: 'walkway',
        label: labels.get(edge.elementId) ?? edge.elementId,
        floor,
        closure: closureOf(edge),
        activeNow: isClosedAt(edge, now),
      })
    }
  }

  return items.sort((p, q) => (p.kind === q.kind ? p.label.localeCompare(q.label, 'th') : p.kind === 'room' ? -1 : 1))
}

/**
 * Rooms whose graph node is closed at `now`, keyed by Room.id, for the public map (#147).
 * A closure that starts later or has ended is left out, matching the route API.
 */
export function activeRoomClosures(graph: Graph | null, now: Date = new Date()): Map<string, Closure> {
  const closures = new Map<string, Closure>()
  if (!graph) return closures
  for (const node of graph.nodes) {
    if (node.locationId && isClosedAt(node, now)) closures.set(node.locationId, closureOf(node))
  }
  return closures
}

function floorOfEdge(graph: Graph, edge: GraphEdge): number {
  return graph.nodes.find((n) => n.nodeId === edge.from)?.floor ?? 1
}

/** Value for an <input type="datetime-local"> showing `date` in Bangkok time. */
export function toBangkokInputValue(date: Date): string {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 16)
}

/** "2026-10-29T08:00" from a datetime-local input → "2026-10-29T08:00:00+07:00"; '' → undefined. */
export function fromBangkokInputValue(value: string): string | undefined {
  if (!value) return undefined
  return `${value.length === 16 ? `${value}:00` : value}${BANGKOK_OFFSET}`
}

/** "29 ต.ค. 2569 08:00" in Bangkok time. */
export function formatBangkok(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** "29 ต.ค. 2569 08:00 – 12:00", "ตั้งแต่ …", "ถึง …" or "จนกว่าจะเปิด". */
export function formatWindow(closure: Closure): string {
  const { closedFrom, closedUntil } = closure
  if (closedFrom && closedUntil) return `${formatBangkok(closedFrom)} – ${formatBangkok(closedUntil)}`
  if (closedFrom) return `ตั้งแต่ ${formatBangkok(closedFrom)} จนกว่าจะเปิด`
  if (closedUntil) return `ถึง ${formatBangkok(closedUntil)}`
  return 'จนกว่าจะเปิด'
}

/**
 * Checks a closure window entered in the form before it is sent. Returns a Thai message
 * or null. The Lambda checks the same rules; this only saves a round trip.
 */
export function windowError(fromIso: string | undefined, untilIso: string | undefined, now: Date = new Date()): string | null {
  const from = fromIso ? new Date(fromIso).getTime() : undefined
  const until = untilIso ? new Date(untilIso).getTime() : undefined
  if (from !== undefined && until !== undefined && from > until) return 'เวลาเริ่มต้องไม่หลังเวลาสิ้นสุด'
  if (until !== undefined && until < now.getTime()) return 'เวลาสิ้นสุดผ่านไปแล้ว กรุณาตรวจวันที่'
  return null
}
