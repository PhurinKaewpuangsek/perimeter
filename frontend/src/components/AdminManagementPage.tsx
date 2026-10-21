/**
 * AdminManagementPage — In-app Cognito user and role management console (#96).
 * Route: /admin (admin only).
 *
 * Capabilities:
 * - List Cognito users with roles (admin, staff, user), status, and enabled state.
 * - Add new user (AdminCreateUser with SUPPRESS and temporary password, force change on login).
 * - Change user role (one role per user) with protection for caller and last admin.
 * - Enable/disable users with protection for caller and last admin.
 * - Delete user with protection for caller and last admin.
 * - Manage and delete building data (delete room with cascade schedule cleanup, delete schedule).
 * - Rejection page (403) for non-admin callers (staff, user, guest).
 */

import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties } from 'react'
import {
  Users,
  UserPlus,
  Shield,
  Trash,
  Check,
  X,
  Warning,
  Calendar,
  Door,
  Clock,
  Lock,
  CaretDown,
  ArrowClockwise,
} from '@phosphor-icons/react'
import {
  getSession,
  isAdmin,
} from '../services/authService'
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  type ManagedUser,
} from '../services/adminUserService'
import { deleteRoom, deleteSchedule } from '../services/adminService'
import TopBar from './TopBar'
import { useRooms } from '../hooks/useRooms'
import { useSchedules } from '../hooks/useSchedules'
import type { UserRole } from '../types/auth'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'user', label: 'User' },
]

interface RoleGooeyDropdownProps {
  value: UserRole
  disabled: boolean
  title: string
  onChange: (nextRole: UserRole) => void
}

function RoleGooeyDropdown({ value, disabled, title, onChange }: RoleGooeyDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedIdx = Math.max(0, ROLE_OPTIONS.findIndex((opt) => opt.value === value))
  const [hoverIdx, setHoverIdx] = useState<number>(selectedIdx)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const currentLabel = ROLE_OPTIONS[selectedIdx]?.label ?? value

  return (
    <div ref={wrapperRef} className="admin-role-dropdown">
      <button
        type="button"
        data-testid="role-dropdown-trigger"
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (disabled) return
          setHoverIdx(selectedIdx)
          setIsOpen((prev) => !prev)
        }}
        className={`admin-role-trigger gooey-fluid-btn ${
          isOpen ? 'animate-gooey-trigger-open' : ''
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <span className="admin-role-dot" data-role={value} aria-hidden="true" />
          <span>{currentLabel}</span>
        </span>
        <CaretDown
          size={14}
          weight="bold"
          className={`admin-role-chevron ${isOpen ? 'admin-role-chevron-open' : ''}`}
        />
      </button>

      {isOpen && !disabled && (
        <div className="admin-role-menu-shell">
          <svg
            className="admin-role-menu-neck"
            viewBox="0 0 44 12"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M 8 0 C 14 0, 16 12, 0 12 L 44 12 C 28 12, 30 0, 36 0 Z"
              fill="#ffffff"
            />
          </svg>
          <div
            role="listbox"
            aria-label="เลือกสิทธิ์"
            onMouseLeave={() => setHoverIdx(selectedIdx)}
            style={{ '--role-hover-idx': hoverIdx } as CSSProperties}
            className="admin-role-menu"
          >
            <div className="admin-role-hover-blobs" aria-hidden="true">
              <div className="admin-role-hover-trail" />
              <div className="admin-role-hover-lead" />
            </div>
            {ROLE_OPTIONS.map((opt, idx) => {
              const isSelected = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHoverIdx(idx)}
                  onClick={() => {
                    setIsOpen(false)
                    if (opt.value !== value) {
                      onChange(opt.value)
                    }
                  }}
                  className="admin-role-option"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <span
                      className="admin-role-dot"
                      data-role={opt.value}
                      aria-hidden="true"
                    />
                    <span>{opt.label}</span>
                  </span>
                  {isSelected && <Check size={14} weight="bold" className="text-ink shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminManagementPage() {
  const session = getSession()
  const [activeTab, setActiveTab] = useState<'users' | 'building'>('users')

  // User management state
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Add user modal / form
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('staff')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Delete user confirmation modal
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Building data deletion state
  const { rooms, reload: reloadRooms } = useRooms()
  const { schedules, reload: reloadSchedules } = useSchedules()
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [roomActionLoading, setRoomActionLoading] = useState(false)

  const isUserAdmin = useMemo(() => isAdmin(session), [session])

  useEffect(() => {
    if (!isUserAdmin) return
    let isMounted = true

    listUsers()
      .then((data) => {
        if (isMounted) {
          setUsers(data)
          setUsersError(null)
          setUsersLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setUsersError((err as Error).message || 'Failed to load users')
          setUsersLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [isUserAdmin, refreshTrigger])

  const fetchUsersList = useCallback(async (silent = false) => {
    if (!silent) {
      setUsersLoading(true)
    }
    setRefreshTrigger((n) => n + 1)
  }, [])

  // Count active admins in current list for last-admin safety rules
  const activeAdminCount = useMemo(() => {
    return users.filter((u) => u.role === 'admin' && u.enabled !== false).length
  }, [users])

  const isCaller = useCallback(
    (u: ManagedUser) => {
      if (!session?.user) return false
      return (
        (u.sub && u.sub === session.user.sub) ||
        u.email.toLowerCase() === session.user.email.toLowerCase() ||
        u.username.toLowerCase() === session.user.email.toLowerCase()
      )
    },
    [session],
  )

  const isLastAdmin = useCallback(
    (u: ManagedUser) => {
      return u.role === 'admin' && activeAdminCount <= 1
    },
    [activeAdminCount],
  )

  // --- User management actions ---
  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setAddError(null)
    try {
      await createUser({
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      })
      setIsAddUserOpen(false)
      setNewEmail('')
      setNewPassword('')
      setNewRole('staff')
      setActionSuccess(`สร้างผู้ใช้ ${newEmail.trim()} สำเร็จ`)
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchUsersList(true)
    } catch (err) {
      setAddError((err as Error).message || 'Failed to create user')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleRoleChange(user: ManagedUser, nextRole: UserRole) {
    const previousRole = user.role
    setUsers((prev) =>
      prev.map((item) =>
        item.username === user.username ? { ...item, role: nextRole } : item,
      ),
    )
    try {
      await updateUser(user.username, { role: nextRole })
      setActionSuccess(`เปลี่ยนสิทธิ์ ${user.email} เป็น ${nextRole} สำเร็จ`)
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchUsersList(true)
    } catch (err) {
      setUsers((prev) =>
        prev.map((item) =>
          item.username === user.username ? { ...item, role: previousRole } : item,
        ),
      )
      setUsersError((err as Error).message || 'Failed to change user role')
    }
  }

  async function handleToggleEnabled(user: ManagedUser) {
    const previousEnabled = user.enabled
    const nextState = !user.enabled
    setUsers((prev) =>
      prev.map((item) =>
        item.username === user.username ? { ...item, enabled: nextState } : item,
      ),
    )
    try {
      await updateUser(user.username, { enabled: nextState })
      setActionSuccess(
        `${nextState ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'} บัญชี ${user.email} สำเร็จ`,
      )
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchUsersList(true)
    } catch (err) {
      setUsers((prev) =>
        prev.map((item) =>
          item.username === user.username ? { ...item, enabled: previousEnabled } : item,
        ),
      )
      setUsersError((err as Error).message || 'Failed to update user status')
    }
  }

  async function handleConfirmDeleteUser() {
    if (!userToDelete) return
    setDeleteLoading(true)
    try {
      await deleteUser(userToDelete.username)
      setUsers((prev) => prev.filter((item) => item.username !== userToDelete.username))
      setActionSuccess(`ลบบัญชีผู้ใช้ ${userToDelete.email} สำเร็จ`)
      setTimeout(() => setActionSuccess(null), 4000)
      setUserToDelete(null)
      await fetchUsersList(true)
    } catch (err) {
      setUsersError((err as Error).message || 'Failed to delete user')
    } finally {
      setDeleteLoading(false)
    }
  }

  // --- Building data deletion actions ---
  const selectedRoom = useMemo(() => {
    return rooms.find((r) => r.id === selectedRoomId) || null
  }, [rooms, selectedRoomId])

  const roomSchedules = useMemo(() => {
    if (!selectedRoom?.code) return []
    return schedules.filter((s) => s.roomCode === selectedRoom.code)
  }, [schedules, selectedRoom])

  async function handleDeleteRoom(roomId: string) {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบห้องนี้พร้อมตารางเรียนทั้งหมด?')) return
    setRoomActionLoading(true)
    try {
      await deleteRoom(roomId)
      setActionSuccess('ลบห้องและตารางเรียนที่เกี่ยวข้องสำเร็จ')
      setTimeout(() => setActionSuccess(null), 4000)
      setSelectedRoomId(null)
      reloadRooms(true)
      reloadSchedules(true)
    } catch (err) {
      setUsersError((err as Error).message || 'Failed to delete room')
    } finally {
      setRoomActionLoading(false)
    }
  }

  async function handleDeleteSchedule(roomCode: string, slotStr: string) {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบตารางเวลานี้?')) return
    setRoomActionLoading(true)
    try {
      await deleteSchedule(roomCode, slotStr)
      setActionSuccess('ลบตารางเรียนสำเร็จ')
      setTimeout(() => setActionSuccess(null), 4000)
      reloadSchedules(true)
    } catch (err) {
      setUsersError((err as Error).message || 'Failed to delete schedule')
    } finally {
      setRoomActionLoading(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render: Admin Console Dashboard
  // -------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      {/* Shared Unified Floating TopBar */}
      <TopBar />

      {/* Main Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pt-24 pb-12 sm:px-8 lg:px-10 space-y-8">
        {/* Navigation Tabs — Unified Gooey Fluid Segmented Pill Switcher */}
        <div className="flex flex-wrap items-center border-b border-line-soft pb-4">
          <div
            className="admin-mode-switcher"
            data-active-index={activeTab === 'users' ? 0 : 1}
          >
            {(() => {
              const activeTabIdx = activeTab === 'building' ? 1 : 0
              const blobTransform = `translateX(${activeTabIdx * 100}%)`
              return (
                <div className="admin-mode-blobs" aria-hidden="true">
                  <span
                    className="gooey-pill-trail"
                    style={{ width: '50%', transform: blobTransform, backgroundColor: '#000000' }}
                  />
                  <span
                    className="gooey-pill-drop"
                    style={{ width: '50%', transform: blobTransform, backgroundColor: '#000000' }}
                  />
                  <span
                    className="gooey-pill-lead"
                    style={{ width: '50%', transform: blobTransform, backgroundColor: '#000000' }}
                  />
                </div>
              )
            })()}
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`admin-mode-tab ${
                activeTab === 'users' ? 'admin-mode-tab-active' : 'admin-mode-tab-inactive'
              }`}
            >
              <Users size={18} />
              <span>การจัดการผู้ใช้และสิทธิ์</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('building')}
              className={`admin-mode-tab ${
                activeTab === 'building' ? 'admin-mode-tab-active' : 'admin-mode-tab-inactive'
              }`}
            >
              <Trash size={18} />
              <span>จัดการข้อมูลอาคาร</span>
            </button>
          </div>
        </div>

        {/* Global Feedback Banners */}
        {actionSuccess && (
          <div className="card flex items-center gap-2 p-3 text-button text-ink">
            <Check size={16} className="shrink-0 text-ink" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {usersError && (
          <div className="card flex items-center gap-2 border-ink p-3 text-button text-ink">
            <Warning size={16} className="shrink-0 text-ink" />
            <span>{usersError}</span>
            <button onClick={() => setUsersError(null)} className="btn btn-ghost btn-icon-sm ml-auto">
              <X size={14} />
            </button>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 1: User & Role Management */}
        {/* =================================================================== */}
        {activeTab === 'users' && (
          <div className="animate-gooey-content-swap space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-h3 font-bold text-ink flex items-center gap-2">
                  <Shield size={22} className="text-ink" />
                  การจัดการผู้ใช้และสิทธิ์
                </h2>
                <p className="mt-1 text-button text-ink-2">
                  จัดการบัญชีผู้ใช้งาน สิทธิ์การเข้าถึง และสถานะบัญชีผ่าน AWS Cognito
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  data-testid="refresh-users-btn"
                  disabled={usersLoading}
                  onClick={() => fetchUsersList(false)}
                  className="btn btn-secondary gooey-fluid-btn"
                  title="รีเฟรชตารางผู้ใช้"
                >
                  <ArrowClockwise size={16} className={usersLoading ? 'animate-spin' : ''} />
                  <span>รีเฟรช</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(true)}
                  className={`btn btn-primary gooey-fluid-btn ${
                    isAddUserOpen ? 'animate-gooey-trigger-open' : ''
                  }`}
                >
                  <UserPlus size={16} />
                  <span>เพิ่มผู้ใช้ใหม่</span>
                </button>
              </div>
            </div>

            {/* Users Table Card (overflow-visible so custom Gooey Role Dropdown popovers are not clipped) */}
            <div className="card overflow-visible">
              <div className="overflow-x-auto sm:overflow-visible">
                <table className="w-full text-button">
                  <thead>
                    <tr>
                      <th className="bg-surface-2 px-4 py-3 text-left text-xs font-medium text-ink-2 uppercase">อีเมล / ชื่อผู้ใช้</th>
                      <th className="bg-surface-2 px-4 py-3 text-left text-xs font-medium text-ink-2 uppercase">สิทธิ์ (Role)</th>
                      <th className="bg-surface-2 px-4 py-3 text-left text-xs font-medium text-ink-2 uppercase">สถานะบัญชี</th>
                      <th className="bg-surface-2 px-4 py-3 text-left text-xs font-medium text-ink-2 uppercase">การใช้งาน</th>
                      <th className="bg-surface-2 px-4 py-3 text-right text-xs font-medium text-ink-2 uppercase">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersLoading ? (
                      <tr className="border-t border-line-soft">
                        <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                          กำลังโหลดข้อมูลผู้ใช้...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr className="border-t border-line-soft">
                        <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                          ไม่พบข้อมูลผู้ใช้ในระบบ
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => {
                        const self = isCaller(u)
                        const lastAdmin = isLastAdmin(u)
                        const protectedUser = self || lastAdmin
                        const isWarningStatus =
                          u.status === 'FORCE_CHANGE_PASSWORD' ||
                          u.status === 'UNCONFIRMED' ||
                          u.status === 'RESET_REQUIRED'
                        const statusBadgeClass =
                          u.status === 'CONFIRMED'
                            ? 'admin-status-badge admin-status-confirmed'
                            : isWarningStatus
                              ? 'admin-status-badge admin-status-warning'
                              : 'admin-status-badge admin-status-danger'
                        const statusLabel =
                          u.status === 'FORCE_CHANGE_PASSWORD'
                            ? 'ต้องเปลี่ยนรหัสผ่าน'
                            : u.status

                        const rowClass = !u.enabled
                          ? 'admin-row-suspended'
                          : self
                            ? 'admin-row-self hover:bg-surface-2'
                            : 'hover:bg-surface-2'

                        return (
                          <tr
                            key={u.username}
                            className={`border-t border-line-soft transition-colors ${rowClass}`}
                          >
                            <td className="px-4 py-3 text-ink">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`font-medium ${
                                    !u.enabled ? 'text-ink-3' : 'text-ink'
                                  }`}
                                >
                                  {u.email}
                                </span>
                                {self && (
                                  <span className="admin-self-chip">
                                    (บัญชีของคุณ)
                                  </span>
                                )}
                                {lastAdmin && !self && (
                                  <span className="admin-self-chip">
                                    (Admin คนสุดท้าย)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-ink">
                              <RoleGooeyDropdown
                                value={u.role}
                                disabled={protectedUser}
                                onChange={(nextRole) => handleRoleChange(u, nextRole)}
                                title={
                                  self
                                    ? 'ไม่สามารถเปลี่ยนสิทธิ์บัญชีของตนเองได้'
                                    : lastAdmin
                                      ? 'ไม่สามารถลดสิทธิ์ Admin คนสุดท้ายได้'
                                      : 'เลือกสิทธิ์'
                                }
                              />
                            </td>
                            <td className="px-4 py-3 text-ink">
                              <span
                                data-testid="user-status-badge"
                                className={statusBadgeClass}
                              >
                                <span className="admin-status-dot" aria-hidden="true" />
                                {u.status === 'CONFIRMED' ? (
                                  <Check size={12} weight="bold" className="shrink-0" />
                                ) : isWarningStatus ? (
                                  <Clock size={12} weight="bold" className="shrink-0" />
                                ) : (
                                  <Warning size={12} weight="bold" className="shrink-0" />
                                )}
                                <span>{statusLabel}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-ink">
                              {protectedUser ? (
                                <span
                                  data-testid="protected-usage-indicator"
                                  className="admin-usage-protected-text"
                                  title={
                                    self
                                      ? 'ไม่สามารถระงับบัญชีของตนเองได้'
                                      : 'ไม่สามารถระงับ Admin คนสุดท้ายได้'
                                  }
                                >
                                  <Lock size={15} weight="duotone" className="shrink-0" />
                                  <span>
                                    {self
                                      ? 'บัญชีของคุณ (เปิดใช้งาน)'
                                      : 'Admin คนสุดท้าย (เปิดใช้งาน)'}
                                  </span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={Boolean(u.enabled)}
                                  data-testid="toggle-enabled-btn"
                                  onClick={() => handleToggleEnabled(u)}
                                  title={
                                    u.enabled
                                      ? 'คลิกเพื่อระงับการใช้งาน'
                                      : 'คลิกเพื่อเปิดใช้งาน'
                                  }
                                  className="admin-usage-switch-btn"
                                >
                                  <span
                                    className="admin-gooey-switch-track"
                                    data-enabled={String(Boolean(u.enabled))}
                                    aria-hidden="true"
                                  >
                                    <span className="admin-gooey-switch-blobs">
                                      <span className="admin-gooey-switch-trail" />
                                      <span className="admin-gooey-switch-thumb" />
                                    </span>
                                  </span>
                                  {u.enabled ? (
                                    <span className="admin-usage-label-active">เปิดใช้งาน</span>
                                  ) : (
                                    <span className="admin-usage-label-suspended">ถูกระงับ</span>
                                  )}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-ink">
                              <button
                                type="button"
                                data-testid="delete-user-btn"
                                disabled={protectedUser}
                                onClick={() => setUserToDelete(u)}
                                title={
                                  self
                                    ? 'ไม่สามารถลบบัญชีของตนเองได้'
                                    : lastAdmin
                                      ? 'ไม่สามารถลบ Admin คนสุดท้ายได้'
                                      : 'ลบผู้ใช้'
                                }
                                className="btn btn-ghost btn-icon-sm admin-delete-btn"
                              >
                                <Trash size={15} />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: Building Data Deletion */}
        {/* =================================================================== */}
        {activeTab === 'building' && (
          <div className="animate-gooey-content-swap space-y-6">
            <div>
              <h2 className="font-display text-h3 font-bold text-ink flex items-center gap-2">
                <Trash size={22} className="text-ink" />
                ลบข้อมูลห้องและตารางเรียน
              </h2>
              <p className="mt-1 text-button text-ink-2">
                สิทธิ์ระดับ Admin สามารถลบห้อง (Cascade delete ตารางเรียน) และลบตารางเรียนรายวิชาได้
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Room list column */}
              <div className="card p-5 sm:p-6 space-y-3">
                <h3 className="text-xs font-medium uppercase text-ink-2">
                  เลือกห้องที่ต้องการจัดการ ({rooms.length})
                </h3>
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                  {rooms.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRoomId(r.id)}
                      className={`w-full text-left p-3 rounded-none border transition-colors flex items-center justify-between gap-2 text-button cursor-pointer ${
                        selectedRoomId === r.id
                          ? 'border-ink bg-surface-2 text-ink'
                          : 'border-line-soft bg-white text-ink-2 hover:bg-surface-2'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-ink">ห้อง {r.roomNumber || r.code}</span>
                        <div className="text-xs text-ink-3">{r.nameThai}</div>
                      </div>
                      <span className="chip shrink-0">
                        ชั้น {r.floor}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Room details & delete actions column */}
              <div className="md:col-span-2 card p-5 sm:p-6 space-y-5">
                {selectedRoom ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line-soft pb-4">
                      <div>
                        <h3 className="text-h3-sm font-bold text-ink">
                          ห้อง {selectedRoom.roomNumber || selectedRoom.code} ({selectedRoom.nameThai})
                        </h3>
                        <p className="text-xs text-ink-3">
                          รหัสห้อง: {selectedRoom.code} • ชั้น {selectedRoom.floor} อาคาร {selectedRoom.building}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={roomActionLoading}
                        onClick={() => handleDeleteRoom(selectedRoom.id)}
                        className="btn btn-secondary gooey-fluid-btn self-start sm:self-auto"
                      >
                        <Trash size={15} />
                        <span>ลบห้องนี้ (Cascade Delete)</span>
                      </button>
                    </div>

                    {/* Schedule slots list */}
                    <div className="space-y-3">
                      <h4 className="flex items-center gap-1.5 text-xs font-medium uppercase text-ink-2">
                        <Calendar size={15} className="text-ink" />
                        ตารางเรียนในห้องนี้ ({roomSchedules.length})
                      </h4>

                      {roomSchedules.length === 0 ? (
                        <p className="text-button text-ink-3 italic">ไม่มีตารางเรียนในห้องนี้</p>
                      ) : (
                        <div className="space-y-2">
                          {roomSchedules.map((slot) => {
                            const slotKey = `${slot.dayOfWeek}#${slot.startTime}#${slot.eventCode}`
                            return (
                              <div
                                key={slotKey}
                                className="card flex items-center justify-between gap-3 p-3 text-button"
                              >
                                <div className="min-w-0">
                                  <div className="font-medium text-ink">
                                    {slot.eventCode} - {slot.eventName || 'ไม่ระบุวิชา'}
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                                    <span>วัน{slot.dayOfWeek}</span>
                                    <span>
                                      {slot.startTime} - {slot.endTime || 'ไม่ระบุ'}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  disabled={roomActionLoading}
                                  onClick={() => handleDeleteSchedule(selectedRoom.code, slotKey)}
                                  className="btn btn-secondary btn-sm gooey-fluid-btn shrink-0"
                                >
                                  <Trash size={14} />
                                  <span>ลบตาราง</span>
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center text-ink-3">
                    <Door size={40} className="mb-2" />
                    <p className="text-button">กรุณาเลือกห้องจากรายการด้านซ้ายเพื่อจัดการข้อมูล</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* MODAL: Add User Form */}
      {/* ===================================================================== */}
      {isAddUserOpen && (
        <div className="modal-overlay flex items-center justify-center p-4">
          <div className="modal animate-gooey-menu-up w-full max-w-[500px] p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between border-b border-line-soft pb-3">
              <h3 className="text-h3-sm font-bold text-ink flex items-center gap-2">
                <UserPlus size={18} className="text-ink" />
                เพิ่มผู้ใช้ใหม่ (Add User)
              </h3>
              <button
                onClick={() => setIsAddUserOpen(false)}
                className="btn btn-ghost btn-icon-sm"
              >
                <X size={18} />
              </button>
            </div>

            {addError && (
              <div className="card flex items-center gap-2 border-ink p-3 text-button text-ink">
                <Warning size={16} className="shrink-0 text-ink" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label htmlFor="newUserEmail" className="label">
                  อีเมลผู้ใช้
                </label>
                <input
                  id="newUserEmail"
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@torch.dev"
                  className="input-boxed"
                />
              </div>

              <div>
                <label htmlFor="newUserPassword" className="label">
                  รหัสผ่านเริ่มต้น
                </label>
                <input
                  id="newUserPassword"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-boxed"
                />
                <p className="mt-1 text-xs text-ink-3">
                  * ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก (FORCE_CHANGE_PASSWORD)
                </p>
              </div>

              <div>
                <label htmlFor="newUserRole" className="label">
                  สิทธิ์ (Role)
                </label>
                <select
                  id="newUserRole"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="input-boxed cursor-pointer"
                >
                  <option value="admin">Admin (ผู้ดูแลระบบทั้งหมด)</option>
                  <option value="staff">Staff (เจ้าหน้าที่แก้ไขห้อง/ตาราง)</option>
                  <option value="user">User (ผู้ใช้ทั่วไป/นักศึกษา)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 border-t border-line-soft pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="btn btn-secondary gooey-fluid-btn"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="btn btn-primary gooey-fluid-btn"
                >
                  {addLoading ? 'กำลังสร้าง...' : 'สร้างผู้ใช้'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: Confirm Delete User */}
      {/* ===================================================================== */}
      {userToDelete && (
        <div className="modal-overlay flex items-center justify-center p-4">
          <div className="modal animate-gooey-menu-up w-full max-w-[500px] p-6 sm:p-8 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-tertiary text-ink">
              <Trash size={24} weight="duotone" />
            </div>

            <div>
              <h3 className="text-h3-sm font-bold text-ink">ยืนยันการลบบัญชีผู้ใช้</h3>
              <p className="mt-1 text-button text-ink-2">
                คุณแน่ใจหรือไม่ว่าต้องการลบบัญชี <span className="font-bold text-ink">{userToDelete.email}</span>?
              </p>
              <p className="mt-1 text-xs text-ink-3">
                การลบนี้จะลบบัญชีผู้ใช้ออกจาก AWS Cognito ทันทีและไม่สามารถกู้คืนได้
              </p>
            </div>

            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="btn btn-secondary gooey-fluid-btn"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleConfirmDeleteUser}
                className="btn btn-primary gooey-fluid-btn"
              >
                {deleteLoading ? 'กำลังลบ...' : 'ยืนยันการลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
