import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  MagnifyingGlass,
  ShieldCheck,
  SignIn,
  MapTrifold,
  MapPin,
  Calendar,
  X,
  Users,
} from '@phosphor-icons/react'
import { useRooms } from '../hooks/useRooms'
import { usePreloadImages } from '../hooks/usePreloadImages'
import MapContainer from '../components/map/MapContainer'
import { FLOOR_CONFIGS } from '../components/map/floorConfig'
import SearchResultList from '../components/SearchResultList'
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
import { getCategoryIcon } from '../components/categoryIcon'
import perimeterLogoNoBg from '../assets/perimeter_logo_negative_nobg.png'

const FLOOR_PLAN_ASSETS = FLOOR_CONFIGS.map((config) => config.asset)

/**
 * PrototypeLanding — Split Portal with Guest Preview Card
 *
 * Features:
 * 1. Guests can freely browse the map, switch floors, and click rooms.
 * 2. Clicking a room opens a compact preview card on the right (without full schedule list).
 * 3. Schedule teaser button on the card lets users transition into /prototype/map.
 * 4. Slide-out animation uses explicit CSS transforms to ensure smooth 60fps playback.
 * 5. Instant search with live dropdown (Rooms & Locations ONLY, no course/schedule search on Landing).
 */
export default function PrototypeLanding() {
  const navigate = useNavigate()
  const { rooms, loading, error } = useRooms()
  usePreloadImages(FLOOR_PLAN_ASSETS)

  const [currentFloor, setCurrentFloor] = useState(1)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
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
    handleEnterFullMap(null, quickQuery)
  }

  function handleAdminLogin() {
    setIsSlidingOut(true)
    setTimeout(() => {
      navigate('/admin')
    }, 400)
  }

  function handleRegularLogin() {
    setIsSlidingOut(true)
    setTimeout(() => {
      navigate('/map')
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
        <MapContainer
          rooms={rooms}
          currentFloor={currentFloor}
          onFloorChange={setCurrentFloor}
          selectedRoomId={selectedRoomId}
          onSelectRoom={handleRoomSelect}
          onClearSelection={() => setSelectedRoomId(null)}
          initialScale={1.35}
        />
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
            <div className="flex items-center justify-center sm:justify-between mb-6 sm:mb-8 w-full">
              <img
                src={perimeterLogoNoBg}
                alt="Perimeter"
                className="h-16 sm:h-16 w-auto object-contain cursor-pointer drop-shadow-xs"
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

            {/* Desktop Only: Instant Search Bar & Live Dropdown */}
            <div ref={searchContainerRef} className="hidden sm:block relative mt-6 w-full">
              <form onSubmit={handleSearchSubmit} className="space-y-3">
                <div className="relative">
                  <MagnifyingGlass
                    size={18}
                    weight="bold"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={quickQuery}
                    onChange={(e) => {
                      setQuickQuery(e.target.value)
                      setIsDropdownOpen(true)
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder="พิมพ์เลขห้อง หรือชื่อสถานที่ เช่น LC3-101, ห้องบรรยาย..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all shadow-xs"
                  />
                </div>

                {/* Primary Search CTA */}
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 active:bg-slate-950 transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-[0.99]"
                >
                  <span>ค้นหาบนแผนที่</span>
                  <ArrowRight size={16} weight="bold" />
                </button>

                {/* Dedicated Log in as ADMIN Button */}
                <button
                  type="button"
                  onClick={handleAdminLogin}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-all cursor-pointer shadow-xs active:scale-[0.99]"
                >
                  <ShieldCheck size={18} weight="bold" className="text-slate-600" />
                  <span>Log in as ADMIN</span>
                </button>
              </form>

              {/* Live Search Results Dropdown (Rooms ONLY, NO schedules) */}
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

          {/* Mobile Only: Regular User Login (Admin room editing is restricted to PC) */}
          <div className="sm:hidden my-auto w-full max-w-xs mx-auto py-8">
            <button
              type="button"
              onClick={handleRegularLogin}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-slate-900 py-4 text-base font-bold text-white hover:bg-slate-800 active:bg-slate-950 transition-all cursor-pointer shadow-lg active:scale-[0.99]"
            >
              <SignIn size={22} weight="bold" className="text-slate-200" />
              <span>Log in</span>
            </button>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <button
              type="button"
              onClick={() => handleEnterFullMap()}
              className="hidden sm:flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer shadow-xs"
            >
              <MapTrifold size={16} weight="bold" className="text-slate-500" />
              <span>หรือคลิกเพื่อดูแผนที่เต็มจอ</span>
            </button>
            <p className="text-center text-[11px] text-slate-400">
              Perimeter Navigation System · Faculty Map (Public Access)
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
