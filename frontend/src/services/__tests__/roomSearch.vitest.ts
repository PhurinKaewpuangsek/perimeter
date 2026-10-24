import { describe, it, expect } from 'vitest'
import { roomMatchRank, searchRooms } from '../roomSearch'
import type { Room } from '../../types/room'

function room(code: string, nameThai = ''): Room {
  return {
    id: code,
    code,
    roomNumber: code.slice(code.indexOf('-') + 1),
    nameThai,
    floor: 1,
    building: 'LC3',
    category: 'lecture_room',
    coordinates: { x: 0, y: 0 },
    landmarks: [],
    aliases: [],
  }
}

const rooms = [
  room('LC3-101', 'ห้องบรรยาย'),
  room('LC3-104', 'ห้องบรรยาย'),
  room('LC3-104/1', 'ห้องนักศึกษา'),
  room('LC3-105', 'ห้องบรรยาย'),
  room('LC3-1105', 'ห้องประชุม'),
  room('LC3-210', 'ห้องปฏิบัติการ'),
]
const codes = (list: Room[]) => list.map((r) => r.code)

describe('searchRooms (closest match first)', () => {
  it('puts the exact room number first, then rooms that start with it', () => {
    expect(codes(searchRooms(rooms, '104'))).toEqual(['LC3-104', 'LC3-104/1'])
    expect(codes(searchRooms(rooms, '105'))).toEqual(['LC3-105', 'LC3-1105'])
  })

  it('treats "lc3 105", "LC3-105" and "lc3105" the same', () => {
    for (const q of ['lc3 105', 'LC3-105', 'lc3105']) {
      expect(codes(searchRooms(rooms, q))[0]).toBe('LC3-105')
    }
  })

  it('ranks partial code matches before Thai-name matches', () => {
    expect(roomMatchRank(room('LC3-210'), '10')).toBe(2)
    expect(roomMatchRank(room('LC3-210', 'ห้องปฏิบัติการ'), 'ปฏิบัติ')).toBe(3)
    expect(codes(searchRooms(rooms, 'ปฏิบัติ'))).toEqual(['LC3-210'])
  })

  it('returns every room for an empty query and none for no match', () => {
    expect(searchRooms(rooms, '  ')).toHaveLength(rooms.length)
    expect(searchRooms(rooms, '999')).toEqual([])
  })
})
