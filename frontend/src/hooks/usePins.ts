import { useContext } from 'react'
import { PinsContext, type PinsContextType } from '../context/pinsContextDef'

export function usePins(): PinsContextType {
  return useContext(PinsContext)
}

export { computeScheduleSlot, PinsContext, defaultContextValue } from '../context/pinsContextDef'
export type { PinsContextType } from '../context/pinsContextDef'
