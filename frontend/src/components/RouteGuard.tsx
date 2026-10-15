import React, { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Shield, SignOut, House } from '@phosphor-icons/react'
import type { UserRole } from '../types/auth'
import { checkSession, getUserRole, signOut } from '../services/authService'
import { getHomeRouteForRole, sanitizeRedirectPath } from '../services/authRouting'

interface RouteGuardProps {
  allowedRoles: UserRole[]
  children: React.ReactNode
}

export default function RouteGuard({ allowedRoles, children }: RouteGuardProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const currentPath = location.pathname + location.search + location.hash
  const sanitizedPath = sanitizeRedirectPath(currentPath) || '/'

  const { session, expired } = checkSession()
  const userRole = getUserRole(session)

  useEffect(() => {
    if (expired) {
      navigate(`/login?redirect=${encodeURIComponent(sanitizedPath)}&expired=true`, { replace: true })
    } else if (!session) {
      navigate(`/login?redirect=${encodeURIComponent(sanitizedPath)}`, { replace: true })
    }
  }, [expired, session, sanitizedPath, navigate])

  if (expired || !session) {
    return null
  }

  if (allowedRoles.includes(userRole)) {
    return <>{children}</>
  }

  // Unauthorized screen (Wrong role)
  const isOnlyAdmin = allowedRoles.length === 1 && allowedRoles[0] === 'admin'
  const title = isOnlyAdmin ? 'Admins only (สำหรับ Admin เท่านั้น)' : 'Staff only (สำหรับ Staff เท่านั้น)'
  const ownHome = getHomeRouteForRole(userRole)
  const homeLabel = userRole === 'staff' ? 'กลับสู่หน้า Staff Console' : 'กลับสู่แผนที่หลัก'

  function handleSignOut() {
    signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 text-slate-800">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-slate-200 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <Shield size={32} weight="duotone" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">{title}</h1>
        <p className="text-xs text-slate-500 mb-6">
          หน้านี้ต้องการสิทธิ์ระดับ{' '}
          <span className="font-semibold text-rose-600">{allowedRoles.join(' หรือ ')}</span>{' '}
          แต่บัญชีปัจจุบันของคุณคือ{' '}
          <span className="font-semibold text-slate-700">{userRole}</span>
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => navigate(ownHome)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-md hover:bg-slate-800 active:scale-[0.99] transition-all cursor-pointer"
          >
            <House size={16} weight="bold" />
            <span>{homeLabel}</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-300 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
          >
            <SignOut size={16} weight="bold" />
            <span>ออกจากระบบ (Sign out)</span>
          </button>
        </div>
      </div>
    </div>
  )
}
