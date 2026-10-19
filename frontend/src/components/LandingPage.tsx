import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  SignIn,
  MapTrifold,
  MapPin,
  Calendar,
  X,
  Users,
} from '@phosphor-icons/react'
import { useRooms } from '../hooks/useRooms'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { usePreloadImages } from '../hooks/usePreloadImages'
import MapContainer from './map/MapContainer'
import { FLOOR_CONFIGS } from './map/floorConfig'
import SearchResultList from './SearchResultList'
import { PlaceholdersAndVanishInput } from './ui/PlaceholdersAndVanishInput'
import {
  filterRooms,
  DEFAULT_CATEGORY_KEY,
} from '../services/filterRooms'
import {
  getBuildingLabel,
  getCategoryLabel,
  getLandmarkText,
  getCategoryColor,
} from '../services/roomDisplay'
import { getCategoryIcon } from './categoryIcon'
import perimeterLogoNoBg from '../assets/perimeter_logo_negative_nobg.png'

const FLOOR_PLAN_ASSETS = FLOOR_CONFIGS.map((config) => config.asset)

const SEARCH_PLACEHOLDERS = [
  'พิมพ์เลขห้อง เช่น LC3-101',
  'ค้นหาห้องบรรยาย เช่น บรรยาย 1',
  'ค้นหาห้องน้ำชาย / หญิง',
  'ค้นหาห้อง 108/1, 102...',
  'ค้นหาห้องปฏิบัติการ หรือ Lab...',
  'ค้นหาห้องพักอาจารย์',
]

/**
 * LandingPage — Split Portal with Guest Preview Card & Mobile Regular Login
 *
 * Route: /
 * Features:
 * 1. Desktop: Split portal with instant search, interactive map preview, and guest preview card.
 * 2. Mobile: Clean branded screen with Regular User Login (Admin edit is desktop-only).
 * 3. Smooth slide-out transitions into /map.
 */
export default function LandingPage() {
  const navigate = useNavigate()
  const { rooms, loading, error } = useRooms()
  usePreloadImages(FLOOR_PLAN_ASSETS)

  const isDesktop = useIsDesktop()
  const [currentFloor, setCurrentFloor] = useState(1)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [demoInterrupted, setDemoInterrupted] = useState(false)
  const [quickQuery, setQuickQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isSlidingOut, setIsSlidingOut] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId),
    [rooms, selectedRoomId]
  )

  // Landing page: Search ONLY by room number, name, and aliases (NO Course ID / Schedule search)
  const searchResults = useMemo(() => {
    if (!quickQuery.trim()) return []
    return filterRooms(rooms, quickQuery, DEFAULT_CATEGORY_KEY, [])
  }, [rooms, quickQuery])

  function handleRoomSelect(roomId: string) {
    setDemoInterrupted(true)
    setSelectedRoomId(roomId)
    setIsDropdownOpen(false)
    const targetRoom = rooms.find((r) => r.id === roomId)
    if (targetRoom && targetRoom.floor !== currentFloor) {
      setCurrentFloor(targetRoom.floor)
    }
  }

  function handleEnterFullMap(targetRoomId?: string | null, query?: string) {
    setIsSlidingOut(true)
    setTimeout(() => {
      let targetUrl = '/map'
      const params = new URLSearchParams()
      if (targetRoomId) params.set('room', targetRoomId)
      if (query && query.trim()) params.set('q', query.trim())
      const paramStr = params.toString()
      if (paramStr) targetUrl += `?${paramStr}`
      navigate(targetUrl)
    }, 450)
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!quickQuery.trim()) return

    const matches = filterRooms(rooms, quickQuery, DEFAULT_CATEGORY_KEY, [])
    if (matches.length > 0) {
      handleRoomSelect(matches[0].id)
    } else {
      setIsDropdownOpen(true)
    }
  }

  function handleSignIn() {
    setIsSlidingOut(true)
    setTimeout(() => {
      navigate('/login')
    }, 400)
  }

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-slate-100 font-sans select-none">
      {/* Background Layer: Native MapContainer (Desktop only: hidden sm:block) */}
      <div
        className="hidden sm:block absolute inset-0 z-0"
        style={{
          transform: isSlidingOut ? 'scale(1.05)' : 'scale(1)',
          transition: 'transform 500ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* display:none still mounts children; skip the 3D model download on phones */}
        {isDesktop && (
          <MapContainer
            rooms={rooms}
            currentFloor={currentFloor}
            onFloorChange={(floor) => {
              setCurrentFloor(floor)
            }}
            selectedRoomId={selectedRoomId}
            onSelectRoom={handleRoomSelect}
            onClearSelection={() => {
              setSelectedRoomId(null)
            }}
            initialScale={1.35}
            sidebarWidth={460}
            idleOrbit
            demoInterrupted={demoInterrupted}
          />
        )}
      </div>

      {/* Main Split Portal Overlay */}
      <div className="relative z-20 flex h-full w-full pointer-events-none">
        {/* Left Split Sidebar on PC / Clean Mobile Landing View */}
        <aside
          style={{
            transform: isSlidingOut ? 'translateX(-100%)' : 'translateX(0)',
            opacity: isSlidingOut ? 0 : 1,
            transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1), opacity 350ms ease',
          }}
          className="pointer-events-auto flex h-full w-full sm:w-[460px] flex-col justify-between bg-white sm:bg-white/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl border-r border-slate-200/80 z-10"
        >
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
            {/* Top Branding (Prominent Logo) */}
            <div className="flex items-center justify-between mb-6 sm:mb-8 w-full">
              <img
                src={perimeterLogoNoBg}
                alt="Perimeter"
                className="h-14 sm:h-16 w-auto object-contain cursor-pointer drop-shadow-xs"
                onClick={() => handleEnterFullMap()}
                title="Perimeter"
              />
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
              <span className="sm:hidden">Perimeter</span>
              <span className="hidden sm:inline">ค้นหาห้องเรียนและสถานที่ได้ทันที</span>
            </h1>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed max-w-xs sm:max-w-none">
              <span className="sm:hidden">
                ผังอาคารเรียนรวม 3 (LC3) · ระบบแผนที่และสืบค้นห้องเรียน
              </span>
              <span className="hidden sm:inline">
                ผังอาคารเรียนรวม 3 (LC3) ค้นหาตามเลขห้องหรือชื่อสถานที่ (ตารางเรียนดูได้ในโหมดแผนที่เต็ม)
              </span>
            </p>

            {/* Desktop Only: Instant Command-Bar Search & Live Dropdown */}
            <div ref={searchContainerRef} className="hidden sm:block relative mt-6 w-full">
              {/* Search Box Input */}
              <div className="relative z-20">
                <PlaceholdersAndVanishInput
                  placeholders={SEARCH_PLACEHOLDERS}
                  value={quickQuery}
                  onChange={(e) => {
                    setQuickQuery(e.target.value)
                    setIsDropdownOpen(true)
                  }}
                  onFocus={() => {
                    setIsDropdownOpen(true)
                  }}
                  onClear={() => {
                    setQuickQuery('')
                    setIsDropdownOpen(false)
                  }}
                  onSubmit={handleSearchSubmit}
                />
              </div>

              {/* Quick Suggestion Chips (Centered) */}
              <div className="mt-3.5 flex flex-wrap items-center justify-center gap-1.5 w-full relative z-10">
                <span className="text-[11px] font-medium text-slate-400">แนะนำ:</span>
                {['LC3-101', 'ห้องบรรยาย 1', 'ห้องน้ำ'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setQuickQuery(chip)
                      setIsDropdownOpen(true)
                      const matches = filterRooms(rooms, chip, DEFAULT_CATEGORY_KEY, [])
                      if (matches.length > 0) {
                        handleRoomSelect(matches[0].id)
                      }
                    }}
                    className="rounded-lg border border-slate-200/90 bg-slate-50/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 active:scale-95 transition-all cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Reverted Sign In Button Placed Below Search Box (Dark Tone) */}
              <button
                type="button"
                onClick={handleSignIn}
                className="mt-4 hidden sm:flex w-full items-center justify-center gap-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white py-3.5 text-sm font-bold transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-[0.99] relative z-0"
              >
                <SignIn size={19} weight="bold" className="text-slate-200" />
                <span>เข้าสู่ระบบ (Sign in)</span>
              </button>

              {/* Live Search Results Dropdown (Positioned over the recommendation chips & Sign In button!) */}
              {isDropdownOpen && quickQuery.trim() !== '' && (
                <div className="absolute top-14 left-0 right-0 z-50 max-h-72 overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-100 p-2 animate-in fade-in zoom-in-95 duration-150">
                  <SearchResultList
                    rooms={searchResults}
                    schedules={[]}
                    schedulesLoading={false}
                    schedulesError={null}
                    loading={loading}
                    error={error}
                    onSelectRoom={(roomId) => handleRoomSelect(roomId)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mobile Only: Sign in */}
          <div className="sm:hidden my-auto w-full max-w-xs mx-auto py-8">
            <button
              type="button"
              onClick={handleSignIn}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-slate-900 py-4 text-base font-bold text-white hover:bg-slate-800 active:bg-slate-950 transition-all cursor-pointer shadow-lg active:scale-[0.99]"
            >
              <SignIn size={22} weight="bold" className="text-slate-200" />
              <span>เข้าสู่ระบบ (Sign in)</span>
            </button>
            {/* /map is public; without this a phone user has no way to reach it (the footer link is desktop-only). */}
            <button
              type="button"
              onClick={() => handleEnterFullMap()}
              className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-slate-300 bg-white py-4 text-base font-bold text-slate-800 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer shadow-xs active:scale-[0.99]"
            >
              <MapTrifold size={22} weight="bold" className="text-slate-600" />
              <span>ดูแผนที่ (ไม่ต้องเข้าสู่ระบบ)</span>
            </button>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-slate-100/90 pt-4 pb-1">
            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400 select-none">
              <span className="inline-flex items-center justify-center text-xs">©</span>
              <span>Perimeter Navigation System · Faculty Map (Public Access)</span>
            </p>
          </div>
        </aside>

        {/* Right Area: Interactive Map Canvas */}
        <div className="hidden sm:block flex-1 pointer-events-none" />
      </div>

      {/* =========================================================================
          RIGHT GUEST PREVIEW CARD: Desktop only, appears when clicking a room
          ========================================================================= */}
      {selectedRoom && (
        <aside
          style={{
            transform: isSlidingOut ? 'translateX(120%)' : 'translateX(0)',
            opacity: isSlidingOut ? 0 : 1,
            transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1), opacity 350ms ease',
          }}
          className="hidden sm:block fixed top-6 right-6 z-40 w-80 sm:w-96 rounded-3xl bg-white/95 p-5 shadow-2xl backdrop-blur-xl border border-slate-100/90 animate-in fade-in slide-in-from-right-4 duration-200 select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600">
              {getBuildingLabel(selectedRoom.building)} · ชั้น {selectedRoom.floor}
            </span>
            <button
              type="button"
              onClick={() => setSelectedRoomId(null)}
              aria-label="ปิดพรีวิวห้อง"
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          {/* Room Title */}
          <div className="mt-3">
            <h2 className="text-lg font-extrabold text-slate-900 leading-tight">
              {selectedRoom.nameThai || 'ไม่ระบุชื่อห้อง'}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">
                ห้อง {selectedRoom.roomNumber || selectedRoom.code || '-'}
              </span>
              {selectedRoom.code && <span>({selectedRoom.code})</span>}
              {selectedRoom.capacity !== undefined && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} />
                    {selectedRoom.capacity} คน
                  </span>
                </>
              )}
            </div>

            {/* Category Pill */}
            {(() => {
              const color = getCategoryColor(selectedRoom.category)
              const Icon = getCategoryIcon(selectedRoom.category, selectedRoom.nameThai)
              return (
                <span
                  className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full border ${color.border} ${color.bg} px-3 py-1 text-xs font-medium ${color.text} shadow-xs`}
                >
                  <Icon size={14} weight="duotone" />
                  <span>{getCategoryLabel(selectedRoom.category)}</span>
                </span>
              )
            })()}
          </div>

          {/* Nearby Landmarks */}
          {selectedRoom.landmarks && selectedRoom.landmarks.length > 0 && (
            <div className="mt-4 rounded-2xl bg-slate-50 p-3 border border-slate-100">
              <h3 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <MapPin size={13} weight="fill" className="text-rose-500" />
                <span>จุดสังเกตใกล้เคียง</span>
              </h3>
              <ul className="mt-1.5 space-y-1">
                {selectedRoom.landmarks.map((landmark, idx) => (
                  <li key={idx} className="text-xs text-slate-600 flex items-start gap-1">
                    <span className="text-slate-400">·</span>
                    <span>{getLandmarkText(landmark)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Schedule Teaser Box (Guest mode: No full schedule, encourages entering full mode) */}
          <div className="mt-4 rounded-2xl bg-gradient-to-br from-slate-50 to-orange-50/50 p-3.5 border border-orange-100/80">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                <Calendar size={16} weight="duotone" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">ตารางการใช้ห้องเรียนและสอบ</h4>
                <p className="text-[11px] text-slate-500 leading-tight">
                  ตารางเรียนและตารางสอบดูได้ในโหมดแผนที่เต็ม
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleEnterFullMap(selectedRoom.id)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 active:bg-slate-950 transition-all cursor-pointer shadow-sm hover:shadow"
            >
              <span>เปิดดูตารางในโหมดแผนที่เต็ม</span>
              <ArrowRight size={14} weight="bold" />
            </button>
          </div>
        </aside>
      )}
    </div>
  )
}



