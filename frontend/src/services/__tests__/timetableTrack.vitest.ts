import { describe, it, expect } from 'vitest'
import { getTrackPlacement } from '../timetableTrack'

describe('getTrackPlacement', () => {
  it('places a slot inside 08:00–20:00 by its start and length', () => {
    expect(getTrackPlacement('09:00', '12:00', 4)).toEqual({ leftPct: (60 / 720) * 100, widthPct: 25 })
  })

  it('leaves out a slot that is entirely before or after the track', () => {
    expect(getTrackPlacement('06:00', '07:00', 4)).toBeNull()
    expect(getTrackPlacement('06:00', '08:00', 4)).toBeNull()
    expect(getTrackPlacement('20:00', '21:00', 4)).toBeNull()
  })

  it('clips a slot that runs past either end of the track', () => {
    expect(getTrackPlacement('07:00', '09:00', 4)).toEqual({ leftPct: 0, widthPct: (60 / 720) * 100 })
    expect(getTrackPlacement('19:00', '22:00', 4)).toEqual({
      leftPct: (660 / 720) * 100,
      widthPct: (60 / 720) * 100,
    })
  })

  it('keeps the minimum width inside the track', () => {
    const placement = getTrackPlacement('19:50', '20:00', 12)!
    expect(placement.leftPct + placement.widthPct).toBeCloseTo(100)
    expect(getTrackPlacement('10:00', '10:10', 12)!.widthPct).toBe(12)
  })
})
