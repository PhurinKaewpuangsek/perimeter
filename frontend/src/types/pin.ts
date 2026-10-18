export interface PinnedSchedule {
  userId: string
  pinKey: string
  roomCode: string
  scheduleSlot: string
  eventCode: string
  eventName: string
  dayOfWeek: string
  startTime: string
  endTime: string
  eventType: string
  eventDate?: string
  createdAt?: string
}

export interface RawPinRecord {
  user_id?: string
  userId?: string
  pin_key?: string
  pinKey?: string
  room_code?: string
  roomCode?: string
  schedule_slot?: string
  scheduleSlot?: string
  event_code?: string
  eventCode?: string
  event_name?: string
  eventName?: string
  day_of_week?: string
  dayOfWeek?: string
  start_time?: string
  startTime?: string
  end_time?: string
  endTime?: string
  event_type?: string
  eventType?: string
  event_date?: string
  eventDate?: string
  created_at?: string
  createdAt?: string
  [key: string]: unknown
}

export interface PinsDataResponse {
  count?: number
  records: RawPinRecord[]
}
