import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  User,
  CaretDown,
  SignOut,
  Shield,
  SquaresFour,
  MapTrifold,
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
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 shadow-2xs transition-colors cursor-pointer text-xs"
      >
        <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
          <User size={12} weight="bold" />
        </div>
        <span className="font-medium max-w-[150px] truncate">{session.user.email}</span>
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase border ${roleBadgeColor}`}
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
          <div className="px-3.5 py-2 border-b border-slate-100">
            <p className="text-[11px] text-slate-400 font-medium">เข้าสู่ระบบด้วย</p>
            <p className="text-xs font-semibold text-slate-900 truncate">{session.user.email}</p>
            <span
              className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${roleBadgeColor}`}
            >
              {role}
            </span>
          </div>

          <div className="py-1">
            {role === 'admin' && (
              <Link
                to="/admin"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                <Shield size={16} className="text-rose-600" weight="bold" />
                <span>Admin Console</span>
              </Link>
            )}

            {(role === 'staff' || role === 'admin') && (
              <Link
                to="/staff"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                <SquaresFour size={16} className="text-amber-600" weight="bold" />
                <span>Staff Console</span>
              </Link>
            )}

            <Link
              to="/map"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <MapTrifold size={16} className="text-blue-600" weight="bold" />
              <span>แผนที่ (Map)</span>
            </Link>
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
