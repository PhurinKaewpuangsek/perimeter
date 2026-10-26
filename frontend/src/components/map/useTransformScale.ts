import { useContext, useEffect, useRef, useState } from 'react'
import { Context } from 'react-zoom-pan-pinch'

/**
 * Safely extracts current zoom scale from react-zoom-pan-pinch context.
 * Throttles scale updates to at most once per 100ms during active zooming (so markers
 * adapt in real-time without swelling or blurring) and settles immediately (80ms) when done.
 * Completely ignores panning so dragging the map causes zero re-renders.
 */
export function useTransformScale(): number {
  const transformContext = useContext(Context)
  const [scale, setScale] = useState<number>(
    transformContext?.state?.scale ?? 1
  )
  const lastScaleRef = useRef<number>(transformContext?.state?.scale ?? 1)
  const lastUpdateRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!transformContext) return
    const callback = (ref: { state: { scale: number } }) => {
      const currentScale = ref?.state?.scale
      if (!currentScale || currentScale <= 0) return
      // Panning reports the same scale: ignore completely (0 re-renders during pan)
      if (Math.abs(currentScale - lastScaleRef.current) < 0.01) return

      const now = performance.now()
      // During active zooming: update at most once per 100ms if scale changed noticeably
      if (now - lastUpdateRef.current >= 100 && Math.abs(currentScale - lastScaleRef.current) >= 0.08) {
        lastUpdateRef.current = now
        lastScaleRef.current = currentScale
        setScale(currentScale)
      } else {
        // Trailing settle: update immediately once movement pauses (within 80ms)
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          lastUpdateRef.current = performance.now()
          lastScaleRef.current = currentScale
          setScale(currentScale)
        }, 80)
      }
    }
    transformContext.onChangeCallbacks.add(callback)
    return () => {
      clearTimeout(timerRef.current)
      transformContext.onChangeCallbacks.delete(callback)
    }
  }, [transformContext])

  return scale
}
