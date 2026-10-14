export type UserRole = 'admin' | 'staff' | 'user' | 'guest'

export interface AuthUser {
  email: string
  sub: string
  groups: string[]
}

export interface AuthSession {
  idToken: string
  accessToken: string
  refreshToken?: string
  expiresAt: number
  user: AuthUser
}
