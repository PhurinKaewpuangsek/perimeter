/**
 * Pure helpers that turn a route into what the 2D map, the 3D map and the navigation
 * panel show, so all three agree on the floor legs and the wording.
 */
import type { Room } from '../types/room.ts'
import type { RouteFailureReason, RoutePoint } from '../types/route.ts'

export const BUILDING_ENTRANCE_LABEL = 'ทางเข้าอาคาร'

/** "ห้อง 105", or the POI name ("ห้องน้ำหญิง (ฝั่งซ้าย)") when there is no room number. */
export function getPlaceLabel(room: Pick<Room, 'roomNumber' | 'nameThai' | 'code'>): string {
  return room.roomNumber ? `ห้อง ${room.roomNumber}` : room.nameThai || room.code
}

export interface RouteLeg {
  floor: number
  points: RoutePoint[]
}

/** Consecutive runs of the path on one floor, in walking order. */
export function splitRouteByFloor(path: RoutePoint[]): RouteLeg[] {
  const legs: RouteLeg[] = []
  for (const point of path) {
    const last = legs[legs.length - 1]
    if (last && last.floor === point.floor) last.points.push(point)
    else legs.push({ floor: point.floor, points: [point] })
  }
  return legs
}

/** "ขึ้นบันไดไปชั้น 2" / "ลงบันไดไปชั้น 1" */
export function getFloorChangeLabel(fromFloor: number, toFloor: number): string {
  return `${toFloor > fromFloor ? 'ขึ้น' : 'ลง'}บันไดไปชั้น ${toFloor}`
}

export const ROUTE_FAILURE_MESSAGES: Record<RouteFailureReason, { title: string; hint: string }> = {
  NO_PATH: {
    title: 'ไม่มีทางเดินไปยังปลายทางในขณะนี้',
    hint: 'ทางเดินบางจุดอาจปิดชั่วคราว ลองเลือกจุดเริ่มต้นอื่น',
  },
  DESTINATION_CLOSED: {
    title: 'ปลายทางปิดชั่วคราว',
    hint: 'ห้องนี้ปิดอยู่ในขณะนี้ ลองตรวจสอบอีกครั้งภายหลัง',
  },
  ORIGIN_CLOSED: {
    title: 'จุดเริ่มต้นปิดชั่วคราว',
    hint: 'ลองเลือกจุดเริ่มต้นอื่น เช่น ทางเข้าอาคาร',
  },
  UNKNOWN_LOCATION: {
    title: 'ไม่พบสถานที่นี้ในข้อมูลเส้นทาง',
    hint: 'ลองเลือกห้องหรือจุดสำคัญอื่น',
  },
}

export const CLOSURES_AVOIDED_NOTICE = 'เส้นทางนี้เลี่ยงจุดที่ปิดชั่วคราว'
