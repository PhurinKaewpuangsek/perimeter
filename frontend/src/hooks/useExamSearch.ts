import { useMemo, useState } from 'react'
import { findExams, isExamSearchQuery } from '../services/filterRooms'
import { formatLocalDate } from '../services/scheduleDisplay'
import type { Room } from '../types/room'
import type { ScheduleSlot } from '../types/schedule'

export function useExamSearch(
  query: string,
  rooms: Room[],
  schedules: ScheduleSlot[],
  referenceDate = formatLocalDate(new Date())
) {
  const [showPastExams, setShowPastExams] = useState(false)

  const allExamResults = useMemo(
    () => findExams(schedules, query, { includePast: true, today: referenceDate }),
    [query, referenceDate, schedules]
  )
  const examResults = useMemo(
    () =>
      showPastExams
        ? allExamResults
        : findExams(schedules, query, { today: referenceDate }),
    [allExamResults, query, referenceDate, schedules, showPastExams]
  )

  return {
    allExamResults,
    examResults,
    examSearchActive: isExamSearchQuery(query, rooms, schedules),
    pastExamsAvailable: allExamResults.length > examResults.length,
    showPastExams,
    toggleShowPastExams: () => setShowPastExams((current) => !current),
  }
}
