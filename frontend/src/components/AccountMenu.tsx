import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, CaretDown, SignOut } from '@phosphor-icons/react'
import { getSession, getUserRole, signOut } from '../services/authService'

/** Account trigger for the black top bar and its dropdown (DesignMD "Dropdown Menu"). */
export default function AccountMenu() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const session = getSession()
  const role = getUserRole(session)

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
        className="btn btn-nav shrink-0 gap-1.5 sm:gap-2"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-ink">
          <User size={13} weight="bold" />
        </span>
        <span className="hidden max-w-[150px] truncate sm:inline">{session.user.email}</span>
        <span className="hidden rounded-full border border-surface-3 px-1.5 py-0.5 text-xs leading-none font-medium text-secondary-active uppercase sm:inline">
          {role}
        </span>
        <CaretDown
          size={12}
          weight="bold"
          className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="dropdown absolute right-0 mt-2 w-56 animate-fade-in py-2 text-ink">
          <div className="px-3.5 py-2">
            <p className="text-xs text-ink-3">เข้าสู่ระบบด้วย</p>
            <p className="truncate text-button font-medium text-ink">{session.user.email}</p>
            <span className="chip mt-1.5 uppercase">{role}</span>
          </div>

          <div className="mt-1 border-t border-line-soft pt-1">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left text-button font-medium text-ink transition-colors hover:bg-surface-2"
            >
              <SignOut size={16} weight="bold" />
              <span>ออกจากระบบ (Sign out)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
