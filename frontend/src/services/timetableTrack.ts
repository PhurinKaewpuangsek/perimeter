/** The staff timetables draw one track per room or day, from 08:00 to 20:00. */
export const GRID_START_HOUR = 8
export const GRID_END_HOUR = 20
export const GRID_TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Where a slot sits on the 08:00–20:00 track, as percentages, or null when it lies
 * entirely outside the track (e.g. 06:00–07:00). Both ends are clipped to the track and
 * the minimum width never runs past its right edge.
 */
export function getTrackPlacement(
  startTime: string,
  endTime: string,
  minWidthPct: number,
): { leftPct: number; widthPct: number } | null {
  const start = parseMinutes(startTime) - GRID_START_HOUR * 60
  const end = parseMinutes(endTime) - GRID_START_HOUR * 60
  if (end <= start || end <= 0 || start >= GRID_TOTAL_MINUTES) return null
  const clippedStart = Math.max(0, start)
  const clippedEnd = Math.min(GRID_TOTAL_MINUTES, end)
  const leftPct = (clippedStart / GRID_TOTAL_MINUTES) * 100
  const widthPct = ((clippedEnd - clippedStart) / GRID_TOTAL_MINUTES) * 100
  return { leftPct, widthPct: Math.min(Math.max(widthPct, minWidthPct), 100 - leftPct) }
}
