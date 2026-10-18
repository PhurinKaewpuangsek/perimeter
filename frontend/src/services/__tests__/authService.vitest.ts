import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseJwtPayload,
  getSession,
  saveSession,
  signOut,
  isAdmin,
  isStaff,
  isUser,
  getUserRole,
  getIdToken,
  checkSession,
} from '../authService'
import type { AuthSession } from '../../types/auth'

describe('authService', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('parses JWT payload correctly', () => {
    // payload: {"sub":"123","email":"test@torch.dev","cognito:groups":["staff"]}
    const samplePayload = {
      sub: '123',
      email: 'test@torch.dev',
      'cognito:groups': ['staff'],
    }
    const token = `header.${btoa(JSON.stringify(samplePayload))}.signature`
    const parsed = parseJwtPayload(token)

    expect(parsed.sub).toBe('123')
    expect(parsed.email).toBe('test@torch.dev')
    expect(parsed['cognito:groups']).toEqual(['staff'])
  })

  it('returns null session when storage is empty', () => {
    expect(getSession()).toBeNull()
    expect(getIdToken()).toBeNull()
  })

  it('returns valid session and user info when saved', () => {
    const session: AuthSession = {
      idToken: 'valid-token',
      accessToken: 'access-token',
      expiresAt: Date.now() + 60000,
      user: {
        email: 'admin@torch.dev',
        sub: 'admin-id',
        groups: ['admin'],
      },
    }
    saveSession(session)

    expect(getSession()).toEqual(session)
    expect(getIdToken()).toBe('valid-token')
    expect(isAdmin()).toBe(true)
    expect(isStaff()).toBe(true)
    expect(isUser()).toBe(false)
    expect(getUserRole()).toBe('admin')
  })

  it('identifies staff role correctly', () => {
    const session: AuthSession = {
      idToken: 'staff-token',
      accessToken: 'access-token',
      expiresAt: Date.now() + 60000,
      user: {
        email: 'staff@torch.dev',
        sub: 'staff-id',
        groups: ['staff'],
      },
    }
    saveSession(session)

    expect(isAdmin()).toBe(false)
    expect(isStaff()).toBe(true)
    expect(isUser()).toBe(false)
    expect(getUserRole()).toBe('staff')
  })

  it('identifies user role correctly', () => {
    const session: AuthSession = {
      idToken: 'user-token',
      accessToken: 'access-token',
      expiresAt: Date.now() + 60000,
      user: {
        email: 'user@torch.dev',
        sub: 'user-id',
        groups: ['user'],
      },
    }
    saveSession(session)

    expect(isAdmin()).toBe(false)
    expect(isStaff()).toBe(false)
    expect(isUser()).toBe(true)
    expect(getUserRole()).toBe('user')
  })

  it('discards expired session automatically', () => {
    const session: AuthSession = {
      idToken: 'expired-token',
      accessToken: 'access-token',
      expiresAt: Date.now() - 1000, // expired 1s ago
      user: {
        email: 'user@torch.dev',
        sub: 'user-id',
        groups: ['user'],
      },
    }
    saveSession(session)

    expect(getSession()).toBeNull()
    expect(getIdToken()).toBeNull()
  })

  it('clears session on signOut', () => {
    const session: AuthSession = {
      idToken: 'token',
      accessToken: 'token',
      expiresAt: Date.now() + 60000,
      user: { email: 'staff@torch.dev', sub: '1', groups: ['staff'] },
    }
    saveSession(session)
    expect(getSession()).not.toBeNull()

    signOut()
    expect(getSession()).toBeNull()
  })

  describe('checkSession', () => {
    it('returns null session and expired false when storage is empty', () => {
      const res = checkSession()
      expect(res.session).toBeNull()
      expect(res.expired).toBe(false)
    })

    it('returns session and expired false when session is active', () => {
      const session: AuthSession = {
        idToken: 'token',
        accessToken: 'token',
        expiresAt: Date.now() + 60000,
        user: { email: 'staff@torch.dev', sub: '1', groups: ['staff'] },
      }
      saveSession(session)
      const res = checkSession()
      expect(res.session).toEqual(session)
      expect(res.expired).toBe(false)
    })

    it('returns null session and expired true when session is expired', () => {
      const session: AuthSession = {
        idToken: 'token',
        accessToken: 'token',
        expiresAt: Date.now() - 1000,
        user: { email: 'staff@torch.dev', sub: '1', groups: ['staff'] },
      }
      saveSession(session)
      const res = checkSession()
      expect(res.session).toBeNull()
      expect(res.expired).toBe(true)
      expect(getSession()).toBeNull()
    })
  })
})

