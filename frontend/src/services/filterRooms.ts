import type { Room } from '../types/room.ts'
import type { ScheduleSlot } from '../types/schedule.ts'
import { isExamSchedule } from './scheduleDisplay.ts'

export interface CategoryFilterOption {
  /** ค่าที่ใช้อ้างอิงปุ่มนี้ภายในแอป (ส่งเข้า filterRooms เป็นพารามิเตอร์ category) */
  key: string
  /** ข้อความไทยที่แสดงบนปุ่ม filter */
  label: string
  /**
   * ค่า Room['category'] จริงจาก rooms.json ที่ปุ่มนี้ครอบคลุม
   * อาร์เรย์ว่าง = ไม่กรอง (ใช้กับปุ่ม "ทั้งหมด")
   *
   * หมายเหตุ: การจัดกลุ่มรอบแรกนี้อิงจากค่า category จริงที่สำรวจเจอใน
   * rooms.json (issue #25 บอกไว้ว่าปรับส่วน filter ได้) ได้แก่
   * faculty_office, laboratory, lecture_room, toilet, stairs,
   * seminar_room, storage, research_room, unknown, utility,
   * department_office, student_room, staff_room, service_room,
   * meeting_room — ถ้าทีมอยากจัดกลุ่มใหม่ แก้ไขแค่ CATEGORY_FILTERS
   * ด้านล่างนี้ ไม่ต้องแตะ filterRooms() หรือ UI component ใดๆ
   */
  matchCategories: string[]
}

export const CATEGORY_FILTERS: CategoryFilterOption[] = [
  {
    key: 'all',
    label: 'ทั้งหมด',
    matchCategories: [],
  },
  {
    key: 'lecture_room',
    label: 'ห้องบรรยาย',
    matchCategories: ['lecture_room'],
  },
  {
    key: 'seminar_room',
    label: 'ห้องสัมมนา',
    matchCategories: ['seminar_room'],
  },
  {
    key: 'meeting_room',
    label: 'ห้องประชุม',
    matchCategories: ['meeting_room'],
  },
  {
    key: 'research_room',
    label: 'ห้องวิจัย',
    matchCategories: ['research_room'],
  },
  {
    key: 'laboratory',
    label: 'ห้องปฏิบัติการ',
    matchCategories: ['laboratory', 'lab'],
  },
  {
    key: 'office',
    label: 'สำนักงาน / ห้องพักอาจารย์',
    matchCategories: ['faculty_office', 'department_office', 'staff_room'],
  },
  {
    key: 'facility',
    label: 'สิ่งอำนวยความสะดวก',
    matchCategories: [
      'toilet',
      'stairs',
      'utility',
      'storage',
      'service_room',
      'student_room',
      'unknown',
    ],
  },
]

export const DEFAULT_CATEGORY_KEY = CATEGORY_FILTERS[0].key

/**
 * พจนานุกรมคำพ้อง (Synonym Dictionary)
 * จับคู่คำค้นหาทั่วไป คำย่อ ภาษาอังกฤษ คำทับศัพท์ และสแลง
 * เข้ากับคำที่เป็นทางการ/ชื่อจริงของห้อง เพื่อให้ค้นหาได้สะดวกและครอบคลุม
 */
export const SYNONYM_DICTIONARY: Record<string, string[]> = {
  // Laboratories
  lab: ['ห้องปฏิบัติการ', 'laboratory', 'แลป', 'แล็ป'],
  แลป: ['ห้องปฏิบัติการ', 'lab', 'laboratory'],
  แล็ป: ['ห้องปฏิบัติการ', 'lab', 'laboratory'],
  ห้องแลป: ['ห้องปฏิบัติการ', 'lab'],
  ห้องแล็ป: ['ห้องปฏิบัติการ', 'lab'],
  laboratory: ['ห้องปฏิบัติการ', 'lab'],

  // Lecture / Classrooms
  ห้องเรียน: ['ห้องบรรยายเรียนรวม', 'ห้องบรรยาย', 'lecture'],
  เรียน: ['ห้องบรรยายเรียนรวม', 'ห้องบรรยาย', 'ห้องเรียน'],
  บรรยาย: ['ห้องบรรยายเรียนรวม', 'ห้องบรรยาย', 'lecture'],
  lecture: ['ห้องบรรยายเรียนรวม', 'ห้องบรรยาย', 'ห้องเรียน'],
  classroom: ['ห้องบรรยายเรียนรวม', 'ห้องบรรยาย', 'ห้องเรียน'],
  class: ['ห้องบรรยายเรียนรวม', 'ห้องบรรยาย', 'ห้องเรียน'],

  // Restrooms / Toilets
  toilet: ['ห้องน้ำ', 'สุขา', 'restroom', 'wc'],
  toilets: ['ห้องน้ำ', 'สุขา', 'restroom', 'wc'],
  wc: ['ห้องน้ำ', 'สุขา', 'toilet'],
  restroom: ['ห้องน้ำ', 'สุขา', 'toilet'],
  ห้องส้วม: ['ห้องน้ำ', 'สุขา'],
  ส้วม: ['ห้องน้ำ', 'สุขา'],
  สุขา: ['ห้องน้ำ'],

  // Meeting / Seminars
  meeting: ['ห้องประชุม'],
  ประชุม: ['ห้องประชุม', 'meeting'],
  seminar: ['ห้องสัมมนา'],
  สัมมนา: ['ห้องสัมมนา', 'seminar'],

  // Offices / Faculty rooms
  office: ['สำนักงาน', 'ห้องพักอาจารย์', 'ห้องสาขาวิชา', 'ภาควิชา'],
  ออฟฟิศ: ['สำนักงาน', 'ห้องพักอาจารย์'],
  อาจารย์: ['ห้องพักอาจารย์', 'สำนักงาน'],
  ห้องอาจารย์: ['ห้องพักอาจารย์'],
  ห้องพักอาจารย์: ['สำนักงาน', 'ห้องพักอาจารย์'],
  ห้องพักครู: ['ห้องพักอาจารย์'],

  // Research
  research: ['ห้องวิจัย', 'ห้องปฏิบัติการวิจัย'],
  วิจัย: ['ห้องวิจัย', 'ห้องปฏิบัติการวิจัย', 'research'],

  // Utilities / Stairs / Elevators / Storage
  stairs: ['บันได'],
  บันได: ['stairs', 'บันไดหนีไฟ'],
  lift: ['ลิฟต์', 'ลิฟท์'],
  elevator: ['ลิฟต์', 'ลิฟท์'],
  ลิฟต์: ['lift', 'elevator'],
  ลิฟท์: ['lift', 'elevator'],
  storage: ['ห้องเก็บของ'],
  เก็บของ: ['ห้องเก็บของ', 'storage'],
}

export function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * ขยายคำค้นหาจากพจนานุกรมคำพ้อง
 * คืนค่าชุดคำค้นหาที่รวมทั้งคำค้นหาดั้งเดิมของผู้ใช้ และคำที่เป็นทางการที่เกี่ยวข้อง
 */
export function getExpandedSearchTerms(query: string): string[] {
  const normalized = normalize(query)
  if (!normalized) return []

  const terms = new Set<string>([normalized])

  // 1. ตรวจสอบคำค้นหาแบบตรงตัวใน SYNONYM_DICTIONARY
  if (SYNONYM_DICTIONARY[normalized]) {
    for (const synonym of SYNONYM_DICTIONARY[normalized]) {
      terms.add(normalize(synonym))
    }
  }

  // 2. ตรวจสอบคำที่ตรงกับคีย์ใน dictionary เมื่อค้นหาแบบหลายคำ
  for (const [key, synonyms] of Object.entries(SYNONYM_DICTIONARY)) {
    if (normalized === key || normalized.split(/\s+/).includes(key)) {
      for (const synonym of synonyms) {
        terms.add(normalize(synonym))
      }
    }
  }

  return Array.from(terms)
}

function roomMatchesQuery(room: Room, searchTerms: string[]): boolean {
  if (searchTerms.length === 0) return true

  const normalizedCode = normalize(room.code)
  const normalizedName = normalize(room.nameThai)
  const normalizedAliases = room.aliases.map(normalize)

  return searchTerms.some((term) => {
    if (normalizedCode.includes(term)) return true
    if (normalizedName.includes(term)) return true
    return normalizedAliases.some((alias) => alias.includes(term))
  })
}

export function scheduleMatchesQuery(schedule: ScheduleSlot, searchTerms: string[]): boolean {
  if (searchTerms.length === 0) return false

  const searchableValues = [schedule.eventCode, schedule.eventName].map(normalize)
  return searchTerms.some((term) => searchableValues.some((value) => value.includes(term)))
}

interface ParsedExamQuery {
  courseCode: string
  time: string | null
  date: string | null
}

export interface FindExamsOptions {
  includePast?: boolean
  today?: string
}

function parseExamQuery(query: string): ParsedExamQuery {
  let remaining = query.trim()
  const dateMatch = remaining.match(/\b\d{4}-\d{2}-\d{2}\b/)
  const date = dateMatch?.[0] ?? null
  if (date) remaining = remaining.replace(date, ' ')

  const timeMatch = remaining.match(/\b([01]?\d|2[0-3])([:.])([0-5]\d)\b/)
  const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[3]}` : null
  if (timeMatch) remaining = remaining.replace(timeMatch[0], ' ')

  return {
    courseCode: remaining.replace(/\s+/g, '').toUpperCase(),
    time,
    date,
  }
}

function matchesCourseCode(schedule: ScheduleSlot, courseCode: string): boolean {
  const searchableCodes = [schedule.eventCode, schedule.eventName]
    .flatMap((value) => value.split(/[/,;]/))
    .map((value) => value.replace(/\s+/g, '').toUpperCase())

  return searchableCodes.includes(courseCode)
}

function timeIsWithinSchedule(time: string, schedule: ScheduleSlot): boolean {
  const toMinutes = (value: string) => {
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
    return match ? Number(match[1]) * 60 + Number(match[2]) : null
  }

  const queryMinutes = toMinutes(time)
  const startMinutes = toMinutes(schedule.startTime)
  const endMinutes = toMinutes(schedule.endTime)

  return (
    queryMinutes !== null &&
    startMinutes !== null &&
    endMinutes !== null &&
    queryMinutes >= startMinutes &&
    queryMinutes < endMinutes
  )
}

export function isExamSearchQuery(
  query: string,
  rooms: Room[] = [],
  schedules: ScheduleSlot[] = []
): boolean {
  const parsed = parseExamQuery(query)
  const courseCode = parsed.courseCode
  if (!/^[A-Zก-๛]+\d+[A-Z0-9ก-๛]*$/i.test(courseCode)) return false

  const exactRoomSearch = rooms.some((room) =>
    [room.code, room.roomNumber, room.id, ...room.aliases].some(
      (value) => value.replace(/\s+/g, '').toUpperCase() === courseCode
    )
  )

  if (exactRoomSearch) return false

  const hasDateOrTimeFilter = parsed.date !== null || parsed.time !== null
  const matchesOnlyClassSchedules =
    !hasDateOrTimeFilter &&
    schedules.some(
      (schedule) => !isExamSchedule(schedule) && matchesCourseCode(schedule, courseCode)
    ) &&
    !schedules.some(
      (schedule) => isExamSchedule(schedule) && matchesCourseCode(schedule, courseCode)
    )

  return !matchesOnlyClassSchedules
}

/**
 * Finds exam rows by course code with optional date/time filters.
 * Past exams are excluded by default; pass includePast to show the full history.
 */
export function findExams(
  schedules: ScheduleSlot[],
  query: string,
  options: FindExamsOptions = {}
): ScheduleSlot[] {
  const parsed = parseExamQuery(query)
  if (!parsed.courseCode || !isExamSearchQuery(query)) return []

  const now = new Date()
  const today =
    options.today ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return schedules
    .filter((schedule) => {
      if (!isExamSchedule(schedule) || !matchesCourseCode(schedule, parsed.courseCode)) return false
      if (parsed.date && schedule.eventDate !== parsed.date) return false
      if (parsed.time && !timeIsWithinSchedule(parsed.time, schedule)) return false
      if (!options.includePast && schedule.eventDate && schedule.eventDate < today) return false
      return true
    })
    .sort((a, b) => {
      const dateOrder = (a.eventDate || '9999-12-31').localeCompare(b.eventDate || '9999-12-31')
      return dateOrder || a.startTime.localeCompare(b.startTime) || a.roomCode.localeCompare(b.roomCode)
    })
}

function roomMatchesSchedule(room: Room, schedules: ScheduleSlot[], searchTerms: string[]): boolean {
  return schedules.some(
    (schedule) =>
      normalize(schedule.roomCode) === normalize(room.code) &&
      scheduleMatchesQuery(schedule, searchTerms)
  )
}

function roomMatchesCategory(room: Room, categoryKey: string): boolean {
  if (categoryKey === DEFAULT_CATEGORY_KEY) return true

  const option = CATEGORY_FILTERS.find((filter) => filter.key === categoryKey)
  if (!option || option.matchCategories.length === 0) return true

  return option.matchCategories.includes(room.category)
}

/**
 * กรองห้องจาก query (ค้นหาแบบ case-insensitive พร้อมระบบขยายคำพ้องใน code, nameThai, aliases)
 * และ category (key จาก CATEGORY_FILTERS ด้านบน)
 *
 * schedules เป็น optional เพื่อให้ค้นหารหัสวิชา/ชื่อวิชาแล้วคืนห้องที่มีตารางนั้นได้
 * Pure function — ไม่แตะ state หรือ side effect ใดๆ จึงเทสได้ตรงไปตรงมา
 */
export function filterRooms(
  rooms: Room[],
  query: string,
  category: string,
  schedules: ScheduleSlot[] = []
): Room[] {
  const searchTerms = getExpandedSearchTerms(query)

  return rooms.filter(
    (room) =>
      (roomMatchesQuery(room, searchTerms) || roomMatchesSchedule(room, schedules, searchTerms)) &&
      roomMatchesCategory(room, category)
  )
}
