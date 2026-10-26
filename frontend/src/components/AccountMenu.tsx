import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { User, CaretDown, SignOut, MapTrifold, SquaresFour, Shield } from '@phosphor-icons/react'
import { getSession, getUserRole, signOut } from '../services/authService'

/** Account trigger for the black top bar and its dropdown (DesignMD "Dropdown Menu"). */
export default function AccountMenu() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const session = getSession()
  const role = getUserRole(session)
  const isStaffOrAdmin = role === 'staff' || role === 'admin'

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!session) {
    return null
  }

  function handleSignOut() {
    signOut()
    setIsOpen(false)
    navigate('/')
  }

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={`บัญชีผู้ใช้ ${session.user.email}`}
        className={`btn btn-nav gooey-fluid-btn shrink-0 gap-1.5 sm:gap-2 ${
          isOpen ? 'animate-gooey-trigger-open bg-ink-2' : ''
        }`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-ink transition-transform duration-300">
          <User size={13} weight="bold" />
        </span>
        <span className="hidden max-w-[150px] truncate sm:inline">{session.user.email}</span>
        <span className="hidden rounded-full border border-surface-3 px-1.5 py-0.5 text-xs leading-none font-medium text-secondary-active uppercase sm:inline">
          {role}
        </span>
        <CaretDown
          size={12}
          weight="bold"
          className={`shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="gooey-popover-wrapper absolute right-0 z-101 mt-3 w-56 text-ink">
          {/* Concave cubic-Bezier liquid bridge that stretches during transition and retracts cleanly */}
          <svg
            aria-hidden="true"
            viewBox="0 0 68 16"
            preserveAspectRatio="none"
            className="gooey-neck-down"
          >
            <path
              d="M 0 16 C 15 16, 21 0, 34 0 C 47 0, 53 16, 68 16 Z"
              fill="#ffffff"
            />
          </svg>

          <div className="gooey-popover-surface animate-gooey-menu-down py-2">
            <div className="animate-gooey-item-1 px-3.5 py-2">
              <p className="text-xs text-ink-3">เข้าสู่ระบบด้วย</p>
              <p className="truncate text-button font-medium text-ink">{session.user.email}</p>
              <span className="chip mt-1.5 uppercase">{role}</span>
            </div>

            {isStaffOrAdmin && (
              <div className="sm:hidden mt-1 border-t border-line-soft py-1">
                {[
                  { to: '/map', label: 'แผนที่อาคารเรียนรวม 3', Icon: MapTrifold },
                  { to: '/staff', label: 'Staff Console', Icon: SquaresFour },
                  ...(role === 'admin' ? [{ to: '/admin', label: 'Admin Console', Icon: Shield }] : []),
                ].map(({ to, label, Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setIsOpen(false)}
                    className={`flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-button font-medium text-ink transition-colors duration-200 hover:bg-surface-2 ${
                      location.pathname === to ? 'bg-surface-2' : ''
                    }`}
                  >
                    <Icon size={16} weight="bold" />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            )}

            <div className="animate-gooey-item-2 mt-1 border-t border-line-soft pt-1">
              <button
                type="button"
                onClick={handleSignOut}
                className="group flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left text-button font-medium text-ink transition-colors duration-200 hover:bg-surface-2"
              >
                <SignOut
                  size={16}
                  weight="bold"
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                />
                <span>ออกจากระบบ (Sign out)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
