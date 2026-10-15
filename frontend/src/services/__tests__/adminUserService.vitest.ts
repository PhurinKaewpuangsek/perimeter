/**
 * adminUserService unit tests — vitest
 *
 * Verifies public contract of Cognito user management operations:
 * - listUsers: GET /api/admin/users
 * - createUser: POST /api/admin/users
 * - updateUser: PUT /api/admin/users/{username}
 * - deleteUser: DELETE /api/admin/users/{username}
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from '../adminUserService'

function mockFetch(status: number, body: unknown = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response),
  )
}

function lastFetch(): { url: string; init: RequestInit } {
  const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
  const [url, init] = calls[calls.length - 1]
  return { url: url as string, init: init as RequestInit }
}

describe('adminUserService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listUsers', () => {
    it('sends GET /api/admin/users with Authorization header', async () => {
      const mockUsers = [
        {
          username: 'admin@torch.dev',
          email: 'admin@torch.dev',
          role: 'admin',
          status: 'CONFIRMED',
          enabled: true,
        },
      ]
      mockFetch(200, { users: mockUsers })

      const users = await listUsers()
      expect(users).toEqual(mockUsers)

      const { url, init } = lastFetch()
      expect(url).toContain('/api/admin/users')
      expect(init.method).toBe('GET')
    })

    it('throws error on 403 Forbidden', async () => {
      mockFetch(403, { error: 'Forbidden: Insufficient privileges' })
      await expect(listUsers()).rejects.toThrow('Forbidden: Insufficient privileges')
    })
  })

  describe('createUser', () => {
    it('sends POST /api/admin/users with email, password, and role', async () => {
      mockFetch(201, {
        message: 'User created successfully',
        user: { username: 'staff@torch.dev', email: 'staff@torch.dev', role: 'staff', status: 'FORCE_CHANGE_PASSWORD' },
      })

      const result = await createUser({
        email: 'staff@torch.dev',
        password: 'TemporaryPassword123!',
        role: 'staff',
      })

      expect(result.email).toBe('staff@torch.dev')
      expect(result.role).toBe('staff')

      const { url, init } = lastFetch()
      expect(url).toContain('/api/admin/users')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body as string)
      expect(body.email).toBe('staff@torch.dev')
      expect(body.password).toBe('TemporaryPassword123!')
      expect(body.role).toBe('staff')
    })

    it('throws error when user already exists (409)', async () => {
      mockFetch(409, { error: 'UsernameExistsException', message: 'An account with the given email already exists.' })
      await expect(
        createUser({ email: 'existing@torch.dev', password: 'P!', role: 'user' }),
      ).rejects.toThrow(/UsernameExistsException|already exists/)
    })
  })

  describe('updateUser', () => {
    it('sends PUT /api/admin/users/{username} with encoded path and updated fields', async () => {
      mockFetch(200, { message: 'User updated successfully' })

      await updateUser('staff@torch.dev', { role: 'admin', enabled: true })

      const { url, init } = lastFetch()
      expect(url).toContain('/api/admin/users/staff%40torch.dev')
      expect(init.method).toBe('PUT')
      const body = JSON.parse(init.body as string)
      expect(body.role).toBe('admin')
      expect(body.enabled).toBe(true)
    })

    it('throws specific message when trying to demote own account or last admin (400)', async () => {
      mockFetch(400, { error: 'Cannot demote your own account' })
      await expect(updateUser('admin@torch.dev', { role: 'staff' })).rejects.toThrow(
        'Cannot demote your own account',
      )
    })
  })

  describe('deleteUser', () => {
    it('sends DELETE /api/admin/users/{username} with encoded path', async () => {
      mockFetch(200, { message: 'User deleted successfully' })

      await deleteUser('former-staff@torch.dev')

      const { url, init } = lastFetch()
      expect(url).toContain('/api/admin/users/former-staff%40torch.dev')
      expect(init.method).toBe('DELETE')
    })

    it('throws when server forbids deleting the last admin', async () => {
      mockFetch(400, { error: 'Cannot delete the last remaining admin' })
      await expect(deleteUser('admin@torch.dev')).rejects.toThrow(
        'Cannot delete the last remaining admin',
      )
    })
  })
})
