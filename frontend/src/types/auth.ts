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

export interface AuthChallenge {
  challenge: 'NEW_PASSWORD_REQUIRED'
  session: string
  email: string
}

export type SignInResult =
  | { challenge: null; session: AuthSession }
  | AuthChallenge
