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
import AccountMenu from './AccountMenu'
import { useRooms } from '../hooks/useRooms'
import { useSchedules } from '../hooks/useSchedules'
import type { UserRole } from '../types/auth'
import perimeterLogoNoBg from '../assets/perimeter_logo_negative_nobg.png'

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
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={perimeterLogoNoBg} alt="Perimeter Logo" className="h-8" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">Admin Console</span>
            <span className="rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-semibold px-2 py-0.5">
              admin
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <AccountMenu />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'users'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users size={18} />
            <span>การจัดการผู้ใช้และสิทธิ์</span>
          </button>
          <button
            onClick={() => setActiveTab('building')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'building'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Trash size={18} />
            <span>จัดการข้อมูลอาคาร</span>
          </button>
        </div>

        {/* Global Feedback Banners */}
        {actionSuccess && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 text-xs text-emerald-300 flex items-center gap-2">
            <Check size={16} className="shrink-0 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {usersError && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-300 flex items-center gap-2">
            <Warning size={16} className="shrink-0 text-rose-400" />
            <span>{usersError}</span>
            <button onClick={() => setUsersError(null)} className="ml-auto text-rose-400 hover:text-white">
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
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Shield size={22} className="text-rose-500" />
                  การจัดการผู้ใช้และสิทธิ์
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  จัดการบัญชีผู้ใช้งาน สิทธิ์การเข้าถึง และสถานะบัญชีผ่าน AWS Cognito
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddUserOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4 py-2.5 transition-colors cursor-pointer self-start sm:self-auto shadow-sm"
              >
                <UserPlus size={16} />
                <span>เพิ่มผู้ใช้ใหม่</span>
              </button>
            </div>

            {/* Users Table Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-800/50 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-300 border-b border-slate-700/80 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">อีเมล / ชื่อผู้ใช้</th>
                      <th className="py-3 px-4">สิทธิ์ (Role)</th>
                      <th className="py-3 px-4">สถานะบัญชี</th>
                      <th className="py-3 px-4">การใช้งาน</th>
                      <th className="py-3 px-4 text-right">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {usersLoading ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          กำลังโหลดข้อมูลผู้ใช้...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          ไม่พบข้อมูลผู้ใช้ในระบบ
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => {
                        const self = isCaller(u)
                        const lastAdmin = isLastAdmin(u)
                        const protectedUser = self || lastAdmin

                        return (
                          <tr key={u.username} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-medium text-white">{u.email}</div>
                              {self && (
                                <span className="inline-block mt-0.5 text-[10px] text-rose-400 font-semibold">
                                  (บัญชีของคุณ)
                                </span>
                              )}
                              {lastAdmin && !self && (
                                <span className="inline-block mt-0.5 text-[10px] text-amber-400 font-semibold">
                                  (Admin คนสุดท้าย)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
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
                                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer ${
                                  protectedUser
                                    ? 'bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed'
                                    : 'bg-slate-900 border-slate-700 text-white'
                                }`}
                              >
                                <option value="admin">Admin</option>
                                <option value="staff">Staff</option>
                                <option value="user">User</option>
                              </select>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  u.status === 'CONFIRMED'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                }`}
                              >
                                {u.status === 'FORCE_CHANGE_PASSWORD' ? 'ต้องเปลี่ยนรหัสผ่าน' : u.status}
                              </span>
                            </td>
                            <td className="py-3 px-4">
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
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                                  protectedUser
                                    ? 'opacity-40 cursor-not-allowed bg-slate-800 border-slate-700 text-slate-400'
                                    : u.enabled
                                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/30'
                                      : 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-500/30'
                                }`}
                              >
                                {u.enabled ? 'เปิดใช้งาน' : 'ถูกระงับ'}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right">
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
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  protectedUser
                                    ? 'opacity-40 cursor-not-allowed bg-slate-800 border-slate-700 text-slate-500'
                                    : 'text-slate-400 hover:text-rose-400 bg-slate-800/80 border-slate-700 hover:border-rose-500/40'
                                }`}
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
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Trash size={22} className="text-rose-500" />
                ลบข้อมูลห้องและตารางเรียน
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                สิทธิ์ระดับ Admin สามารถลบห้อง (Cascade delete ตารางเรียน) และลบตารางเรียนรายวิชาได้
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Room list column */}
              <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  เลือกห้องที่ต้องการจัดการ ({rooms.length})
                </h3>
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                  {rooms.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRoomId(r.id)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-colors flex items-center justify-between text-xs cursor-pointer ${
                        selectedRoomId === r.id
                          ? 'bg-rose-500/10 border-rose-500/40 text-white'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-white">ห้อง {r.roomNumber || r.code}</span>
                        <div className="text-[11px] text-slate-400">{r.nameThai}</div>
                      </div>
                      <span className="text-[10px] text-slate-400 bg-slate-700/80 px-2 py-0.5 rounded-md">
                        ชั้น {r.floor}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Room details & delete actions column */}
              <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-slate-800/50 p-5 space-y-5">
                {selectedRoom ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          ห้อง {selectedRoom.roomNumber || selectedRoom.code} ({selectedRoom.nameThai})
                        </h3>
                        <p className="text-xs text-slate-400">
                          รหัสห้อง: {selectedRoom.code} • ชั้น {selectedRoom.floor} อาคาร {selectedRoom.building}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={roomActionLoading}
                        onClick={() => handleDeleteRoom(selectedRoom.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4 py-2 transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
                      >
                        <Trash size={15} />
                        <span>ลบห้องนี้ (Cascade Delete)</span>
                      </button>
                    </div>

                    {/* Schedule slots list */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar size={15} className="text-rose-400" />
                        ตารางเรียนในห้องนี้ ({roomSchedules.length})
                      </h4>

                      {roomSchedules.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">ไม่มีตารางเรียนในห้องนี้</p>
                      ) : (
                        <div className="space-y-2">
                          {roomSchedules.map((slot) => {
                            const slotKey = `${slot.dayOfWeek}#${slot.startTime}#${slot.eventCode}`
                            return (
                              <div
                                key={slotKey}
                                className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/60 text-xs"
                              >
                                <div>
                                  <div className="font-semibold text-white">
                                    {slot.eventCode} - {slot.eventName || 'ไม่ระบุวิชา'}
                                  </div>
                                  <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
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
                                  className="text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
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
                  <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500">
                    <Door size={40} className="mb-2 opacity-50" />
                    <p className="text-sm">กรุณาเลือกห้องจากรายการด้านซ้ายเพื่อจัดการข้อมูล</p>
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
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus size={18} className="text-rose-500" />
                เพิ่มผู้ใช้ใหม่ (Add User)
              </h3>
              <button
                onClick={() => setIsAddUserOpen(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {addError && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300 flex items-center gap-2">
                <Warning size={16} className="shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label htmlFor="newUserEmail" className="block text-xs font-semibold text-slate-300 mb-1">
                  อีเมลผู้ใช้
                </label>
                <input
                  id="newUserEmail"
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@torch.dev"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                />
              </div>

              <div>
                <label htmlFor="newUserPassword" className="block text-xs font-semibold text-slate-300 mb-1">
                  รหัสผ่านเริ่มต้น
                </label>
                <input
                  id="newUserPassword"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  * ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก (FORCE_CHANGE_PASSWORD)
                </p>
              </div>

              <div>
                <label htmlFor="newUserRole" className="block text-xs font-semibold text-slate-300 mb-1">
                  สิทธิ์ (Role)
                </label>
                <select
                  id="newUserRole"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50 cursor-pointer"
                >
                  <option value="admin">Admin (ผู้ดูแลระบบทั้งหมด)</option>
                  <option value="staff">Staff (เจ้าหน้าที่แก้ไขห้อง/ตาราง)</option>
                  <option value="user">User (ผู้ใช้ทั่วไป/นักศึกษา)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="rounded-xl border border-slate-700 text-slate-300 hover:text-white px-4 py-2 text-xs font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 text-xs font-medium cursor-pointer disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-800 border border-rose-500/40 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 mx-auto flex items-center justify-center text-rose-400">
              <Trash size={24} weight="duotone" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">ยืนยันการลบบัญชีผู้ใช้</h3>
              <p className="text-xs text-slate-300 mt-1">
                คุณแน่ใจหรือไม่ว่าต้องการลบบัญชี <span className="font-semibold text-rose-400">{userToDelete.email}</span>?
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                การลบนี้จะลบบัญชีผู้ใช้ออกจาก AWS Cognito ทันทีและไม่สามารถกู้คืนได้
              </p>
            </div>

            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="rounded-xl border border-slate-700 text-slate-300 hover:text-white px-4 py-2 text-xs font-medium cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleConfirmDeleteUser}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 text-xs font-medium cursor-pointer disabled:opacity-50"
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
