/**
 * adminUserService — write-API wrappers for the admin Cognito user management endpoints (#96).
 *
 * All functions throw on non-2xx responses so callers can handle errors uniformly.
 */

import { getIdToken } from './authService'
import type { UserRole } from '../types/auth'

const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

function getAuthHeader(): Record<string, string> {
  const token = getIdToken()
  return token ? { Authorization: token } : {}
}

function getWriteHeaders(): Record<string, string> {
  return {
    ...getAuthHeader(),
    'Content-Type': 'application/json',
  }
}

async function handleFetchError(res: Response, fallbackPrefix: string): Promise<never> {
  const err = await res.json().catch(() => ({}))
  if (res.status === 401) {
    throw new Error('Unauthorized: Please log in to perform this action.')
  }
  if (res.status === 403) {
    throw new Error((err as { error?: string }).error ?? 'Forbidden: Insufficient privileges.')
  }
  const errorObj = err as { error?: string; message?: string }
  throw new Error(errorObj.error || errorObj.message || `${fallbackPrefix} failed (${res.status})`)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManagedUser {
  username: string
  email: string
  sub?: string
  role: UserRole
  status: string
  enabled: boolean
  createdAt?: string
}

export interface CreateUserPayload {
  email: string
  password: string
  role: UserRole
}

export interface UpdateUserPayload {
  role?: UserRole
  enabled?: boolean
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/users
 */
export async function listUsers(): Promise<ManagedUser[]> {
  const url = `${API_BASE_URL}/api/admin/users`
  const res = await fetch(url, {
    method: 'GET',
    headers: getAuthHeader(),
  })
  if (!res.ok) {
    await handleFetchError(res, 'GET /api/admin/users')
  }
  const data = (await res.json()) as { users: ManagedUser[] }
  return data.users || []
}

/**
 * POST /api/admin/users
 */
export async function createUser(payload: CreateUserPayload): Promise<ManagedUser> {
  const url = `${API_BASE_URL}/api/admin/users`
  const res = await fetch(url, {
    method: 'POST',
    headers: getWriteHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await handleFetchError(res, 'POST /api/admin/users')
  }
  const data = (await res.json()) as { user: ManagedUser }
  return data.user
}

/**
 * PUT /api/admin/users/{username}
 */
export async function updateUser(username: string, payload: UpdateUserPayload): Promise<void> {
  const url = `${API_BASE_URL}/api/admin/users/${encodeURIComponent(username)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: getWriteHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await handleFetchError(res, 'PUT /api/admin/users')
  }
}

/**
 * DELETE /api/admin/users/{username}
 */
export async function deleteUser(username: string): Promise<void> {
  const url = `${API_BASE_URL}/api/admin/users/${encodeURIComponent(username)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  if (!res.ok) {
    await handleFetchError(res, 'DELETE /api/admin/users')
  }
}
