import { ArrowClockwise, CircleNotch, WarningCircle } from '@phosphor-icons/react'
import torchLogo from '../assets/torchv1.PNG'

export interface LoadingScreenProps {
  error?: Error | null
  onRetry?: () => void
}

/**
 * Full-screen cover shown until the rooms and the floor plans are both ready.
 *
 * The locations API takes a couple of seconds, and a bare floor plan with a small
 * "loading" note on it still reads as a map with nothing in it. Holding the whole map back
 * until its markers can arrive with it makes the wait unmistakable.
 */
function LoadingScreen({ error = null, onRetry }: LoadingScreenProps) {
  return (
    <main className="flex h-[100dvh] w-screen flex-col items-center justify-center gap-6 bg-white px-5">
      <img src={torchLogo} alt="TORCH Faculty Nav System" className="h-10 w-auto select-none" draggable={false} />

      {error ? (
        <div role="alert" className="flex flex-col items-center gap-3 text-center">
          <WarningCircle size={40} weight="bold" className="text-ink" aria-hidden="true" />
          <p className="text-body font-medium text-ink">โหลดข้อมูลแผนที่ไม่สำเร็จ</p>
          <p className="text-button text-ink-2">{error.message || 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง'}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn btn-primary mt-2">
              <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
              ลองใหม่
            </button>
          )}
        </div>
      ) : (
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
          <CircleNotch size={40} weight="bold" className="animate-spin text-ink" aria-hidden="true" />
          <p className="text-body font-medium text-ink-2">กำลังโหลดแผนที่...</p>
        </div>
      )}
    </main>
  )
}

export default LoadingScreen
