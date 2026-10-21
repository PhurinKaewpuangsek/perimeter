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
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-5 text-ink">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-tertiary text-ink">
          <Shield size={32} weight="duotone" />
        </div>
        <h1 className="font-display text-h3 font-bold text-ink mb-2">{title}</h1>
        <p className="text-button text-ink-2 mb-6">
          หน้านี้ต้องการสิทธิ์ระดับ{' '}
          <span className="font-medium text-ink">{allowedRoles.join(' หรือ ')}</span>{' '}
          แต่บัญชีปัจจุบันของคุณคือ{' '}
          <span className="font-medium text-ink">{userRole}</span>
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => navigate(ownHome)}
            className="btn btn-primary w-full"
          >
            <House size={16} weight="bold" />
            <span>{homeLabel}</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="btn btn-secondary w-full"
          >
            <SignOut size={16} weight="bold" />
            <span>ออกจากระบบ (Sign out)</span>
          </button>
        </div>
      </div>
    </div>
  )
}
