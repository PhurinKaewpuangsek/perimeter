import { useEffect, useState, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
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
import perimeterLogoDarkNoBg from '../assets/perimeter_logo_negative_dark_nobg.png'
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

/** Height of the fixed top bar in px. Pages offset their content with `top-16` / `pt-16`. */
export const TOP_BAR_HEIGHT = 64

interface WorkspaceLinkProps {
  to: string
  ariaLabel: string
  icon: ReactNode
  title: string
  description: string
  active: boolean
  animClass?: string
  onNavigate: () => void
}

function WorkspaceLink({
  to,
  ariaLabel,
  icon,
  title,
  description,
  active,
  animClass = '',
  onNavigate,
}: WorkspaceLinkProps) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      onClick={onNavigate}
      className={`group flex items-center justify-between gap-3 p-2.5 transition-colors duration-200 ${animClass} ${
        active ? 'bg-surface-2' : 'hover:bg-surface-2'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
            active
              ? 'bg-ink text-white'
              : 'bg-tertiary text-ink group-hover:scale-110 group-hover:bg-ink group-hover:text-white'
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-button font-medium text-ink">{title}</div>
          <p className="mt-0.5 truncate text-xs text-ink-3">{description}</p>
        </div>
      </div>
      {active ? (
        <Check size={14} weight="bold" className="mr-0.5 shrink-0 text-ink" />
      ) : (
        <ArrowRight
          size={14}
          weight="bold"
          className="mr-0.5 shrink-0 -translate-x-1 text-ink-3 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:text-ink group-hover:opacity-100"
        />
      )}
    </Link>
  )
}

/**
 * TopBar — fixed 64px black navigation bar (DesignMD "Top Navigation Bar") shared by
 * /map, /staff and /admin, plus the desktop bottom-centre dock for map controls.
 *
 * - Left: back-to-home brand lockup, console title, sidebar toggle.
 * - Right: My Schedule link and the account menu / sign-in button.
 * - Bottom-centre dock (>= sm): workspace switcher (staff/admin), floor switcher, 2D/3D toggle,
 *   centred over the visible map canvas (offset by the sidebar width when it is open).
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

  const workspaceLabel =
    pathname === '/admin' ? 'Admin Console' : pathname === '/staff' ? 'Staff Console' : 'แผนที่ LC3'
  const WorkspaceIcon = pathname === '/admin' ? Shield : pathname === '/staff' ? SquaresFour : Compass
  const consoleTitle =
    pathname === '/admin' ? 'Admin Console' : pathname === '/staff' ? 'จัดการข้อมูลอาคาร LC3' : null

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

  const dockCenterLeft =
    sidebarWidth && !isSidebarCollapsed ? `calc(50% + ${Math.round(sidebarWidth / 2)}px)` : '50%'
  const hasFloorSwitcher = currentFloor !== undefined && Boolean(onFloorChange)
  const hasViewToggle = mapView !== undefined && Boolean(onToggleMapView)
  const showDock = isStaffOrAdmin || hasFloorSwitcher || hasViewToggle

  function closeWorkspace() {
    setIsWorkspaceOpen(false)
  }

  return (
    <>
      <header
        data-testid="map-top-bar"
        className={`fixed inset-x-0 top-0 z-100 h-16 bg-ink text-white select-none ${className}`}
      >
        <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          {/* Brand lockup + console title + sidebar toggle */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              to="/"
              data-testid="back-to-home"
              aria-label="กลับหน้าแรก"
              title="กลับหน้าแรก"
              className="flex shrink-0 items-center"
            >
              <img
                src={perimeterLogoDarkNoBg}
                alt="Perimeter"
                className="h-12 w-auto object-contain transition-opacity hover:opacity-90"
              />
            </Link>

            {consoleTitle && (
              <>
                <span aria-hidden="true" className="hidden h-5 w-px bg-surface-3 sm:block" />
                <span className="hidden truncate text-button font-medium text-secondary-active sm:inline">
                  {consoleTitle}
                </span>
              </>
            )}

            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                aria-label={isSidebarCollapsed ? 'ขยายแผงด้านซ้าย' : 'ซ่อนแผงด้านซ้าย'}
                title={isSidebarCollapsed ? 'ขยายแผงด้านซ้าย' : 'ซ่อนแผงด้านซ้าย'}
                className="btn btn-nav btn-icon-sm hidden sm:inline-flex"
              >
                <SidebarSimple size={18} weight="bold" />
              </button>
            )}
          </div>

          {/* My Schedule + account / sign in */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <MyScheduleDrawer />
            {session ? (
              <AccountMenu />
            ) : (
              <Link
                to="/login"
                data-testid="login-link"
                aria-label="เข้าสู่ระบบ"
                title="เข้าสู่ระบบ"
                className="btn btn-on-dark shrink-0"
              >
                <SignIn size={16} weight="bold" />
                <span className="hidden sm:inline">เข้าสู่ระบบ</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Bottom-centre dock (desktop only), centred over the visible map canvas */}
      {showDock && (
        <nav
          aria-label="แถบควบคุมแผนที่"
          style={{ left: dockCenterLeft }}
          className="fixed bottom-5 z-100 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-line-soft bg-white p-1 shadow-floating transition-[left] duration-300 ease-in-out select-none sm:flex"
        >
          {isStaffOrAdmin && (
            <div className="relative" ref={workspaceRef}>
              <button
                type="button"
                aria-label="สลับพื้นที่ทำงาน"
                aria-expanded={isWorkspaceOpen}
                data-testid="workspace-switcher-trigger"
                onClick={() => setIsWorkspaceOpen((prev) => !prev)}
                className={`btn btn-sm gooey-fluid-btn ${
                  isWorkspaceOpen ? 'btn-primary animate-gooey-trigger-open' : 'btn-tertiary'
                }`}
              >
                <WorkspaceIcon size={14} weight="fill" />
                <span>{workspaceLabel}</span>
                <CaretUp
                  size={11}
                  weight="bold"
                  className={`transition-transform duration-300 ${isWorkspaceOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isWorkspaceOpen && (
                <div className="gooey-popover-wrapper absolute bottom-full left-1/2 z-101 mb-3 w-76 -translate-x-1/2">
                  {/* Concave cubic-Bezier liquid bridge that stretches during transition and retracts cleanly */}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 72 16"
                    preserveAspectRatio="none"
                    className="gooey-neck-up"
                  >
                    <path
                      d="M 0 0 C 16 0, 22 16, 36 16 C 50 16, 56 0, 72 0 Z"
                      fill="#ffffff"
                    />
                  </svg>

                  <div className="gooey-popover-surface animate-gooey-menu-up divide-y divide-line-soft">
                    <WorkspaceLink
                      to="/map"
                      ariaLabel="ดูผังอาคาร LC3"
                      icon={<MapTrifold size={18} weight="fill" />}
                      title="แผนที่อาคารเรียนรวม 3"
                      description="ค้นหาห้องเรียนและตารางเวลา"
                      active={pathname === '/map'}
                      animClass="animate-gooey-item-1"
                      onNavigate={closeWorkspace}
                    />
                    <WorkspaceLink
                      to="/staff"
                      ariaLabel="แผงจัดการข้อมูล Staff"
                      icon={<SquaresFour size={18} weight="fill" />}
                      title="Staff Console"
                      description="จัดการห้องเรียนและพิกัดแผนที่"
                      active={pathname === '/staff'}
                      animClass="animate-gooey-item-2"
                      onNavigate={closeWorkspace}
                    />
                    {role === 'admin' && (
                      <WorkspaceLink
                        to="/admin"
                        ariaLabel="แผงจัดการระบบ Admin"
                        icon={<Shield size={18} weight="fill" />}
                        title="Admin Console"
                        description="จัดการบัญชีผู้ใช้และระบบ"
                        active={pathname === '/admin'}
                        animClass="animate-gooey-item-3"
                        onNavigate={closeWorkspace}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {hasFloorSwitcher && onFloorChange && (
            <>
              {isStaffOrAdmin && <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line-soft" />}
              <div role="group" aria-label="Floor switcher" className="gooey-switch-group">
                {(() => {
                  const activeIdx = Math.max(
                    0,
                    FLOOR_CONFIGS.findIndex((f) => f.floor === currentFloor),
                  )
                  const blobTransform = `translateX(${activeIdx * 100}%)`
                  return (
                    <div aria-hidden="true" className="gooey-switch-blobs">
                      <span
                        className="gooey-pill-lead"
                        style={{ width: `${100 / FLOOR_CONFIGS.length}%`, transform: blobTransform }}
                      />
                      <span
                        className="gooey-pill-drop"
                        style={{ width: `${100 / FLOOR_CONFIGS.length}%`, transform: blobTransform }}
                      />
                      <span
                        className="gooey-pill-trail"
                        style={{ width: `${100 / FLOOR_CONFIGS.length}%`, transform: blobTransform }}
                      />
                    </div>
                  )
                })()}
                {FLOOR_CONFIGS.map((floor) => {
                  const isActive = floor.floor === currentFloor
                  return (
                    <button
                      key={floor.floor}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => onFloorChange(floor.floor)}
                      className={`btn btn-sm gooey-switch-btn ${
                        isActive ? 'text-white' : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      {floor.label}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {hasViewToggle && onToggleMapView && (
            <>
              <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line-soft" />
              <button
                type="button"
                onClick={onToggleMapView}
                className="btn btn-sm btn-tertiary gooey-fluid-btn"
              >
                {mapView === '3d' ? 'แผนที่ 2D' : 'แผนที่ 3D'}
              </button>
            </>
          )}
        </nav>
      )}
    </>
  )
}
