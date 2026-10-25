import { describe, it, expect } from 'vitest'
import type { Room } from '../../types/room'
import type { Graph } from '../../types/graph'
import {
  buildWalkways,
  formatWindow,
  fromBangkokInputValue,
  listClosures,
  roomNodeFor,
  searchWalkways,
  toBangkokInputValue,
  windowError,
} from '../closureModel'

const room = (id: string, code: string, roomNumber: string, floor: number, x: number, y: number): Room => ({
  id,
  code,
  roomNumber,
  nameThai: `ห้องบรรยาย ${roomNumber}`,
  building: 'LC3',
  floor,
  category: 'lecture_room',
  coordinates: { x, y },
  landmarks: [],
  aliases: [],
})

const rooms = [
  room('LC3-F1-R104', 'LC3-104', '104', 1, 100, 100),
  room('LC3-F1-R105', 'LC3-105', '105', 1, 300, 100),
  room('LC3-F2-R201', 'LC3-201', '201', 2, 100, 100),
]

const node = (nodeId: string, floor: number, x: number, y: number, extra = {}) => ({
  elementId: `NODE#${nodeId}`,
  nodeId,
  floor,
  x,
  y,
  nodeType: 'junction',
  closed: false,
  ...extra,
})

const graph: Graph = {
  graphId: 'LC3',
  nodes: [
    node('LC3_104', 1, 100, 110, { nodeType: 'room', locationId: 'LC3-F1-R104' }),
    node('LC3_105', 1, 300, 110, { nodeType: 'room', locationId: 'LC3-F1-R105' }),
    node('J1', 1, 105, 150),
    node('J2', 1, 295, 150),
    node('S1', 1, 110, 160),
    node('S2', 2, 110, 160),
  ],
  edges: [
    { elementId: 'EDGE#J1|J2', from: 'J1', to: 'J2', edgeType: 'walk', distance: 190, closed: false },
    {
      elementId: 'EDGE#LC3_104|J1',
      from: 'LC3_104',
      to: 'J1',
      edgeType: 'walk',
      distance: 40,
      closed: true,
      closedUntil: '2026-10-29T12:00:00+07:00',
      closedReason: 'ซ่อมพื้น',
    },
    { elementId: 'EDGE#S1|S2', from: 'S1', to: 'S2', edgeType: 'stairs', distance: 150, closed: false },
  ],
}

describe('buildWalkways', () => {
  it('names each walkway after the nearest rooms on that floor', () => {
    const labels = Object.fromEntries(buildWalkways(graph, rooms, 1).map((w) => [w.elementId, w.label]))
    expect(labels['EDGE#J1|J2']).toBe('ทางเดิน ห้อง 104 ↔ ห้อง 105')
    expect(labels['EDGE#LC3_104|J1']).toBe('ทางเดินหน้าห้อง 104')
    expect(labels['EDGE#S1|S2']).toBe('บันไดระหว่างชั้น 1 ↔ 2 (ใกล้ห้อง 104)')
  })

  it('numbers walkways that would otherwise share a label, left to right', () => {
    const g: Graph = {
      ...graph,
      nodes: [...graph.nodes, node('J3', 1, 90, 150)],
      edges: [...graph.edges, { elementId: 'EDGE#J3|LC3_104', from: 'J3', to: 'LC3_104', edgeType: 'walk', distance: 40, closed: false }],
    }
    const labels = Object.fromEntries(buildWalkways(g, rooms, 1).map((w) => [w.elementId, w.label]))
    expect(labels['EDGE#J3|LC3_104']).toBe('ทางเดินหน้าห้อง 104 · ช่วง 1')
    expect(labels['EDGE#LC3_104|J1']).toBe('ทางเดินหน้าห้อง 104 · ช่วง 2')
    expect(labels['EDGE#J1|J2']).toBe('ทางเดิน ห้อง 104 ↔ ห้อง 105')
  })

  it('lists stairs on both floors and only same-floor walkways per floor', () => {
    expect(buildWalkways(graph, rooms, 2).map((w) => w.elementId)).toEqual(['EDGE#S1|S2'])
    expect(buildWalkways(graph, rooms, 2)[0].label).toBe('บันไดระหว่างชั้น 1 ↔ 2 (ใกล้ห้อง 201)')
  })

  it('carries map coordinates and the closure', () => {
    const w = buildWalkways(graph, rooms, 1).find((x) => x.elementId === 'EDGE#LC3_104|J1')!
    expect([w.x1, w.y1, w.x2, w.y2]).toEqual([100, 110, 105, 150])
    expect(w.closure).toEqual({ closed: true, closedUntil: '2026-10-29T12:00:00+07:00', closedReason: 'ซ่อมพื้น' })
  })
})

describe('searchWalkways', () => {
  it('matches room numbers, codes and Thai names nearby', () => {
    const all = buildWalkways(graph, rooms, 1)
    expect(searchWalkways(all, '105').map((w) => w.elementId)).toEqual(['EDGE#J1|J2'])
    expect(searchWalkways(all, 'lc3-104')).toHaveLength(3)
    expect(searchWalkways(all, '')).toHaveLength(3)
    expect(searchWalkways(all, '999')).toHaveLength(0)
  })
})

describe('roomNodeFor', () => {
  it('links a room to its node through location_id', () => {
    expect(roomNodeFor(graph, rooms[1])?.elementId).toBe('NODE#LC3_105')
    expect(roomNodeFor(graph, rooms[2])).toBeUndefined()
  })
})

describe('listClosures', () => {
  const g: Graph = {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.nodeId === 'LC3_105' ? { ...n, closed: true, closedFrom: '2026-11-01T08:00:00+07:00' } : n,
    ),
  }

  it('lists rooms first, then walkways, marking what is closed right now', () => {
    const items = listClosures(g, rooms, new Date('2026-10-29T10:00:00+07:00'))
    expect(items.map((i) => [i.kind, i.label, i.activeNow])).toEqual([
      ['room', 'ห้อง 105 · LC3-105', false],
      ['walkway', 'ทางเดินหน้าห้อง 104', true],
    ])
  })

  it('drops closures that have ended', () => {
    const items = listClosures(g, rooms, new Date('2026-10-30T10:00:00+07:00'))
    expect(items.map((i) => i.elementId)).toEqual(['NODE#LC3_105'])
  })
})

describe('Bangkok time helpers', () => {
  it('round-trips a datetime-local value with +07:00', () => {
    expect(toBangkokInputValue(new Date('2026-10-29T01:30:00Z'))).toBe('2026-10-29T08:30')
    expect(fromBangkokInputValue('2026-10-29T08:30')).toBe('2026-10-29T08:30:00+07:00')
    expect(fromBangkokInputValue('')).toBeUndefined()
  })

  it('describes a window', () => {
    expect(formatWindow({ closed: true })).toBe('จนกว่าจะเปิด')
    expect(formatWindow({ closed: true, closedFrom: '2026-10-29T08:00:00+07:00' })).toMatch(/^ตั้งแต่ .*08:00 จนกว่าจะเปิด$/)
    expect(
      formatWindow({ closed: true, closedFrom: '2026-10-29T08:00:00+07:00', closedUntil: '2026-10-29T12:00:00+07:00' }),
    ).toMatch(/08:00 – .*12:00$/)
  })

  it('checks the window before sending', () => {
    const now = new Date('2026-10-29T09:00:00+07:00')
    expect(windowError('2026-10-29T12:00:00+07:00', '2026-10-29T08:00:00+07:00', now)).toBe('เวลาเริ่มต้องไม่หลังเวลาสิ้นสุด')
    expect(windowError(undefined, '2025-10-29T12:00:00+07:00', now)).toBe('เวลาสิ้นสุดผ่านไปแล้ว กรุณาตรวจวันที่')
    expect(windowError('2026-10-29T08:00:00+07:00', '2026-10-29T12:00:00+07:00', now)).toBeNull()
  })
})
