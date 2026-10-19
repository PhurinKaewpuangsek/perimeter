import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User,
  CaretDown,
  SignOut,
} from '@phosphor-icons/react'
import { getSession, getUserRole, signOut } from '../services/authService'

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

  const roleBadgeColor =
    role === 'admin'
      ? 'bg-rose-100 text-rose-700 border-rose-200'
      : role === 'staff'
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : 'bg-slate-100 text-slate-700 border-slate-200'

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* Account trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={`บัญชีผู้ใช้ ${session.user.email}`}
        className="flex h-8 items-center gap-1.5 sm:gap-2 rounded-full px-2 sm:px-2.5 hover:bg-slate-100 text-slate-800 transition-colors cursor-pointer text-xs"
      >
        <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
          <User size={12} weight="bold" />
        </div>
        <span className="hidden sm:inline font-medium max-w-[150px] truncate">{session.user.email}</span>
        <span
          className={`hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase border ${roleBadgeColor}`}
        >
          {role}
        </span>
        <CaretDown
          size={12}
          weight="bold"
          className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-50 text-slate-800 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3.5 py-2">
            <p className="text-[11px] text-slate-400 font-medium">เข้าสู่ระบบด้วย</p>
            <p className="text-xs font-semibold text-slate-900 truncate">{session.user.email}</p>
            <span
              className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${roleBadgeColor}`}
            >
              {role}
            </span>
          </div>

          <div className="pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left font-medium"
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
