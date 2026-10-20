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

import { useState, useEffect, useMemo, useCallback } from 'react'
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

  const fetchUsersList = useCallback(async () => {
    setUsersLoading(true)
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
      await fetchUsersList()
    } catch (err) {
      setAddError((err as Error).message || 'Failed to create user')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleRoleChange(user: ManagedUser, nextRole: UserRole) {
    try {
      await updateUser(user.username, { role: nextRole })
      setActionSuccess(`เปลี่ยนสิทธิ์ ${user.email} เป็น ${nextRole} สำเร็จ`)
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchUsersList()
    } catch (err) {
      setUsersError((err as Error).message || 'Failed to change user role')
    }
  }

  async function handleToggleEnabled(user: ManagedUser) {
    try {
      const nextState = !user.enabled
      await updateUser(user.username, { enabled: nextState })
      setActionSuccess(
        `${nextState ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'} บัญชี ${user.email} สำเร็จ`,
      )
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchUsersList()
    } catch (err) {
      setUsersError((err as Error).message || 'Failed to update user status')
    }
  }

  async function handleConfirmDeleteUser() {
    if (!userToDelete) return
    setDeleteLoading(true)
    try {
      await deleteUser(userToDelete.username)
      setActionSuccess(`ลบบัญชีผู้ใช้ ${userToDelete.email} สำเร็จ`)
      setTimeout(() => setActionSuccess(null), 4000)
      setUserToDelete(null)
      await fetchUsersList()
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
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft pb-3">
          <button
            onClick={() => setActiveTab('users')}
            className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <Users size={18} />
            <span>การจัดการผู้ใช้และสิทธิ์</span>
          </button>
          <button
            onClick={() => setActiveTab('building')}
            className={`btn ${activeTab === 'building' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <Trash size={18} />
            <span>จัดการข้อมูลอาคาร</span>
          </button>
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
          <div className="space-y-6">
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

              <button
                type="button"
                onClick={() => setIsAddUserOpen(true)}
                className="btn btn-primary self-start sm:self-auto"
              >
                <UserPlus size={16} />
                <span>เพิ่มผู้ใช้ใหม่</span>
              </button>
            </div>

            {/* Users Table Card */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
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

                        return (
                          <tr key={u.username} className="border-t border-line-soft transition-colors hover:bg-surface-2">
                            <td className="px-4 py-3 text-ink">
                              <div className="font-medium text-ink">{u.email}</div>
                              {self && (
                                <span className="mt-0.5 inline-block text-xs font-medium text-ink-2">
                                  (บัญชีของคุณ)
                                </span>
                              )}
                              {lastAdmin && !self && (
                                <span className="mt-0.5 inline-block text-xs font-medium text-ink-2">
                                  (Admin คนสุดท้าย)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-ink">
                              <select
                                value={u.role}
                                disabled={protectedUser}
                                onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                                title={
                                  self
                                    ? 'ไม่สามารถเปลี่ยนสิทธิ์บัญชีของตนเองได้'
                                    : lastAdmin
                                      ? 'ไม่สามารถลดสิทธิ์ Admin คนสุดท้ายได้'
                                      : 'เลือกสิทธิ์'
                                }
                                className="input-boxed w-auto cursor-pointer disabled:cursor-not-allowed"
                              >
                                <option value="admin">Admin</option>
                                <option value="staff">Staff</option>
                                <option value="user">User</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 text-ink">
                              <span className={u.status === 'CONFIRMED' ? 'chip' : 'chip bg-tertiary'}>
                                {u.status === 'FORCE_CHANGE_PASSWORD' ? 'ต้องเปลี่ยนรหัสผ่าน' : u.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-ink">
                              <button
                                type="button"
                                data-testid="toggle-enabled-btn"
                                disabled={protectedUser}
                                onClick={() => handleToggleEnabled(u)}
                                title={
                                  self
                                    ? 'ไม่สามารถระงับบัญชีของตนเองได้'
                                    : lastAdmin
                                      ? 'ไม่สามารถระงับ Admin คนสุดท้ายได้'
                                      : u.enabled
                                        ? 'คลิกเพื่อระงับการใช้งาน'
                                        : 'คลิกเพื่อเปิดใช้งาน'
                                }
                                className={`btn btn-sm ${u.enabled ? 'btn-secondary' : 'btn-tertiary'}`}
                              >
                                {u.enabled ? 'เปิดใช้งาน' : 'ถูกระงับ'}
                              </button>
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
                                className="btn btn-ghost btn-icon-sm"
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
          <div className="space-y-6">
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
                        className="btn btn-secondary self-start sm:self-auto"
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
                                  className="btn btn-secondary btn-sm shrink-0"
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
          <div className="modal w-full max-w-[500px] p-6 sm:p-8 space-y-4">
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
                  className="btn btn-secondary"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="btn btn-primary"
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
          <div className="modal w-full max-w-[500px] p-6 sm:p-8 space-y-4 text-center">
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
                className="btn btn-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleConfirmDeleteUser}
                className="btn btn-primary"
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
