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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 text-slate-800">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-slate-200/80">
        <div className="text-center mb-6">
          <img
            src={perimeterLogoNoBg}
            alt="Perimeter"
            className="h-12 mx-auto mb-3 object-contain"
          />
          <h1 className="text-xl font-bold text-slate-900">
            {isNewPasswordRequired ? 'ตั้งรหัสผ่านใหม่' : 'เข้าสู่ระบบ'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isNewPasswordRequired
              ? `บัญชี ${challengeEmail} เข้าสู่ระบบเป็นครั้งแรก กรุณาตั้งรหัสผ่านใหม่เพื่อเปิดใช้งาน`
              : 'กรุณากรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งาน'}
          </p>
        </div>

        {isExpired && !isNewPasswordRequired && (
          <div
            role="status"
            className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2"
          >
            <Clock size={16} className="shrink-0 mt-0.5 text-amber-600" weight="bold" />
            <span>เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-start gap-2"
          >
            <Warning size={16} className="shrink-0 mt-0.5" weight="bold" />
            <span>{error}</span>
          </div>
        )}

        {isNewPasswordRequired ? (
          <form onSubmit={handleNewPasswordSubmit} className="space-y-4">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
              <div className="font-semibold text-slate-700 flex items-center gap-1">
                <LockKey size={14} weight="bold" />
                <span>ข้อกำหนดความปลอดภัยของรหัสผ่าน:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-500 pl-1">
                <li>อย่างน้อย 8 ตัวอักษร</li>
                <li>ตัวพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว</li>
                <li>ตัวพิมพ์เล็ก (a-z) อย่างน้อย 1 ตัว</li>
                <li>ตัวเลข (0-9) อย่างน้อย 1 ตัว</li>
                <li>อักขระพิเศษอย่างน้อย 1 ตัว</li>
              </ul>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="new-password">
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
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={showNewPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="confirm-password">
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
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
                className="w-1/3 rounded-xl border border-slate-300 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
              >
                ย้อนกลับ
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-md hover:bg-slate-800 active:scale-[0.99] cursor-pointer transition-all disabled:opacity-50"
              >
                {loading ? 'กำลังบันทึก...' : 'บันทึกและเข้าใช้งาน'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="email">
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
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="password">
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
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-md hover:bg-slate-800 active:scale-[0.99] cursor-pointer transition-all disabled:opacity-50"
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-slate-200 text-center">
          <Link to="/" className="text-xs text-slate-500 hover:text-slate-800 transition-colors">
            ← กลับสู่หน้าหลัก
          </Link>
        </div>
      </div>
    </div>
  )
}
