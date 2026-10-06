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
    <main className="flex h-[100dvh] w-screen flex-col items-center justify-center gap-6 bg-white px-6 font-sans">
      <img src={torchLogo} alt="TORCH Faculty Nav System" className="h-10 w-auto select-none" draggable={false} />

      {error ? (
        <div role="alert" className="flex flex-col items-center gap-3 text-center">
          <WarningCircle size={40} weight="duotone" className="text-red-500" aria-hidden="true" />
          <p className="text-base font-medium text-slate-800">โหลดข้อมูลแผนที่ไม่สำเร็จ</p>
          <p className="text-sm text-slate-500">ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-slate-800 active:bg-slate-950 transition-colors duration-150 cursor-pointer"
            >
              <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
              ลองใหม่
            </button>
          )}
        </div>
      ) : (
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
          <CircleNotch size={40} weight="bold" className="animate-spin text-rose-500" aria-hidden="true" />
          <p className="text-base font-medium text-slate-700">กำลังโหลดแผนที่...</p>
        </div>
      )}
    </main>
  )
}

export default LoadingScreen
