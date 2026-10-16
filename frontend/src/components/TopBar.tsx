import { Link } from 'react-router-dom'
import { CaretLeft, Calendar, SignIn } from '@phosphor-icons/react'
import perimeterLogoNoBg from '../assets/perimeter_logo_negative_nobg.png'
import AccountMenu from './AccountMenu'
import { getSession } from '../services/authService'

export interface TopBarProps {
  className?: string
}

/**
 * TopBar — Shared navigation header for /map and upcoming V3 features.
 *
 * Provides:
 * 1. Back-to-home link (links directly to / in one click)
 * 2. "My Schedule" placeholder slot for upcoming schedule features
 * 3. Login entry linking to /login (unauthenticated) or shared AccountMenu (authenticated)
 */
export default function TopBar({ className = '' }: TopBarProps) {
  const session = getSession()

  return (
    <header
      data-testid="map-top-bar"
      className={`h-13 sm:h-14 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-3 sm:px-4 flex items-center justify-between select-none shrink-0 ${className}`}
    >
      {/* 1. Back-to-home Link (Single click back to / on desktop & mobile) */}
      <Link
        to="/"
        data-testid="back-to-home"
        aria-label="กลับหน้าแรก"
        title="กลับหน้าแรก"
        className="flex items-center gap-2 group cursor-pointer"
      >
        <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-900 transition-colors">
          <CaretLeft size={16} weight="bold" />
        </div>
        <img
          src={perimeterLogoNoBg}
          alt="Perimeter"
          className="h-7 sm:h-8 w-auto object-contain drop-shadow-xs"
        />
        <span className="hidden md:inline text-xs font-semibold text-slate-500 group-hover:text-slate-900 transition-colors">
          หน้าแรก
        </span>
      </Link>

      {/* 2. Right Side: My Schedule Slot & Login / AccountMenu */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Placeholder slot for My Schedule issue */}
        <div
          data-testid="my-schedule-placeholder"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-500 select-none shadow-2xs"
          title="My Schedule"
        >
          <Calendar size={14} weight="bold" className="text-slate-400" />
          <span>My Schedule</span>
        </div>

        {/* Account Menu (authenticated) or Login Entry (unauthenticated) */}
        {session ? (
          <AccountMenu />
        ) : (
          <Link
            to="/login"
            data-testid="login-link"
            aria-label="เข้าสู่ระบบ"
            title="เข้าสู่ระบบ"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 active:bg-slate-950 transition-all cursor-pointer shrink-0"
          >
            <SignIn size={14} weight="bold" />
            <span>เข้าสู่ระบบ</span>
          </Link>
        )}
      </div>
    </header>
  )
}
