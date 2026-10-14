import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import type { AuthSession, AuthUser, UserRole } from '../types/auth'

const USER_POOL_ID = import.meta.env?.VITE_COGNITO_USER_POOL_ID || ''
const CLIENT_ID = import.meta.env?.VITE_COGNITO_CLIENT_ID || ''
const REGION =
  import.meta.env?.VITE_AWS_REGION || (USER_POOL_ID.split('_')[0] || 'us-east-1')

const SESSION_STORAGE_KEY = 'perimeter_auth_session'

/**
 * Decodes standard JWT payload without requiring external polyfills.
 */
export function parseJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split('.')[1]
    if (!base64Url) return {}
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
    return JSON.parse(jsonPayload)
  } catch (err) {
    console.error('Failed to parse JWT payload', err)
    return {}
  }
}

function extractGroups(claims: Record<string, unknown>): string[] {
  const raw = claims['cognito:groups']
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') {
    return raw
      .replace(/[[\]]/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

export function getSession(): AuthSession | null {
  try {
    const item = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!item) return null
    const session: AuthSession = JSON.parse(item)
    // If expired, discard
    if (session.expiresAt && Date.now() > session.expiresAt) {
      signOut()
      return null
    }
    return session
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch (err) {
    console.error('Failed to save auth session', err)
  }
}

export function signOut(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch (err) {
    console.error('Failed to clear auth session', err)
  }
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const client = new CognitoIdentityProviderClient({ region: REGION })
  const command = new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  })

  const response = await client.send(command)
  if (!response.AuthenticationResult || !response.AuthenticationResult.IdToken) {
    throw new Error('Authentication failed: No token returned from Cognito')
  }

  const idToken = response.AuthenticationResult.IdToken
  const accessToken = response.AuthenticationResult.AccessToken || ''
  const refreshToken = response.AuthenticationResult.RefreshToken
  const expiresIn = response.AuthenticationResult.ExpiresIn || 3600

  const claims = parseJwtPayload(idToken)
  const user: AuthUser = {
    email: (claims.email as string) || (claims['cognito:username'] as string) || email,
    sub: (claims.sub as string) || '',
    groups: extractGroups(claims),
  }

  const session: AuthSession = {
    idToken,
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    user,
  }

  saveSession(session)
  return session
}

export function getIdToken(): string | null {
  return getSession()?.idToken ?? null
}

export function getUser(): AuthUser | null {
  return getSession()?.user ?? null
}

export function isAuthenticated(): boolean {
  return Boolean(getSession())
}

export function hasRole(role: string, session: AuthSession | null = getSession()): boolean {
  return session?.user.groups.includes(role) ?? false
}

export function isAdmin(session: AuthSession | null = getSession()): boolean {
  return hasRole('admin', session)
}

export function isStaff(session: AuthSession | null = getSession()): boolean {
  return hasRole('staff', session) || hasRole('admin', session)
}

export function isUser(session: AuthSession | null = getSession()): boolean {
  return hasRole('user', session)
}

export function getUserRole(session: AuthSession | null = getSession()): UserRole {
  if (isAdmin(session)) return 'admin'
  if (isStaff(session)) return 'staff'
  if (isUser(session)) return 'user'
  return 'guest'
}
