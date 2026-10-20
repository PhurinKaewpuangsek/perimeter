import { createElement, useEffect } from 'react'
import type { ReactNode } from 'react'
import { MapPin, X } from '@phosphor-icons/react'
import { getCategoryIcon } from './categoryIcon.ts'
import { getBuildingLabel, getCategoryLabel, getLandmarkText, getCategoryColor } from '../services/roomDisplay.ts'

import type { Room } from '../types/room.ts'

export interface RoomDetailModalProps {
  rooms: Room[]
  loading?: boolean
  error?: Error | null
  /** id ของห้องที่ถูกเลือก (มาจาก Search Result หรือ Map Marker Click) */
  selectedRoomId: string | null
  /** ควบคุมการแสดงผล Modal — ถ้าไม่ระบุจะเปิดเมื่อ selectedRoomId !== null */
  isOpen?: boolean
  onClose: () => void
}

function renderCategoryIcon(category: string, name?: string): ReactNode {
  return createElement(getCategoryIcon(category, name), {
    size: 16,
    weight: 'duotone',
    className: 'text-current shrink-0',
    'aria-hidden': true,
  })
}

export function RoomDetailModal({
  rooms,
  loading = false,
  error = null,
  selectedRoomId,
  isOpen: isOpenProp,
  onClose,
}: RoomDetailModalProps) {
  const isOpen =
    isOpenProp !== undefined
      ? isOpenProp && selectedRoomId !== null
      : selectedRoomId !== null
  const room: Room | undefined = isOpen
    ? rooms.find((r) => r.id === selectedRoomId)
    : undefined

  // ปิดด้วยปุ่ม Esc
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const displayName = room?.nameThai ?? ''
  const displayCapacity = room?.capacity
  const landmarks = room?.landmarks ?? []
  const hasLandmarks = landmarks.length > 0

  return (
    <div className="fixed inset-0 z-2002 flex items-end justify-center pointer-events-none sm:justify-end sm:items-start sm:p-4">
      {/* Modal Card: Bottom Sheet on Mobile, Floating Side Card on Desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-modal-title"
        className="pointer-events-auto relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-none bg-white shadow-modal animate-modal-mobile sm:animate-modal-desktop sm:max-h-[calc(100vh-2rem)] sm:w-96 sm:border sm:border-line-soft"
      >
        {/* Top Header with Close Button */}
        <div className="relative flex shrink-0 items-center justify-between bg-white px-5 pt-3 pb-1 sm:pt-4 sm:pb-2">
          <div className="h-1.5 w-10 rounded-full bg-line-soft sm:hidden mx-auto absolute left-1/2 -translate-x-1/2 top-2" aria-hidden="true" />

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างรายละเอียดห้อง"
            className="btn btn-ghost btn-icon-sm ml-auto"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* เนื้อหา */}
        <div className="overflow-y-auto px-5 pb-8 pt-2">
          {loading && (
            <p className="py-6 text-center text-button text-ink-3">กำลังโหลดข้อมูลห้อง...</p>
          )}

          {!loading && error && (
            <p className="py-6 text-center text-button text-ink">
              เกิดข้อผิดพลาดในการโหลดข้อมูลห้อง: {error.message}
            </p>
          )}

          {!loading && !error && !room && (
            <p className="py-6 text-center text-button text-ink-3">ไม่พบข้อมูลห้องนี้</p>
          )}

          {!loading && !error && room && (
            <>
              <p className="text-xs font-medium text-ink-3 uppercase">
                {getBuildingLabel(room.building)} · ชั้น {room.floor}
              </p>

              <h2 id="room-modal-title" className="mt-1 font-display text-h3-sm font-bold text-ink">
                {displayName || 'ไม่ระบุชื่อห้อง'}
              </h2>

              <div className="mt-1 flex items-center gap-1.5 text-button text-ink-2">
                <span>
                  ห้อง {room.roomNumber || room.code || '-'}
                  {room.code ? ` (${room.code})` : ''}
                </span>
                {displayCapacity !== undefined && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>ความจุ {displayCapacity} คน</span>
                  </>
                )}
              </div>

              {(() => {
                const color = getCategoryColor(room.category)
                return (
                  <span
                    className={`mt-3 inline-flex items-center gap-1.5 w-fit rounded-full border ${color.border} ${color.bg} px-3 py-1 text-xs font-medium ${color.text}`}
                  >
                    {renderCategoryIcon(room.category, room.nameThai)}
                    <span>{getCategoryLabel(room.category)}</span>
                  </span>
                )
              })()}

              <div className="mt-5 border-t border-line-soft pt-4">
                <h3 className="text-button font-medium text-ink">จุดสังเกตใกล้เคียง</h3>

                {hasLandmarks ? (
                  <ul className="mt-2 space-y-2">
                    {landmarks.map((landmark, index) => (
                      <li
                        key={`${landmark.kind}-${landmark.ref_location_id ?? index}`}
                        className="flex items-start gap-2 text-button text-ink-2"
                      >
                        <MapPin size={16} weight="fill" className="text-ink shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{getLandmarkText(landmark)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-button text-ink-3">
                    ยังไม่มีข้อมูลจุดสังเกตสำหรับห้องนี้
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default RoomDetailModal
