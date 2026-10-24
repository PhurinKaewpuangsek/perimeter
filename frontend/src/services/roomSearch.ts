/**
 * Room search for the "ย้ายไปห้อง" field in the Staff Console (#153).
 * Pure functions so they can be tested without rendering.
 */
import type { Room } from '../types/room'

/** Lowercase and drop spaces / dashes / dots so "lc3 105", "LC3-105" and "lc3105" compare equal. */
function normalize(text: string | undefined): string {
  return (text ?? '').toLowerCase().replace(/[\s\-_.]/g, '')
}

/**
 * How closely a room matches what was typed; lower is closer, null = no match.
 * 0 exact room number or code, 1 number/code starts with it, 2 code contains it,
 * 3 Thai name contains it.
 */
export function roomMatchRank(room: Room, query: string): number | null {
  const q = normalize(query)
  if (!q) return 0
  const number = normalize(room.roomNumber)
  const code = normalize(room.code)
  if (number === q || code === q) return 0
  if (number.startsWith(q) || code.startsWith(q)) return 1
  if (code.includes(q)) return 2
  if (normalize(room.nameThai).includes(q)) return 3
  return null
}

/** Rooms that match the query, closest first; ties keep the given (code) order. */
export function searchRooms(rooms: Room[], query: string): Room[] {
  if (!query.trim()) return rooms
  return rooms
    .map((room, order) => ({ room, order, rank: roomMatchRank(room, query) }))
    .filter((m): m is { room: Room; order: number; rank: number } => m.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((m) => m.room)
}

/** e.g. "LC3-105 · ห้องบรรยายเรียนรวม" */
export function roomOptionLabel(room: Room): string {
  return room.nameThai ? `${room.code} · ${room.nameThai}` : room.code
}
