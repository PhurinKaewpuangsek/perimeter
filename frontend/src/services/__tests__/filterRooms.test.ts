import { describe, it } from 'node:test'
import assert from 'node:assert'
import { filterRooms, findExams, isExamSearchQuery } from '../filterRooms.ts'
import type { Room } from '../../types/room.ts'
import type { ScheduleSlot } from '../../types/schedule.ts'

function makeRoom(overrides: Partial<Room>): Room {
  return {
    id: 'LC3-F1-R000',
    code: 'LC3-000',
    nameThai: 'ห้องทดสอบ',
    building: 'LC3',
    floor: 1,
    roomNumber: '000',
    category: 'lecture_room',
    coordinates: { x: 0, y: 0 },
    landmarks: [],
    aliases: [],
    ...overrides,
  }
}

const sampleRooms: Room[] = [
  makeRoom({
    id: 'LC3-F1-R101',
    code: 'LC3-101',
    nameThai: 'ห้องบรรยาย 1',
    category: 'lecture_room',
    aliases: ['LC3-101', '101'],
  }),
  makeRoom({
    id: 'LC3-F1-R102',
    code: 'LC3-102',
    nameThai: 'ห้องปฏิบัติการเคมี',
    category: 'laboratory',
    aliases: ['LC3-102', '102'],
  }),
  makeRoom({
    id: 'LC3-F1-R103',
    code: 'LC3-103',
    nameThai: 'ห้อง 103',
    aliases: ['LC3-103', '103'],
  }),
  makeRoom({
    id: 'LC3-F1-PLMTOILET',
    code: '',
    nameThai: 'ห้องน้ำชาย (ฝั่งซ้าย)',
    category: 'toilet',
    aliases: [],
  }),
]

const sampleSchedules: ScheduleSlot[] = [
  {
    roomCode: 'LC3-103',
    eventCode: 'CS361',
    eventName: 'CS 361',
    dayOfWeek: 'TUE',
    startTime: '08:00',
    endTime: '11:00',
    eventType: 'class',
  },
  {
    roomCode: 'LC3-103',
    eventCode: 'BAS350',
    eventName: 'Exam - BAS350',
    dayOfWeek: 'MON',
    startTime: '13:00',
    endTime: '16:00',
    eventType: 'exam',
  },
]

const examSchedules: ScheduleSlot[] = [
  {
    roomCode: 'LC3-103',
    eventCode: 'BAS350',
    eventName: 'Exam - BAS350',
    dayOfWeek: 'MON',
    startTime: '13:00',
    endTime: '16:00',
    eventType: 'exam',
    eventDate: '2026-05-18',
  },
  {
    roomCode: 'LC3-201',
    eventCode: 'BAS350',
    eventName: 'BAS 350',
    dayOfWeek: 'TUE',
    startTime: '09:00',
    endTime: '12:00',
    eventType: 'exam',
    eventDate: '2026-05-20',
  },
  {
    roomCode: 'LC3-102',
    eventCode: 'BAS350',
    eventName: 'BAS350',
    dayOfWeek: 'FRI',
    startTime: '08:00',
    endTime: '10:00',
    eventType: 'exam',
    eventDate: '2026-04-30',
  },
  {
    roomCode: 'LC3-103',
    eventCode: 'BAS350',
    eventName: 'BAS350',
    dayOfWeek: 'MON',
    startTime: '13:00',
    endTime: '16:00',
    eventType: 'class',
    eventDate: '2026-05-18',
  },
]

describe('filterRooms()', () => {
  it('distinguishes course searches from exact room codes and known class-only subjects', () => {
    assert.strictEqual(isExamSearchQuery('bas 350', sampleRooms), true)
    assert.strictEqual(isExamSearchQuery('LC3-103', sampleRooms), false)
    assert.strictEqual(isExamSearchQuery('ห้องเรียน 1', sampleRooms), false)
    assert.strictEqual(isExamSearchQuery('lab 1', sampleRooms), false)
    assert.strictEqual(isExamSearchQuery('CS361', sampleRooms, sampleSchedules), false)
    assert.strictEqual(isExamSearchQuery('CS361 13:00', sampleRooms, sampleSchedules), true)
    assert.strictEqual(isExamSearchQuery('MISSING123', sampleRooms), true)
  })

  it('returns every room when query is empty and category is "all"', () => {
    const result = filterRooms(sampleRooms, '', 'all')
    assert.strictEqual(result.length, sampleRooms.length)
  })

  describe('findExams()', () => {
    it('matches course codes without regard to case or spaces', () => {
      assert.deepStrictEqual(
        findExams(examSchedules, 'bas 350', { today: '2026-05-01' }).map((exam) => exam.roomCode),
        ['LC3-103', 'LC3-201']
      )
    })

    it('supports course-only searches and optional exact dates', () => {
      const allMatches = findExams(examSchedules, 'BAS350', { today: '2026-05-01' })
      const datedMatch = findExams(examSchedules, 'BAS350 2026-05-20', {
        today: '2026-05-01',
      })

      assert.strictEqual(allMatches.length, 2)
      assert.deepStrictEqual(datedMatch.map((exam) => exam.roomCode), ['LC3-201'])
    })

    it('accepts slash dates and Thai abbreviated dates', () => {
      for (const dateQuery of ['18/05/2026', '18/5/2026', '18 พ.ค.', '18 พ.ค. 2569']) {
        assert.deepStrictEqual(
          findExams(examSchedules, `BAS350 ${dateQuery}`, {
            today: '2026-04-01',
            includePast: true,
          }).map((exam) => exam.roomCode),
          ['LC3-103']
        )
      }
    })

    it('supports the two-argument call and defaults to upcoming exams', () => {
      const futureExam: ScheduleSlot = {
        ...examSchedules[0],
        eventDate: '2099-05-18',
      }

      assert.deepStrictEqual(findExams([futureExam], 'BAS350'), [futureExam])
    })

    it('accepts dot or colon time notation and matches start times or times during the exam', () => {
      assert.deepStrictEqual(
        findExams(examSchedules, 'BAS350 13.00', { today: '2026-05-01' }).map(
          (exam) => exam.roomCode
        ),
        ['LC3-103']
      )
      assert.deepStrictEqual(
        findExams(examSchedules, 'BAS350 14:30', { today: '2026-05-01' }).map(
          (exam) => exam.roomCode
        ),
        ['LC3-103']
      )
    })

    it('returns all rooms and sittings ordered by date then start time', () => {
      const result = findExams(examSchedules, 'BAS350', {
        includePast: true,
        today: '2026-05-01',
      })

      assert.deepStrictEqual(
        result.map((exam) => `${exam.eventDate} ${exam.startTime} ${exam.roomCode}`),
        [
          '2026-04-30 08:00 LC3-102',
          '2026-05-18 13:00 LC3-103',
          '2026-05-20 09:00 LC3-201',
        ]
      )
    })

    it('excludes past exams by default but can include them explicitly', () => {
      assert.strictEqual(findExams(examSchedules, 'BAS350', { today: '2026-05-01' }).length, 2)
      assert.strictEqual(
        findExams(examSchedules, 'BAS350', { includePast: true, today: '2026-05-01' }).length,
        3
      )
    })

    it('returns no results for a missing course or time/date combination', () => {
      assert.deepStrictEqual(findExams(examSchedules, 'MISSING101', { today: '2026-05-01' }), [])
      assert.deepStrictEqual(
        findExams(examSchedules, 'BAS350 17:00', { today: '2026-05-01' }),
        []
      )
    })

    it('uses only the supplied reference date when deciding which exams are past', () => {
      const asOfMayFirst = findExams(examSchedules, 'BAS350', { today: '2026-05-01' })
      const asOfMayTwentyFirst = findExams(examSchedules, 'BAS350', { today: '2026-05-21' })

      assert.deepStrictEqual(asOfMayFirst.map((exam) => exam.eventDate), [
        '2026-05-18',
        '2026-05-20',
      ])
      assert.deepStrictEqual(asOfMayTwentyFirst, [])
    })
  })

  it('matches by room code, case-insensitively', () => {
    const result = filterRooms(sampleRooms, 'lc3-101', 'all')
    assert.deepStrictEqual(
      result.map((room) => room.id),
      ['LC3-F1-R101']
    )
  })

  it('matches by Thai room name', () => {
    const result = filterRooms(sampleRooms, 'เคมี', 'all')
    assert.deepStrictEqual(
      result.map((room) => room.id),
      ['LC3-F1-R102']
    )
  })

  it('matches by alias', () => {
    const result = filterRooms(sampleRooms, 'lc3-102', 'all')
    assert.deepStrictEqual(
      result.map((room) => room.id),
      ['LC3-F1-R102']
    )
  })

  it('matches a subject code through its schedule and returns the classroom', () => {
    const result = filterRooms(sampleRooms, 'CS361', 'all', sampleSchedules)
    assert.deepStrictEqual(
      result.map((room) => room.id),
      ['LC3-F1-R103']
    )
  })

  it('matches exam names and remains case-insensitive', () => {
    const result = filterRooms(sampleRooms, 'exam - bas350', 'all', sampleSchedules)
    assert.deepStrictEqual(
      result.map((room) => room.code),
      ['LC3-103']
    )
  })

  it('does not match a schedule in a different classroom', () => {
    const result = filterRooms(sampleRooms, 'CS361', 'all', [
      { ...sampleSchedules[0], roomCode: 'LC3-999' },
    ])
    assert.deepStrictEqual(result, [])
  })

  it('filters by category key alone', () => {
    const result = filterRooms(sampleRooms, '', 'laboratory')
    assert.deepStrictEqual(
      result.map((room) => room.id),
      ['LC3-F1-R102']
    )
  })

  it('combines a text query with a category filter', () => {
    const matching = filterRooms(sampleRooms, '102', 'laboratory')
    assert.deepStrictEqual(
      matching.map((room) => room.id),
      ['LC3-F1-R102']
    )

    const mismatchedCategory = filterRooms(sampleRooms, '102', 'lecture_room')
    assert.deepStrictEqual(mismatchedCategory, [])
  })

  it('returns an empty array when nothing matches the query', () => {
    const result = filterRooms(sampleRooms, 'ไม่มีห้องนี้แน่นอน', 'all')
    assert.deepStrictEqual(result, [])
  })

  it('trims whitespace around the query', () => {
    const result = filterRooms(sampleRooms, '  Lc3-101  ', 'all')
    assert.deepStrictEqual(
      result.map((room) => room.id),
      ['LC3-F1-R101']
    )
  })

  it('treats an unknown category key as "no filter"', () => {
    const result = filterRooms(sampleRooms, '', 'this-key-does-not-exist')
    assert.strictEqual(result.length, sampleRooms.length)
  })

  describe('synonym and slang expansions', () => {
    it('matches laboratory via "lab", "แลป", "แล็ป", "ห้องแลป", "ห้องแล็ป"', () => {
      const labQueries = ['lab', 'LAB', 'แลป', 'แล็ป', 'ห้องแลป', 'ห้องแล็ป']
      for (const q of labQueries) {
        const result = filterRooms(sampleRooms, q, 'all')
        assert.deepStrictEqual(
          result.map((r) => r.id),
          ['LC3-F1-R102'],
          `Failed matching for query "${q}"`
        )
      }
    })

    it('matches lecture room via "ห้องเรียน", "เรียน", "บรรยาย", "lecture"', () => {
      const lectureQueries = ['ห้องเรียน', 'เรียน', 'บรรยาย', 'lecture', 'LECTURE']
      for (const q of lectureQueries) {
        const result = filterRooms(sampleRooms, q, 'all')
        assert.deepStrictEqual(
          result.map((r) => r.id),
          ['LC3-F1-R101'],
          `Failed matching for query "${q}"`
        )
      }
    })

    it('matches toilet via "toilet", "wc", "restroom", "สุขา", "ส้วม"', () => {
      const toiletQueries = ['toilet', 'WC', 'restroom', 'สุขา', 'ส้วม']
      for (const q of toiletQueries) {
        const result = filterRooms(sampleRooms, q, 'all')
        assert.deepStrictEqual(
          result.map((r) => r.id),
          ['LC3-F1-PLMTOILET'],
          `Failed matching for query "${q}"`
        )
      }
    })
  })
})
