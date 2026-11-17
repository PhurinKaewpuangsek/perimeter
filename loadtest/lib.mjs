/** Pure helpers shared by manage.mjs and its tests. Nothing here touches AWS. */

export const TEST_ROOM_PREFIX = 'LOADTEST-'
export const TEST_EMAIL_PREFIX = 'loadtest'
export const TEST_EMAIL_DOMAIN = 'torch.dev'

/** True only for rows/rooms created by this tool. Guards every delete. */
export function isTestRoom(roomCode) {
  return typeof roomCode === 'string' && roomCode.startsWith(TEST_ROOM_PREFIX)
}

/** True only for accounts created by this tool (loadtestNN@torch.dev). */
export function isTestEmail(email) {
  return typeof email === 'string' && new RegExp(`^${TEST_EMAIL_PREFIX}\\d{2,}@${TEST_EMAIL_DOMAIN.replace('.', '\\.')}$`).test(email)
}

export function testEmail(n) {
  return `${TEST_EMAIL_PREFIX}${String(n).padStart(2, '0')}@${TEST_EMAIL_DOMAIN}`
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']
const TIMES = [['09:00', '10:30'], ['10:30', '12:00'], ['13:00', '14:30'], ['14:30', '16:00']]

/** rooms x (5 days x 4 times) schedule rows, all under LOADTEST- room codes. */
export function buildScheduleRows(rooms = 20) {
  const rows = []
  for (let r = 1; r <= rooms; r++) {
    const room_code = `${TEST_ROOM_PREFIX}R${String(r).padStart(2, '0')}`
    for (const day of DAYS) {
      for (const [start, end] of TIMES) {
        const code = `LT${r}${day[0]}${start.slice(0, 2)}`
        rows.push({
          room_code,
          schedule_slot: `${day}#${start}#${code}`,
          event_code: code,
          event_name: `Load test ${code}`,
          day_of_week: day,
          start_time: start,
          end_time: end,
          event_type: 'class',
        })
      }
    }
  }
  return rows
}

/** Converts a plain object to DynamoDB attribute-value JSON (strings only). */
export function toDdbItem(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { S: String(v) }]))
}

export function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
