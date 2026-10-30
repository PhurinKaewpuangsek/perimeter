import type { ScheduleSlot } from '../types/schedule'
import { TIMETABLE_DAYS, type TimetableDay } from './timetableLayout'

/**
 * Curated Google Calendar solid color palette for timetable entries.
 * Rich, solid, matte tones with high-contrast white text (matches Google Calendar UI).
 * Avoids soft/glowing pastels and pinks so it never clashes with the day selector tabs above.
 */
export const TIMETABLE_PALETTE = [
  'bg-[#3f51b5] text-white', // Google Blueberry / Indigo (matches Bus to Uni)
  'bg-[#ef6c00] text-white', // Google Tangerine / Orange (matches Morning & Afternoon Class)
  'bg-[#7cb342] text-white', // Google Avocado / Sage (matches Lunch)
  'bg-[#039be5] text-white', // Google Peacock / Sky
  'bg-[#8e24aa] text-white', // Google Grape / Purple
  'bg-[#00897b] text-white', // Google Teal
  'bg-[#0b8043] text-white', // Google Basil / Green
  'bg-[#c2410c] text-white', // Google Rust / Warm Sienna
  'bg-[#546e7a] text-white', // Google Graphite / Slate
  'bg-[#1976d2] text-white', // Google Cobalt / Blue
  'bg-[#b71c1c] text-white', // Google Crimson / Red
  'bg-[#6b21a8] text-white', // Google Deep Purple
]

/**
 * Official Thai Day Colors used for the left accent indicators (reg.tu.ac.th style).
 */
export const THAI_DAY_COLORS: Record<
  TimetableDay,
  { name: string; full: string; hex: string; bgClass: string }
> = {
  MON: { name: 'จันทร์', full: 'วันจันทร์', hex: '#f59e0b', bgClass: 'bg-[#f59e0b]' },
  TUE: { name: 'อังคาร', full: 'วันอังคาร', hex: '#ec4899', bgClass: 'bg-[#ec4899]' },
  WED: { name: 'พุธ', full: 'วันพุธ', hex: '#10b981', bgClass: 'bg-[#10b981]' },
  THU: { name: 'พฤหัสบดี', full: 'วันพฤหัสบดี', hex: '#f97316', bgClass: 'bg-[#f97316]' },
  FRI: { name: 'ศุกร์', full: 'วันศุกร์', hex: '#0ea5e9', bgClass: 'bg-[#0ea5e9]' },
  SAT: { name: 'เสาร์', full: 'วันเสาร์', hex: '#8b5cf6', bgClass: 'bg-[#8b5cf6]' },
  SUN: { name: 'อาทิตย์', full: 'วันอาทิตย์', hex: '#ef4444', bgClass: 'bg-[#ef4444]' },
}

/** Stable hash of a string to a non-negative integer. */
export function getStableHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/** Extracts the class identifier from a slot (course code or event name). */
export function getSlotClassKey(slot: ScheduleSlot): string {
  return (slot.eventCode || slot.eventName || 'other').trim()
}

/** Stable identity of an entry, so a selection survives the parent re-fetching its slots. */
export function slotKey(slot: ScheduleSlot): string {
  return `${slot.roomCode}#${slot.dayOfWeek}#${slot.startTime}#${slot.eventCode}`
}

/**
 * Maps each unique class/event in the current timetable to a distinct solid color from the palette.
 * Avoids collisions among classes shown in the same view so that different classes
 * always have different colors to tell them apart easily.
 */
export function buildClassColorMap(slots: ScheduleSlot[]): Map<string, string> {
  const map = new Map<string, string>()
  const usedIndices = new Set<number>()

  // Distinct sorted class keys
  const uniqueKeys = Array.from(
    new Set(slots.map(getSlotClassKey).filter(Boolean))
  ).sort()

  for (const key of uniqueKeys) {
    let idx = getStableHash(key) % TIMETABLE_PALETTE.length
    // Collision resolution: if this color index is already assigned to another class
    // in this timetable, pick the next available color from the palette
    if (usedIndices.has(idx) && usedIndices.size < TIMETABLE_PALETTE.length) {
      for (let offset = 1; offset < TIMETABLE_PALETTE.length; offset++) {
        const nextIdx = (idx + offset) % TIMETABLE_PALETTE.length
        if (!usedIndices.has(nextIdx)) {
          idx = nextIdx
          break
        }
      }
    }
    usedIndices.add(idx)
    map.set(key, TIMETABLE_PALETTE[idx])
  }

  return map
}

/** Tailwind colours for an entry: one solid colour per class, distinct across different classes. */
export function entryColors(slot: ScheduleSlot, colorMap?: Map<string, string>): string {
  const key = getSlotClassKey(slot)
  if (colorMap && colorMap.has(key)) {
    return colorMap.get(key)!
  }
  return TIMETABLE_PALETTE[getStableHash(key) % TIMETABLE_PALETTE.length]
}

export { TIMETABLE_DAYS }

