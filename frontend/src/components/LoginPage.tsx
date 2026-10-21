import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Warning, Eye, EyeSlash, Clock, LockKey } from '@phosphor-icons/react'
import perimeterLogoNoBg from '../assets/perimeter_logo_negative_nobg.png'
import {
  signIn,
  completeNewPassword,
  getSession,
  getUserRole,
} from '../services/authService'
import { resolvePostLoginRedirect } from '../services/authRouting'

const PASSWORD_TOGGLE_CLASS =
  'absolute top-1/2 right-0 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-tertiary hover:text-ink'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectParam = searchParams.get('redirect')
  const isExpired = searchParams.get('expired') === 'true' || searchParams.get('reason') === 'expired'

  // If already authenticated, redirect straight to post-login destination
  useEffect(() => {
    const session = getSession()
    if (session) {
      const role = getUserRole(session)
      const target = resolvePostLoginRedirect(role, redirectParam)
      navigate(target, { replace: true })
    }
  }, [navigate, redirectParam])

  // Normal login form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Challenge (NEW_PASSWORD_REQUIRED) state
  const [isNewPasswordRequired, setIsNewPasswordRequired] = useState(false)
  const [challengeSession, setChallengeSession] = useState('')
  const [challengeEmail, setChallengeEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Don't flash form if already signed in
  if (getSession()) {
    return null
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await signIn(email.trim(), password)
      if (res.challenge === 'NEW_PASSWORD_REQUIRED') {
        setChallengeEmail(res.email)
        setChallengeSession(res.session)
        setIsNewPasswordRequired(true)
      } else {
        const role = getUserRole(res.session)
        const target = resolvePostLoginRedirect(role, redirectParam)
        navigate(target, { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูล')
    } finally {
      setLoading(false)
    }
  }

  async function handleNewPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }

    setLoading(true)
    try {
      const session = await completeNewPassword(challengeEmail, newPassword, challengeSession)
      setIsNewPasswordRequired(false)
      const role = getUserRole(session)
      const target = resolvePostLoginRedirect(role, redirectParam)
      navigate(target, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถตั้งรหัสผ่านใหม่ได้')
    } finally {
      setLoading(false)
    }
  }

  function handleBackToSignIn() {
    setIsNewPasswordRequired(false)
    setChallengeSession('')
    setChallengeEmail('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-5 text-ink">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 text-center">
          <img
            src={perimeterLogoNoBg}
            alt="Perimeter"
            className="mx-auto mb-4 h-12 object-contain"
          />
          <h1 className="font-display text-h3 font-bold text-ink">
            {isNewPasswordRequired ? 'ตั้งรหัสผ่านใหม่' : 'เข้าสู่ระบบ'}
          </h1>
          <p className="mt-1 text-button text-ink-2">
            {isNewPasswordRequired
              ? `บัญชี ${challengeEmail} เข้าสู่ระบบเป็นครั้งแรก กรุณาตั้งรหัสผ่านใหม่เพื่อเปิดใช้งาน`
              : 'กรุณากรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งาน'}
          </p>
        </div>

        {isExpired && !isNewPasswordRequired && (
          <div role="status" className="card mb-4 flex items-start gap-2 p-3 text-button text-ink-2">
            <Clock size={16} className="mt-0.5 shrink-0 text-ink" weight="bold" />
            <span>เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง</span>
          </div>
        )}

        {error && (
          <div role="alert" className="card mb-4 flex items-start gap-2 border-ink p-3 text-button text-ink">
            <Warning size={16} className="mt-0.5 shrink-0" weight="bold" />
            <span>{error}</span>
          </div>
        )}

        {isNewPasswordRequired ? (
          <form onSubmit={handleNewPasswordSubmit} className="space-y-5">
            <div className="surface space-y-1 p-3 text-xs text-ink-2">
              <div className="flex items-center gap-1 font-medium text-ink">
                <LockKey size={14} weight="bold" />
                <span>ข้อกำหนดความปลอดภัยของรหัสผ่าน:</span>
              </div>
              <ul className="list-inside list-disc space-y-0.5 pl-1">
                <li>อย่างน้อย 8 ตัวอักษร</li>
                <li>ตัวพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว</li>
                <li>ตัวพิมพ์เล็ก (a-z) อย่างน้อย 1 ตัว</li>
                <li>ตัวเลข (0-9) อย่างน้อย 1 ตัว</li>
                <li>อักขระพิเศษอย่างน้อย 1 ตัว</li>
              </ul>
            </div>

            <div>
              <label className="label" htmlFor="new-password">
                รหัสผ่านใหม่
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="อย่างน้อย 8 ตัวอักษร"
                  className="input pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={showNewPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className={PASSWORD_TOGGLE_CLASS}
                >
                  {showNewPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="confirm-password">
                ยืนยันรหัสผ่านใหม่
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
                  className="input pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className={PASSWORD_TOGGLE_CLASS}
                >
                  {showConfirmPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleBackToSignIn}
                disabled={loading}
                className="btn btn-secondary w-1/3"
              >
                ย้อนกลับ
              </button>
              <button type="submit" disabled={loading} className="btn btn-primary flex-1">
                {loading ? 'กำลังบันทึก...' : 'บันทึกและเข้าใช้งาน'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <div>
              <label className="label" htmlFor="email">
                อีเมล / ชื่อผู้ใช้
              </label>
              <input
                id="email"
                type="text"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@torch.dev"
                className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className={PASSWORD_TOGGLE_CLASS}
                >
                  {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-line-soft pt-4 text-center">
          <Link to="/" className="link text-button">
            ← กลับสู่หน้าหลัก
          </Link>
        </div>
      </div>
    </div>
  )
}
