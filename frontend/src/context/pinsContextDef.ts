import { createContext } from 'react'
import type { PinnedSchedule } from '../types/pin'
import type { ScheduleSlot } from '../types/schedule'

export function computeScheduleSlot(slot: {
  scheduleSlot?: string
  dayOfWeek?: string
  startTime?: string
  eventCode?: string
}): string {
  if (slot.scheduleSlot) return slot.scheduleSlot
  return `${slot.dayOfWeek || ''}#${slot.startTime || ''}#${slot.eventCode || ''}`
}

export interface PinsContextType {
  pins: PinnedSchedule[]
  loading: boolean
  error: Error | null
  isPinned: (roomCode: string, scheduleSlotOrSlot: string | ScheduleSlot) => boolean
  togglePin: (slot: ScheduleSlot | PinnedSchedule) => Promise<boolean>
  addPin: (slot: ScheduleSlot | PinnedSchedule) => Promise<void>
  removePin: (roomCode: string, scheduleSlot: string) => Promise<void>
  reloadPins: () => Promise<void>
  isDrawerOpen: boolean
  setIsDrawerOpen: (open: boolean) => void
}

export const defaultContextValue: PinsContextType = {
  pins: [],
  loading: false,
  error: null,
  isPinned: () => false,
  togglePin: async () => false,
  addPin: async () => {},
  removePin: async () => {},
  reloadPins: async () => {},
  isDrawerOpen: false,
  setIsDrawerOpen: () => {},
}

export const PinsContext = createContext<PinsContextType>(defaultContextValue)
