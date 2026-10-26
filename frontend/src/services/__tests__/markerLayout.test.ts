import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  estimateLabelWidth,
  getMarkerLabel,
  getMarkerText,
  getMarkerPriority,
  layoutMarkers,
} from '../markerLayout.ts'
import type { Room } from '../../types/room.ts'

function makeRoom(id: string, x: number, y: number, overrides: Partial<Room> = {}): Room {
  return {
    id,
    code: `LC3-${id}`,
    nameThai: `ห้อง ${id}`,
    building: 'LC3',
    floor: 1,
    roomNumber: id,
    category: 'lecture_room',
    coordinates: { x, y },
    landmarks: [],
    aliases: [],
    ...overrides,
  }
}

describe('getMarkerLabel', () => {
  it('ใช้เลขห้อง เพราะนักศึกษาเดินหาห้องจากเลขหน้าประตู', () => {
    assert.equal(getMarkerLabel({ roomNumber: '101/1', nameThai: 'ห้องบรรยาย 4', code: 'LC3-101/1' }), '101/1')
  })

  it('POI ที่ไม่มีเลขห้องใช้ชื่อสั้น ตัดวงเล็บออก', () => {
    assert.equal(getMarkerLabel({ roomNumber: '', nameThai: 'ห้องน้ำหญิง (ฝั่งซ้าย)', code: '' }), 'ห้องน้ำหญิง')
    assert.equal(getMarkerLabel({ roomNumber: '', nameThai: 'บันได 1', code: '' }), 'บันได 1')
  })

  it('ไม่มีทั้งเลขห้องและชื่อ ใช้ code แทน', () => {
    assert.equal(getMarkerLabel({ roomNumber: '', nameThai: '', code: 'LC3-X' }), 'LC3-X')
  })
})

describe('getMarkerText', () => {
  it('ห้องที่ปิดอยู่ต่อท้ายป้ายด้วย "ปิดชั่วคราว" (#147)', () => {
    assert.equal(getMarkerText(makeRoom('105', 0, 0)), '105')
    assert.equal(getMarkerText(makeRoom('105', 0, 0), true), '105 · ปิดชั่วคราว')
  })
})

describe('getMarkerPriority', () => {
  it('ห้องน้ำ/บันได สำคัญกว่าห้องบรรยาย ซึ่งสำคัญกว่าห้องพักอาจารย์', () => {
    assert.ok(getMarkerPriority({ category: 'toilet' }) > getMarkerPriority({ category: 'lecture_room' }))
    assert.ok(getMarkerPriority({ category: 'lecture_room' }) > getMarkerPriority({ category: 'faculty_office' }))
    assert.ok(getMarkerPriority({ category: 'faculty_office' }) > getMarkerPriority({ category: 'unknown' }))
  })
})

describe('estimateLabelWidth', () => {
  it('สระและวรรณยุกต์ไทยที่ซ้อนบนตัวอักษรไม่นับความกว้าง', () => {
    // "ที่" is 3 code points: one base glyph with a vowel and a tone mark stacked on it.
    assert.equal(estimateLabelWidth('ที่'), estimateLabelWidth('ท'))
    // Spacing vowels such as ำ do take width.
    assert.ok(estimateLabelWidth('น้ำ') > estimateLabelWidth('น'))
  })
})

describe('layoutMarkers', () => {
  it('ห้องที่อยู่ห่างกันได้วงกลมเต็มพร้อมป้ายชื่อทั้งคู่', () => {
    const rooms = [makeRoom('101', 100, 100), makeRoom('102', 600, 400)]
    const layout = layoutMarkers({ rooms, scale: 1, selectedRoomId: null })

    assert.deepEqual(layout.get('101'), { mode: 'badge', label: 'right' })
    assert.deepEqual(layout.get('102'), { mode: 'badge', label: 'right' })
  })

  it('ห้องที่ชนกันตอนซูมออก ห้องสำคัญน้อยกว่ายุบเป็นจุด', () => {
    const rooms = [
      makeRoom('OFFICE', 110, 100, { category: 'faculty_office' }),
      makeRoom('LECTURE', 100, 100, { category: 'lecture_room' }),
    ]
    const layout = layoutMarkers({ rooms, scale: 0.8, selectedRoomId: null })

    assert.equal(layout.get('LECTURE')?.mode, 'badge')
    assert.equal(layout.get('OFFICE')?.mode, 'dot')
  })

  it('ซูมเข้าแล้วห้องเดิมกลับมาเป็นวงกลมเต็มทั้งคู่', () => {
    const rooms = [
      makeRoom('OFFICE', 120, 100, { category: 'faculty_office' }),
      makeRoom('LECTURE', 100, 100, { category: 'lecture_room' }),
    ]

    assert.equal(layoutMarkers({ rooms, scale: 0.8, selectedRoomId: null }).get('OFFICE')?.mode, 'dot')

    const zoomed = layoutMarkers({ rooms, scale: 3, selectedRoomId: null })
    assert.equal(zoomed.get('LECTURE')?.mode, 'badge')
    assert.equal(zoomed.get('OFFICE')?.mode, 'badge')
  })

  it('ห้องที่ถูกเลือกได้หมุดและป้ายเสมอ แม้ชนกับห้องน้ำ', () => {
    const rooms = [
      makeRoom('TOILET', 100, 100, { category: 'toilet', roomNumber: '', nameThai: 'ห้องน้ำ' }),
      makeRoom('OFFICE', 105, 100, { category: 'faculty_office' }),
    ]
    const layout = layoutMarkers({ rooms, scale: 0.8, selectedRoomId: 'OFFICE' })

    assert.equal(layout.get('OFFICE')?.mode, 'badge')
    assert.notEqual(layout.get('OFFICE')?.label, null)
    assert.equal(layout.get('TOILET')?.mode, 'dot')
  })

  it('ป้ายด้านขวาถูกบัง ย้ายไปด้านซ้าย', () => {
    const rooms = [
      makeRoom('TOILET', 140, 100, { category: 'toilet', roomNumber: '', nameThai: 'ห้องน้ำ' }),
      makeRoom('LECTURE', 100, 100, { category: 'lecture_room' }),
    ]
    const layout = layoutMarkers({ rooms, scale: 1, selectedRoomId: null })

    assert.equal(layout.get('TOILET')?.mode, 'badge')
    assert.deepEqual(layout.get('LECTURE'), { mode: 'badge', label: 'left' })
  })

  it('ป้ายชื่อไม่ทับจุดของห้องอื่น', () => {
    // A dot sits right where LECTURE's right label would go.
    const rooms = [
      makeRoom('LECTURE', 100, 100, { category: 'lecture_room' }),
      makeRoom('OTHER', 125, 100, { category: 'unknown' }),
    ]
    const layout = layoutMarkers({ rooms, scale: 1, selectedRoomId: null })

    assert.notEqual(layout.get('LECTURE')?.label, 'right')
  })

  it('จุดยังโชว์เลขห้องตัวเล็กถ้ามีที่ว่าง (เลขไม่หายตอนซูมออก)', () => {
    // Just below LECTURE: the badges collide, but the dot's label clears LECTURE's badge.
    const rooms = [
      makeRoom('OFFICE', 100, 125, { category: 'faculty_office' }),
      makeRoom('LECTURE', 100, 100, { category: 'lecture_room' }),
    ]
    const layout = layoutMarkers({ rooms, scale: 0.8, selectedRoomId: null })

    assert.deepEqual(layout.get('OFFICE'), { mode: 'dot', label: 'right' })
  })

  it('ป้ายของจุดไม่ทับหมุด ป้ายหมุด หรือจุดอื่น', () => {
    const rooms = [
      makeRoom('OFFICE', 110, 100, { category: 'faculty_office' }),
      makeRoom('LECTURE', 100, 100, { category: 'lecture_room' }),
      // Boxed in: another room point sits where each side label would go.
      makeRoom('EAST', 125, 100, { category: 'unknown' }),
      makeRoom('WEST', 95, 100, { category: 'unknown' }),
    ]
    const layout = layoutMarkers({ rooms, scale: 0.8, selectedRoomId: null })

    assert.deepEqual(layout.get('OFFICE'), { mode: 'dot', label: null })
  })

  it('ผลลัพธ์คงที่ ไม่ขึ้นกับลำดับ input (กันหมุดกระพริบตอน pan)', () => {
    const rooms = [
      makeRoom('A', 100, 100),
      makeRoom('B', 108, 100),
      makeRoom('C', 116, 100),
      makeRoom('D', 300, 300, { category: 'toilet' }),
    ]
    const forward = layoutMarkers({ rooms, scale: 1, selectedRoomId: null })
    const reversed = layoutMarkers({ rooms: [...rooms].reverse(), scale: 1, selectedRoomId: null })

    assert.deepEqual([...forward].sort(), [...reversed].sort())
  })

  it('ทุกห้องได้ตำแหน่ง ไม่มีห้องหายจากแผนที่', () => {
    const rooms = Array.from({ length: 30 }, (_, i) => makeRoom(`R${i}`, 100 + i * 3, 100))
    const layout = layoutMarkers({ rooms, scale: 0.8, selectedRoomId: null })

    assert.equal(layout.size, rooms.length)
  })

  it('ป้ายห้องที่ปิดยาวขึ้น จึงจองพื้นที่กว้างขึ้น ไม่ทับห้องข้าง ๆ (#147)', () => {
    const rooms = [makeRoom('A', 100, 100), makeRoom('B', 100 + 60, 100)]
    const open = layoutMarkers({ rooms, scale: 1, selectedRoomId: null })
    assert.equal(open.get('A')?.label, 'right')
    const closed = layoutMarkers({ rooms, scale: 1, selectedRoomId: null, closedRoomIds: new Set(['A']) })
    assert.notEqual(closed.get('A')?.label, 'right')
  })
})
