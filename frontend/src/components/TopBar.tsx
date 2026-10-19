import { useEffect, useState, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  CaretLeft,
  SignIn,
  MapTrifold,
  SquaresFour,
  Shield,
  CaretUp,
  Compass,
  SidebarSimple,
  Check,
  ArrowRight,
} from '@phosphor-icons/react'
import perimeterLogoNoBg from '../assets/perimeter_logo_negative_nobg.png'
import AccountMenu from './AccountMenu'
import MyScheduleDrawer from './MyScheduleDrawer'
import { FLOOR_CONFIGS } from './map/floorConfig'
import { getSession, getUserRole } from '../services/authService'
import type { AuthSession } from '../types/auth'

export interface TopBarProps {
  className?: string
  sidebarWidth?: number
  isSidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  currentFloor?: number
  onFloorChange?: (floor: number) => void
  mapView?: '2d' | '3d'
  onToggleMapView?: () => void
}

/**
 * TopBar — Figma UI3-inspired Spatial Navigation System (Clean Frosted-White Theme)
 * Shared across /map, /staff, and /admin.
 *
 * Zones:
 * 1. Top-Left Brand Header: Docks flush as the top header of the Left Sidebar (or floats as a compact pill when collapsed / on /admin).
 * 2. Top-Right Corner Cluster: Sleek h-10 pill for "My Schedule" and AccountMenu / Sign In with 1px divider (no nested pill borders).
 * 3. Bottom-Center Unified Dock: Mode switcher (Map / Consoles) + Floor switcher + 2D/3D toggle centered over the visible map canvas.
 */
export default function TopBar({
  className = '',
  sidebarWidth,
  isSidebarCollapsed = false,
  onToggleSidebar,
  currentFloor,
  onFloorChange,
  mapView,
  onToggleMapView,
}: TopBarProps) {
  const [session, setSession] = useState<AuthSession | null>(() => getSession())
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const pathname = location.pathname
  const role = getUserRole(session)
  const isStaffOrAdmin = role === 'staff' || role === 'admin'

  const activeWorkspace =
    pathname === '/admin'
      ? {
          label: 'Admin Console',
          icon: <Shield size={14} weight="fill" className="text-rose-400" />,
        }
      : pathname === '/staff'
        ? {
            label: 'Staff Console',
            icon: <SquaresFour size={14} weight="fill" className="text-amber-400" />,
          }
        : {
            label: 'แผนที่ LC3',
            icon: <Compass size={14} weight="fill" className="text-sky-400" />,
          }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setIsWorkspaceOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    function refreshSession() {
      setSession(getSession())
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshSession()
    }

    const expiryTimer = session
      ? window.setTimeout(refreshSession, Math.max(0, session.expiresAt - Date.now() + 1))
      : undefined

    window.addEventListener('storage', refreshSession)
    window.addEventListener('focus', refreshSession)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
      window.removeEventListener('storage', refreshSession)
      window.removeEventListener('focus', refreshSession)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [session])

  const isDockedSidebarHeader = Boolean(sidebarWidth && !isSidebarCollapsed)
  const dockCenterLeft =
    sidebarWidth && !isSidebarCollapsed ? `calc(50% + ${Math.round(sidebarWidth / 2)}px)` : '50%'

  return (
    <header
      data-testid="map-top-bar"
      className={`pointer-events-none fixed inset-0 z-50 select-none ${className}`}
    >
      {/* =====================================================================
          ZONE 1: TOP-LEFT BRAND HEADER (Docked flush to Left Sidebar or Compact Pill)
          ===================================================================== */}
      <div
        style={isDockedSidebarHeader ? { width: `${sidebarWidth}px` } : undefined}
        className={
          isDockedSidebarHeader
            ? 'pointer-events-auto absolute top-0 left-0 flex h-14 max-w-full items-center justify-between border-b border-r border-slate-200/90 bg-white px-3.5 sm:px-4 transition-all duration-300'
            : 'pointer-events-auto absolute top-3 left-3 sm:left-4 flex h-10 items-center gap-2 rounded-full border border-slate-200/80 bg-white/95 px-2.5 sm:px-3.5 shadow-md backdrop-blur-xl transition-all duration-300'
        }
      >
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/"
            data-testid="back-to-home"
            aria-label="กลับหน้าแรก"
            title="กลับหน้าแรก"
            className="flex items-center gap-1.5 group cursor-pointer shrink-0"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-900 transition-colors">
              <CaretLeft size={15} weight="bold" />
            </div>
            <img
              src={perimeterLogoNoBg}
              alt="Perimeter"
              className="h-8 sm:h-10 w-auto object-contain drop-shadow-xs"
            />
          </Link>

          {pathname === '/admin' ? (
            <>
              <div className="h-4 w-px bg-slate-200 shrink-0" />
              <span className="truncate text-xs font-bold text-slate-800">Admin Console</span>
            </>
          ) : pathname === '/staff' ? (
            <>
              <div className="h-4 w-px bg-slate-200 shrink-0" />
              <span className="truncate text-xs font-bold text-slate-800">จัดการข้อมูลอาคาร LC3</span>
            </>
          ) : null}
        </div>

        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={isSidebarCollapsed ? 'ขยายแผงด้านซ้าย' : 'ซ่อนแผงด้านซ้าย'}
            title={isSidebarCollapsed ? 'ขยายแผงด้านซ้าย' : 'ซ่อนแผงด้านซ้าย'}
            className="hidden sm:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 active:scale-95 transition-all cursor-pointer"
          >
            <SidebarSimple size={17} weight="bold" />
          </button>
        )}
      </div>

      {/* =====================================================================
          ZONE 2: TOP-RIGHT CORNER CLUSTER (Sleek h-10 Pill, Zero Nested Borders)
          ===================================================================== */}
      <div className="pointer-events-auto absolute top-3 right-3 sm:right-5 flex h-10 items-center gap-1 rounded-full border border-slate-200/80 bg-white/95 px-1.5 shadow-md backdrop-blur-xl">
        {/* My Schedule Drawer */}
        <MyScheduleDrawer />

        <div className="h-4 w-px bg-slate-200 shrink-0" />

        {/* Account Menu (authenticated) or Login Entry (unauthenticated) */}
        {session ? (
          <AccountMenu />
        ) : (
          <Link
            to="/login"
            data-testid="login-link"
            aria-label="เข้าสู่ระบบ"
            title="เข้าสู่ระบบ"
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-slate-900 px-2.5 sm:px-3 text-xs font-semibold text-white hover:bg-slate-800 active:bg-slate-950 transition-all cursor-pointer shrink-0"
          >
            <SignIn size={13} weight="bold" />
            <span className="hidden sm:inline">เข้าสู่ระบบ</span>
          </Link>
        )}
      </div>

      {/* =====================================================================
          ZONE 3: BOTTOM-CENTER UNIFIED FIGMA DOCK (Centered to Visible Map Canvas)
          ===================================================================== */}
      <nav
        style={{ left: dockCenterLeft }}
        className="pointer-events-auto hidden sm:flex absolute bottom-5 -translate-x-1/2 h-11 items-center gap-1 rounded-full border border-slate-200/90 bg-white/95 px-1.5 text-xs font-semibold shadow-xl backdrop-blur-xl transition-[left] duration-300 ease-in-out"
      >
        {/* Dynamic Workspace Switcher (Only visible for Staff / Admin) */}
        {isStaffOrAdmin && (
          <div className="relative" ref={workspaceRef}>
            <button
              type="button"
              aria-label="สลับพื้นที่ทำงาน"
              aria-expanded={isWorkspaceOpen}
              data-testid="workspace-switcher-trigger"
              onClick={() => setIsWorkspaceOpen((prev) => !prev)}
              className={`inline-flex h-8 items-center gap-1.5 px-3 rounded-full text-xs font-semibold shadow-2xs transition-all cursor-pointer ${
                isWorkspaceOpen
                  ? 'bg-slate-200 text-slate-900'
                  : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900 active:bg-slate-200'
              }`}
            >
              {activeWorkspace.icon}
              <span>{activeWorkspace.label}</span>
              <CaretUp
                size={11}
                weight="bold"
                className={`transition-transform duration-200 ${isWorkspaceOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Upward Workspace Popover */}
            {isWorkspaceOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full pb-2.5 z-50 w-76 animate-in fade-in zoom-in-95 duration-100">
                <div className="rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-2xl ring-1 ring-slate-900/5 space-y-1">
                {/* Workspace 1: แผนที่ (Map View) */}
                <Link
                  to="/map"
                  aria-label="ดูผังอาคาร LC3"
                  onClick={() => setIsWorkspaceOpen(false)}
                  className={`group flex items-center justify-between gap-3 rounded-xl p-2.5 transition-all ${
                    pathname === '/map' ? 'bg-slate-100/80' : 'hover:bg-slate-100/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200/60 bg-sky-50 text-sky-600">
                      <MapTrifold size={18} weight="fill" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        แผนที่อาคารเรียนรวม 3
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        ค้นหาห้องเรียนและตารางเวลา
                      </p>
                    </div>
                  </div>
                  {pathname === '/map' ? (
                    <Check size={14} weight="bold" className="text-slate-900 shrink-0 mr-0.5" />
                  ) : (
                    <ArrowRight
                      size={14}
                      weight="bold"
                      className="text-slate-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-slate-700 transition-all duration-150 shrink-0 mr-0.5"
                    />
                  )}
                </Link>

                {/* Workspace 2: Staff Console */}
                <Link
                  to="/staff"
                  aria-label="แผงจัดการข้อมูล Staff"
                  onClick={() => setIsWorkspaceOpen(false)}
                  className={`group flex items-center justify-between gap-3 rounded-xl p-2.5 transition-all ${
                    pathname === '/staff' ? 'bg-slate-100/80' : 'hover:bg-slate-100/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/60 bg-amber-50 text-amber-600">
                      <SquaresFour size={18} weight="fill" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">Staff Console</div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        จัดการห้องเรียนและพิกัดแผนที่
                      </p>
                    </div>
                  </div>
                  {pathname === '/staff' ? (
                    <Check size={14} weight="bold" className="text-slate-900 shrink-0 mr-0.5" />
                  ) : (
                    <ArrowRight
                      size={14}
                      weight="bold"
                      className="text-slate-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-slate-700 transition-all duration-150 shrink-0 mr-0.5"
                    />
                  )}
                </Link>

                {/* Workspace 3: Admin Console (Admin Only) */}
                {role === 'admin' && (
                  <Link
                    to="/admin"
                    aria-label="แผงจัดการระบบ Admin"
                    onClick={() => setIsWorkspaceOpen(false)}
                    className={`group flex items-center justify-between gap-3 rounded-xl p-2.5 transition-all ${
                      pathname === '/admin' ? 'bg-slate-100/80' : 'hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-200/60 bg-rose-50 text-rose-600">
                        <Shield size={18} weight="fill" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          Admin Console
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          จัดการบัญชีผู้ใช้และระบบ
                        </p>
                      </div>
                    </div>
                    {pathname === '/admin' ? (
                      <Check size={14} weight="bold" className="text-slate-900 shrink-0 mr-0.5" />
                    ) : (
                      <ArrowRight
                        size={14}
                        weight="bold"
                        className="text-slate-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-slate-700 transition-all duration-150 shrink-0 mr-0.5"
                      />
                    )}
                  </Link>
                )}
              </div>
            </div>
            )}
          </div>
        )}

        {/* Integrated Floor Switcher (1st Floor | 2nd Floor) when on Map / Staff */}
        {currentFloor !== undefined && onFloorChange && (
          <>
            {isStaffOrAdmin && <div className="mx-1 h-4 w-px bg-slate-200 shrink-0" />}
            <div role="group" aria-label="Floor switcher" className="flex items-center gap-0.5">
              {FLOOR_CONFIGS.map((floor) => {
                const isActive = floor.floor === currentFloor
                return (
                  <button
                    key={floor.floor}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onFloorChange(floor.floor)}
                    className={`h-8 rounded-full px-3 text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {floor.label}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Integrated 2D / 3D View Toggle when on Map / Staff */}
        {mapView !== undefined && onToggleMapView && (
          <>
            <div className="mx-1 h-4 w-px bg-slate-200 shrink-0" />
            <button
              type="button"
              onClick={onToggleMapView}
              className="h-8 rounded-full bg-slate-100/90 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200/80 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
            >
              {mapView === '3d' ? 'แผนที่ 2D' : 'แผนที่ 3D'}
            </button>
          </>
        )}
      </nav>
    </header>
  )
}

