import type { UserRole } from '../types/auth'

/**
 * Returns the default home path for each user role.
 * - admin: /admin
 * - staff: /staff
 * - user: /map
 * - guest: /map
 */
export function getHomeRouteForRole(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/admin'
    case 'staff':
      return '/staff'
    case 'user':
    case 'guest':
    default:
      return '/map'
  }
}

/**
 * Sanitizes an incoming redirect parameter.
 * Accepts only safe internal paths starting with a single '/' (not '//', 'http:', etc.).
 */
export function sanitizeRedirectPath(redirect: string | null | undefined): string | null {
  if (!redirect || typeof redirect !== 'string') return null
  const trimmed = redirect.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null
  return trimmed
}

/**
 * Determines whether a role is authorized to view a specific path.
 */
export function isPathAllowedForRole(path: string, role: UserRole): boolean {
  const normalized = path.split('?')[0].split('#')[0]

  // Landing page and map are public to all roles
  if (normalized === '/' || normalized === '/map' || normalized === '/prototype/map') {
    return true
  }

  // /staff is accessible to staff and admin
  if (normalized === '/staff') {
    return role === 'staff' || role === 'admin'
  }

  // /admin is accessible to admin only
  if (normalized === '/admin') {
    return role === 'admin'
  }

  // Any other page defaults to false
  return false
}

/**
 * Resolves the destination after login.
 * If redirectParam is provided, safe, and allowed for the role, redirectParam is returned.
 * Otherwise, falls back to the role's home path.
 */
export function resolvePostLoginRedirect(role: UserRole, redirectParam: string | null | undefined): string {
  const sanitized = sanitizeRedirectPath(redirectParam)
  if (sanitized && isPathAllowedForRole(sanitized, role)) {
    return sanitized
  }
  return getHomeRouteForRole(role)
}
