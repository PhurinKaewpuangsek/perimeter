import { describe, it, expect } from 'vitest'
import {
  getHomeRouteForRole,
  sanitizeRedirectPath,
  isPathAllowedForRole,
  resolvePostLoginRedirect,
} from '../authRouting'

describe('authRouting', () => {
  describe('getHomeRouteForRole', () => {
    it('returns /admin for admin role', () => {
      expect(getHomeRouteForRole('admin')).toBe('/admin')
    })

    it('returns /staff for staff role', () => {
      expect(getHomeRouteForRole('staff')).toBe('/staff')
    })

    it('returns /map for user role', () => {
      expect(getHomeRouteForRole('user')).toBe('/map')
    })

    it('returns /map for guest role', () => {
      expect(getHomeRouteForRole('guest')).toBe('/map')
    })
  })

  describe('sanitizeRedirectPath', () => {
    it('accepts safe internal paths', () => {
      expect(sanitizeRedirectPath('/staff')).toBe('/staff')
      expect(sanitizeRedirectPath('/admin?tab=users')).toBe('/admin?tab=users')
      expect(sanitizeRedirectPath('/map')).toBe('/map')
    })

    it('rejects external URLs and protocol-relative paths', () => {
      expect(sanitizeRedirectPath('https://evil.com')).toBeNull()
      expect(sanitizeRedirectPath('http://evil.com')).toBeNull()
      expect(sanitizeRedirectPath('//evil.com')).toBeNull()
      expect(sanitizeRedirectPath('javascript:alert(1)')).toBeNull()
      expect(sanitizeRedirectPath('staff')).toBeNull()
      expect(sanitizeRedirectPath('')).toBeNull()
      expect(sanitizeRedirectPath(null)).toBeNull()
      expect(sanitizeRedirectPath(undefined as unknown as string)).toBeNull()
    })
  })

  describe('isPathAllowedForRole', () => {
    it('admin can open all pages', () => {
      expect(isPathAllowedForRole('/admin', 'admin')).toBe(true)
      expect(isPathAllowedForRole('/staff', 'admin')).toBe(true)
      expect(isPathAllowedForRole('/map', 'admin')).toBe(true)
      expect(isPathAllowedForRole('/', 'admin')).toBe(true)
    })

    it('staff can open /staff, /map, and / but not /admin', () => {
      expect(isPathAllowedForRole('/admin', 'staff')).toBe(false)
      expect(isPathAllowedForRole('/staff', 'staff')).toBe(true)
      expect(isPathAllowedForRole('/map', 'staff')).toBe(true)
      expect(isPathAllowedForRole('/', 'staff')).toBe(true)
    })

    it('user can open /map and / but not /staff or /admin', () => {
      expect(isPathAllowedForRole('/admin', 'user')).toBe(false)
      expect(isPathAllowedForRole('/staff', 'user')).toBe(false)
      expect(isPathAllowedForRole('/map', 'user')).toBe(true)
      expect(isPathAllowedForRole('/', 'user')).toBe(true)
    })

    it('guest can open /map and / only', () => {
      expect(isPathAllowedForRole('/admin', 'guest')).toBe(false)
      expect(isPathAllowedForRole('/staff', 'guest')).toBe(false)
      expect(isPathAllowedForRole('/map', 'guest')).toBe(true)
      expect(isPathAllowedForRole('/', 'guest')).toBe(true)
    })
  })

  describe('resolvePostLoginRedirect', () => {
    it('returns allowed redirect path when valid', () => {
      expect(resolvePostLoginRedirect('admin', '/staff')).toBe('/staff')
      expect(resolvePostLoginRedirect('admin', '/admin')).toBe('/admin')
      expect(resolvePostLoginRedirect('staff', '/staff')).toBe('/staff')
      expect(resolvePostLoginRedirect('user', '/map')).toBe('/map')
    })

    it('falls back to role home when redirect path is forbidden for that role', () => {
      expect(resolvePostLoginRedirect('staff', '/admin')).toBe('/staff')
      expect(resolvePostLoginRedirect('user', '/staff')).toBe('/map')
      expect(resolvePostLoginRedirect('user', '/admin')).toBe('/map')
    })

    it('falls back to role home when redirect path is invalid or malicious', () => {
      expect(resolvePostLoginRedirect('admin', 'https://evil.com')).toBe('/admin')
      expect(resolvePostLoginRedirect('staff', '//evil.com')).toBe('/staff')
      expect(resolvePostLoginRedirect('user', null)).toBe('/map')
    })
  })
})
