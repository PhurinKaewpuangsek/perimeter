import type { Room } from '../types/room.ts'
import type { ScheduleSlot } from '../types/schedule.ts'
import { formatLocalDate, isExamSchedule } from './scheduleDisplay.ts'

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
  today: string
  includePast?: boolean
}

const THAI_MONTH_NUMBERS: Record<string, number> = {
  'ม.ค.': 1,
  'ก.พ.': 2,
  'มี.ค.': 3,
  'เม.ย.': 4,
  'พ.ค.': 5,
  'มิ.ย.': 6,
  'ก.ค.': 7,
  'ส.ค.': 8,
  'ก.ย.': 9,
  'ต.ค.': 10,
  'พ.ย.': 11,
  'ธ.ค.': 12,
}

function normalizeDate(year: number, month: number, day: number): string | null {
  if (year >= 2400) year -= 543
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseExamQuery(
  query: string,
  defaultYear = Number(formatLocalDate(new Date()).slice(0, 4))
): ParsedExamQuery {
  let remaining = query.trim()
  let date: string | null = null
  const datePatterns = [
    /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
    new RegExp(
      `(?:^|\\s)(\\d{1,2})\\s*(${Object.keys(THAI_MONTH_NUMBERS)
        .map((month) => month.replaceAll('.', '\\.'))
        .join('|')})(?:\\s*(\\d{4}))?(?=\\s|$)`,
      'i'
    ),
  ]

  for (const [index, pattern] of datePatterns.entries()) {
    const dateMatch = remaining.match(pattern)
    if (!dateMatch) continue

    if (index === 0) {
      date =
        normalizeDate(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])) ??
        dateMatch[0]
    } else if (index === 1) {
      date =
        normalizeDate(Number(dateMatch[3]), Number(dateMatch[2]), Number(dateMatch[1])) ??
        dateMatch[0]
    } else {
      const month = Object.entries(THAI_MONTH_NUMBERS).find(
        ([label]) => label.toLowerCase() === dateMatch[2].toLowerCase()
      )?.[1]
      if (month) {
        date =
          normalizeDate(Number(dateMatch[3] ?? defaultYear), month, Number(dateMatch[1])) ??
          dateMatch[0]
      }
    }

    remaining = remaining.replace(dateMatch[0], ' ')
    break
  }

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

/**
 * ตรวจสอบว่า query เป็นคำค้นหาที่เกี่ยวข้องกับการสอบโดยตรงหรือไม่
 * เช่น "exam", "สอบ", "ตารางสอบ", "midterm", "final", "การสอบ"
 */
export function isExamKeywordQuery(query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  const EXAM_WORDS = [
    'exam',
    'exams',
    'examination',
    'midterm',
    'final',
    'สอบ',
    'การสอบ',
    'ตารางสอบ',
    'ปลายภาค',
    'กลางภาค',
  ]
  return EXAM_WORDS.some((word) => q === word || q.startsWith(word) || q.includes(word))
}

/**
 * ตรวจสอบว่า query เกี่ยวข้องกับการสอบหรือไม่ (เป็นคำว่า exam/สอบ หรือตรงกับรหัสวิชาที่มีการสอบ)
 */
export function isExamRelatedQuery(
  query: string,
  schedules: ScheduleSlot[] = []
): boolean {
  if (isExamKeywordQuery(query)) return true
  const q = query.trim().replace(/\s+/g, '').toLowerCase()
  if (!q) return false
  return schedules.some((s) => {
    if (!isExamSchedule(s)) return false
    const code = s.eventCode.replace(/\s+/g, '').toLowerCase()
    const name = s.eventName.replace(/\s+/g, '').toLowerCase()
    return code === q || code.includes(q) || q.includes(code) || name.includes(q)
  })
}

/**
 * ตัดสินใจว่าการเลือกห้องควรเปิดแท็บใด ('class' หรือ 'exam')
 * โดย 'class' (ตารางเรียน) เป็นค่าเริ่มต้นตามธรรมชาติเสมอ
 * จะสลับไป 'exam' (ตารางสอบ) เฉพาะเมื่อมีเจตนาค้นหาการสอบที่ชัดเจนเท่านั้น
 */
export function resolveScheduleTabOnRoomSelect({
  query = '',
  roomSchedules = [],
  explicitTab,
  targetEventCode,
}: {
  query?: string
  roomSchedules?: ScheduleSlot[]
  explicitTab?: 'class' | 'exam'
  targetEventCode?: string
}): { tab: 'class' | 'exam'; targetCode: string | null } {
  // 1. ถ้าผู้ใช้คลิกเลือกแท็บหรือการ์ดประเภทนั้นโดยตรง เช่น คลิก [ดูตารางห้อง] ในผลการสอบ
  if (explicitTab === 'exam') {
    return { tab: 'exam', targetCode: targetEventCode || null }
  }
  if (explicitTab === 'class') {
    return { tab: 'class', targetCode: null }
  }

  // 2. ถ้า query มีคำค้นหาเกี่ยวกับการสอบโดยตรง (เช่น "exam", "สอบ", "ตารางสอบ", "final", "midterm")
  if (isExamKeywordQuery(query)) {
    const firstExam = roomSchedules.find(isExamSchedule)
    return { tab: 'exam', targetCode: targetEventCode || firstExam?.eventCode || null }
  }

  // 3. ตรวจสอบกรณีรหัสวิชาที่มีตัวเลขระบุชัดเจน (เช่น CS341, BAS350)
  // รหัสกว้างๆ ที่ไม่มีตัวเลข เช่น "CS", "MA" จะไม่เข้าเคสนี้ และดีฟอลต์เป็น 'class' เสมอ
  const parsed = parseExamQuery(query)
  const isSpecificCourse = /^[A-Z]+\d+[A-Z0-9]*$/i.test(parsed.courseCode)

  if (isSpecificCourse) {
    const courseCode = parsed.courseCode.toUpperCase()
    const matchingClass = roomSchedules.find(
      (s) => !isExamSchedule(s) && matchesCourseCode(s, courseCode)
    )
    const matchingExam = roomSchedules.find(
      (s) => isExamSchedule(s) && matchesCourseCode(s, courseCode)
    )

    // ถ้ามีคาบเรียนปกติในห้องนี้ (ตารางเรียน) ต้องให้ความสำคัญกับตารางเรียนเป็นหลักเสมอ!
    if (matchingClass) {
      return { tab: 'class', targetCode: null }
    }

    // ถ้าไม่มีคาบเรียนปกติในห้องนี้เลย แต่มีคาบสอบ (เช่น BAS350 ในห้อง 103)
    // แสดงว่าผู้ใช้ค้นหารหัสวิชานี้เพื่อมาดูห้องสอบ -> สลับไปตารางสอบ
    if (matchingExam) {
      return { tab: 'exam', targetCode: courseCode }
    }
  }

  // 4. กรณีอื่นๆ ทั้งหมด (ค้นหาชื่อห้อง, คีย์เวิร์ดทั่วไป "CS", ค้นหาคาบเรียน ฯลฯ) -> ดีฟอลต์เป็นตารางเรียนเสมอ
  return { tab: 'class', targetCode: null }
}

export function isExamSearchQuery(
  query: string,
  rooms: Room[] = [],
  schedules: ScheduleSlot[] = []
): boolean {
  const parsed = parseExamQuery(query)
  const courseCode = parsed.courseCode
  if (!/^[A-Z]+\d+[A-Z0-9]*$/i.test(courseCode)) return false

  const exactRoomSearch = rooms.some((room) =>
    [room.code, room.roomNumber, room.id, ...room.aliases].some(
      (value) => value.replace(/\s+/g, '').toUpperCase() === courseCode
    )
  )

  if (exactRoomSearch) return false

  const hasMatchingExam = schedules.some(
    (schedule) => isExamSchedule(schedule) && matchesCourseCode(schedule, courseCode)
  )
  const matchesRoomText = rooms.some((room) =>
    roomMatchesQuery(room, getExpandedSearchTerms(query))
  )
  if (!hasMatchingExam && matchesRoomText) return false

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
  options: Partial<FindExamsOptions> = {}
): ScheduleSlot[] {
  const today = options.today ?? formatLocalDate(new Date())
  const includePast = options.includePast ?? false
  const parsed = parseExamQuery(query, Number(today.slice(0, 4)))
  if (!/^[A-Z]+\d+[A-Z0-9]*$/i.test(parsed.courseCode)) return []

  return schedules
    .filter((schedule) => {
      if (!isExamSchedule(schedule) || !matchesCourseCode(schedule, parsed.courseCode)) return false
      if (parsed.date && schedule.eventDate !== parsed.date) return false
      if (parsed.time && !timeIsWithinSchedule(parsed.time, schedule)) return false
      if (!includePast && schedule.eventDate && schedule.eventDate < today) return false
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
