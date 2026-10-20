import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  X,
  Trash,
  DownloadSimple,
  ArrowSquareOut,
  Clock,
  MapPin,
  WarningCircle,
  GraduationCap,
  BookOpen,
  CircleNotch,
  GoogleLogo,
} from '@phosphor-icons/react'
import { usePins } from '../hooks/usePins'
import { getSession } from '../services/authService'
import { generateIcsContent, buildGoogleCalendarUrl, downloadIcsFile } from '../services/calendarExport'
import {
  GoogleSyncError,
  isGoogleSyncConfigured,
  loadGisScript,
  syncPinsToGoogleCalendar,
  type GoogleSyncErrorCode,
  type SyncSummary,
} from '../services/googleCalendarSync'
import type { PinnedSchedule } from '../types/pin'

const SYNC_ERROR_MESSAGES: Record<GoogleSyncErrorCode, string> = {
  not_configured: 'ยังไม่ได้ตั้งค่า Google Calendar ในระบบนี้',
  script_unavailable: 'โหลดบริการ Google ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองเปิดหน้านี้ใหม่',
  denied: 'ไม่ได้รับอนุญาตจาก Google จึงยังไม่ซิงก์ (ยังดาวน์โหลด .ics หรือใช้ลิงก์ Google Calendar ได้ตามปกติ)',
  popup_blocked: 'เบราว์เซอร์บล็อกหน้าต่างขออนุญาตของ Google กรุณาอนุญาต pop-up แล้วลองใหม่',
  auth_expired: 'เซสชัน Google หมดอายุ กรุณากดซิงก์อีกครั้ง',
  api: 'เรียก Google Calendar ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
}

function formatSkippedNotice(skipped: PinnedSchedule[]): string {
  const skippedCodes = skipped.map((e) => e.eventCode || 'ไม่ระบุรหัส').join(', ')
  return `ข้ามการสอบที่ยังไม่ระบุวันจัดสอบจริง (${skippedCodes}) เพื่อไม่ให้ระบุวันที่ผิดพลาด`
}

function formatSyncSummary(result: SyncSummary): string {
  let message = `ซิงก์เสร็จแล้ว: เพิ่ม/อัปเดต ${result.upserted} ลบ ${result.deleted}`
  if (result.failed > 0) message += ` ล้มเหลว ${result.failed} (กดซิงก์อีกครั้งเพื่อลองใหม่)`
  if (result.pruneSkipped) message += ' — ข้ามขั้นลบเพราะดึงรายการเดิมจาก Google ไม่สำเร็จ'
  return message
}

export default function MyScheduleDrawer() {
  const navigate = useNavigate()
  const { pins, loading, error, removePin, isDrawerOpen, setIsDrawerOpen } = usePins()
  const [skippedNotice, setSkippedNotice] = useState<string | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [gisReady, setGisReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const syncEnabled = isGoogleSyncConfigured()

  const handleRemovePin = async (roomCode: string, scheduleSlot: string) => {
    const key = `${roomCode}#${scheduleSlot}`
    if (deletingKey) return
    setDeletingKey(key)
    setRemoveError(null)
    try {
      await removePin(roomCode, scheduleSlot)
    } catch (err) {
      console.error('Failed to remove pin:', err)
      setRemoveError('ลบรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setDeletingKey(null)
    }
  }

  const handleOpenClick = () => {
    const session = getSession()
    if (!session) {
      // Guests are redirected to /login per spec
      navigate('/login')
      return
    }
    setIsDrawerOpen(true)
  }

  const handleExportIcs = () => {
    setSkippedNotice(null)
    const { ics, skippedUnannouncedExams } = generateIcsContent(pins)

    if (skippedUnannouncedExams.length > 0) {
      setSkippedNotice(formatSkippedNotice(skippedUnannouncedExams))
    }

    downloadIcsFile('my-schedule.ics', ics)
  }

  // Preload the Google script so the click handler can open the consent popup synchronously.
  useEffect(() => {
    if (!isDrawerOpen || !syncEnabled) return
    let cancelled = false
    loadGisScript()
      .then(() => {
        if (!cancelled) setGisReady(true)
      })
      .catch(() => {
        if (!cancelled) setSyncResult({ kind: 'error', message: SYNC_ERROR_MESSAGES.script_unavailable })
      })
    return () => {
      cancelled = true
    }
  }, [isDrawerOpen, syncEnabled])

  const handleSyncGoogle = async () => {
    if (syncing) return
    setSkippedNotice(null)
    setSyncResult(null)
    setSyncing(true)
    try {
      const userId = getSession()?.user.sub || ''
      // Must run synchronously from the click so the browser allows Google's consent popup.
      const result = await syncPinsToGoogleCalendar(pins, { userId })
      if (result.skippedExams.length > 0) setSkippedNotice(formatSkippedNotice(result.skippedExams))
      setSyncResult({ kind: result.failed > 0 || result.pruneSkipped ? 'error' : 'success', message: formatSyncSummary(result) })
    } catch (err) {
      const code = err instanceof GoogleSyncError ? err.code : 'api'
      setSyncResult({ kind: 'error', message: SYNC_ERROR_MESSAGES[code] })
    } finally {
      setSyncing(false)
    }
  }

  // Close drawer on Escape key press
  useEffect(() => {
    if (!isDrawerOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDrawerOpen, setIsDrawerOpen])

  return (
    <>
      {/* Trigger Button in TopBar */}
      <button
        type="button"
        onClick={handleOpenClick}
        data-testid="my-schedule-placeholder"
        aria-label="My Schedule"
        title="My Schedule"
        className="btn btn-nav shrink-0"
      >
        <Calendar size={16} weight="bold" />
        <span className="hidden sm:inline">My Schedule</span>
        {pins.length > 0 && (
          <span
            data-testid="pins-count-badge"
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs leading-none font-bold text-ink"
          >
            {pins.length}
          </span>
        )}
      </button>

      {/* Drawer Overlay & Panel (Teleported to document.body to escape header containing block) */}
      {isDrawerOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="my-schedule-title"
            className="fixed inset-0 z-2001 flex justify-end"
          >
            {/* Backdrop */}
            <div
              data-testid="drawer-backdrop"
              onClick={() => setIsDrawerOpen(false)}
              className="absolute inset-0 bg-black/50"
            />

            {/* Slide-out Sheet */}
            <div className="relative z-2002 flex h-full w-full max-w-md flex-col bg-white shadow-modal">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-line-soft px-5 py-4 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tertiary text-ink">
                    <Calendar size={18} weight="bold" />
                  </div>
                  <div>
                    <h2 id="my-schedule-title" className="font-display text-h3-sm font-bold text-ink">
                      My Schedule
                    </h2>
                    <p className="text-xs text-ink-3">ตารางเรียนและตารางสอบของฉัน ({pins.length})</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  data-testid="close-my-schedule-drawer"
                  aria-label="ปิด"
                  className="btn btn-ghost btn-icon-sm"
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              {/* Export Toolbar */}
              {/* Always rendered: sync stays usable with zero pins (removing the last pin must still be syncable). */}
              <div className="surface px-5 py-4 space-y-2 shrink-0">
                <span className="block text-xs font-medium text-ink-2">
                  ส่งออกไปยังแอปปฏิทิน
                </span>
                {/* Fixed two-column grid with constant labels so buttons never reflow while syncing or when pins change. */}
                <div className="grid grid-cols-2 gap-2">
                  {syncEnabled && (
                    <button
                      type="button"
                      onClick={handleSyncGoogle}
                      disabled={!gisReady || syncing || loading || Boolean(error)}
                      data-testid="sync-google-button"
                      title="เพิ่ม/อัปเดตตารางทั้งหมดลง Google Calendar และลบรายการที่นำออกจากตารางแล้ว"
                      className="btn btn-secondary btn-sm w-full"
                    >
                      {syncing ? (
                        <CircleNotch size={14} weight="bold" className="animate-spin" />
                      ) : (
                        <GoogleLogo size={14} weight="bold" />
                      )}
                      <span>ซิงก์ Google Calendar</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportIcs}
                    disabled={pins.length === 0}
                    data-testid="export-ics-button"
                    className="btn btn-primary btn-sm w-full col-start-2"
                  >
                    <DownloadSimple size={14} weight="bold" />
                    <span>ดาวน์โหลด (.ics)</span>
                  </button>
                </div>
              </div>

              {/* Google Calendar sync result */}
              {syncResult && (
                <div
                  role={syncResult.kind === 'error' ? 'alert' : 'status'}
                  data-testid="sync-google-result"
                  className={`card mx-5 mt-3 flex items-start gap-2 p-3 text-xs text-ink shrink-0 ${
                    syncResult.kind === 'error' ? 'border-ink' : ''
                  }`}
                >
                  <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5 text-ink" />
                  <p className="leading-relaxed">{syncResult.message}</p>
                </div>
              )}

              {/* Notice for skipped unannounced exams */}
              {skippedNotice && (
                <div
                  role="status"
                  className="card mx-5 mt-3 flex items-start gap-2 p-3 text-xs text-ink shrink-0"
                >
                  <WarningCircle size={16} weight="fill" className="shrink-0 text-ink mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">ข้อควรทราบการส่งออก</p>
                    <p className="text-xs leading-relaxed text-ink-2">{skippedNotice}</p>
                  </div>
                </div>
              )}

              {/* Body: List of Pins */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
                {removeError && (
                  <div
                    role="alert"
                    className="card flex items-center justify-between gap-2 border-ink p-3 text-xs font-medium text-ink shrink-0"
                  >
                    <div className="flex items-center gap-2">
                      <WarningCircle size={16} weight="fill" className="text-ink shrink-0" />
                      <span>{removeError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRemoveError(null)}
                      aria-label="ปิดข้อความแจ้งเตือน"
                      className="btn btn-ghost btn-icon-sm"
                    >
                      <X size={14} weight="bold" />
                    </button>
                  </div>
                )}

              {pins.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tertiary text-ink-3">
                    <Calendar size={24} weight="duotone" />
                  </div>
                  <div className="space-y-1 max-w-xs">
                    <p className="text-button font-bold text-ink">
                      ยังไม่มีตารางใน My Schedule
                    </p>
                    <p className="text-xs text-ink-3 leading-relaxed">
                      เลือกห้องเรียนบนแผนที่ แล้วคลิกปุ่มบันทึก (Bookmark) ที่ช่องตารางเพื่อเพิ่มลงในปฏิทินส่วนตัว
                    </p>
                  </div>
                </div>
              ) : (
                pins.map((pin) => {
                  const isExam = pin.eventType?.toLowerCase() === 'exam'
                  const gCalUrl = buildGoogleCalendarUrl(pin)
                  const pinKey = pin.pinKey || `${pin.roomCode}#${pin.scheduleSlot}`
                  const isDeleting = deletingKey === pinKey

                  return (
                    <div
                      key={pin.pinKey || `${pin.roomCode}#${pin.scheduleSlot}`}
                      data-testid={`pinned-item-${pin.roomCode}-${pin.scheduleSlot}`}
                      className="card card-hover p-4 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-bold text-ink">
                              {pin.eventCode || '-'}
                            </span>
                            <span
                              className={`chip ${
                                isExam ? 'border-line bg-tertiary text-ink' : 'border-accent text-accent'
                              }`}
                            >
                              {isExam ? (
                                <GraduationCap size={11} weight="bold" />
                              ) : (
                                <BookOpen size={11} weight="bold" />
                              )}
                              <span>{isExam ? 'สอบ' : 'เรียน'}</span>
                            </span>
                            {pin.dayOfWeek && (
                              <span className="chip">
                                {pin.dayOfWeek}
                              </span>
                            )}
                          </div>
                          {pin.eventName && (
                            <p className="text-xs font-medium text-ink-2 line-clamp-1">
                              {pin.eventName}
                            </p>
                          )}
                        </div>

                        {/* Remove pin button */}
                        <button
                          type="button"
                          onClick={() => handleRemovePin(pin.roomCode, pin.scheduleSlot)}
                          disabled={isDeleting || Boolean(deletingKey)}
                          data-testid={`remove-pin-${pin.roomCode}-${pin.scheduleSlot}`}
                          aria-label={`นำ ${pin.eventCode} ออกจากตาราง`}
                          title="นำออกจากตารางของฉัน"
                          className={`btn btn-ghost btn-icon-sm ${
                            isDeleting || Boolean(deletingKey)
                              ? 'opacity-50 cursor-not-allowed'
                              : 'cursor-pointer'
                          }`}
                        >
                          {isDeleting ? (
                            <CircleNotch size={14} weight="bold" className="animate-spin" />
                          ) : (
                            <Trash size={14} weight="bold" />
                          )}
                        </button>
                      </div>

                      {/* Room & Time information */}
                      <div className="flex items-center gap-3 text-xs font-medium text-ink-2">
                        <span className="inline-flex items-center gap-1 font-medium text-ink">
                          <MapPin size={12} weight="bold" className="text-ink-3" />
                          ห้อง {pin.roomCode}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} weight="bold" className="text-ink-3" />
                          {pin.startTime} - {pin.endTime}
                        </span>
                      </div>

                      {/* Real date for exam or Google Calendar action */}
                      <div className="pt-1.5 border-t border-line-soft flex items-center justify-between gap-2">
                        {isExam && pin.eventDate ? (
                          <span className="chip border-line bg-tertiary text-ink">
                            วันสอบ: {pin.eventDate}
                          </span>
                        ) : isExam ? (
                          <span className="text-xs text-ink-3">
                            (ยังไม่ประกาศวันสอบจริง)
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">
                            ประจำทุกสัปดาห์
                          </span>
                        )}

                        {gCalUrl ? (
                          <a
                            href={gCalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`gcal-link-${pin.roomCode}-${pin.scheduleSlot}`}
                            className="link inline-flex items-center gap-1 text-xs"
                          >
                            <span>Google Calendar</span>
                            <ArrowSquareOut size={12} weight="bold" />
                          </a>
                        ) : (
                          <span className="text-xs text-ink-3" title="ต้องมีวันสอบจริงเพื่อเพิ่มลง Google Calendar">
                            รอประกาศวันสอบ
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
