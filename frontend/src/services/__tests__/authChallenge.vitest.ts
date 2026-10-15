import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signIn, completeNewPassword } from '../authService'

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  return {
    CognitoIdentityProviderClient: class {
      send = mockSend
    },
    InitiateAuthCommand: vi.fn(function (input) {
      return { input, commandType: 'InitiateAuth' }
    }),
    RespondToAuthChallengeCommand: vi.fn(function (input) {
      return { input, commandType: 'RespondToAuthChallenge' }
    }),
  }
})

describe('authService - NEW_PASSWORD_REQUIRED challenge flow', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('detects NEW_PASSWORD_REQUIRED challenge instead of throwing "No token returned"', async () => {
    // When a newly created user logs in, Cognito returns ChallengeName: NEW_PASSWORD_REQUIRED
    mockSend.mockResolvedValueOnce({
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      Session: 'mock-cognito-session-token-123',
      ChallengeParameters: {
        USER_ID_FOR_SRP: 'testusr1@gmail.com',
        requiredAttributes: '[]',
      },
    })

    const result = await signIn('testusr1@gmail.com', 'Testusr1!')

    expect(result.challenge).toBe('NEW_PASSWORD_REQUIRED')
    if (result.challenge === 'NEW_PASSWORD_REQUIRED') {
      expect(result.session).toBe('mock-cognito-session-token-123')
      expect(result.email).toBe('testusr1@gmail.com')
    }
  })

  it('completes NEW_PASSWORD_REQUIRED challenge via completeNewPassword', async () => {
    const fakePayload = {
      sub: 'usr-sub-123',
      email: 'testusr1@gmail.com',
      'cognito:groups': ['user'],
    }
    const fakeToken = `header.${btoa(JSON.stringify(fakePayload))}.sig`

    mockSend.mockResolvedValueOnce({
      AuthenticationResult: {
        IdToken: fakeToken,
        AccessToken: 'mock-access-token',
        ExpiresIn: 3600,
      },
    })

    const session = await completeNewPassword(
      'testusr1@gmail.com',
      'PermanentPass123!',
      'mock-cognito-session-token-123'
    )

    expect(session.idToken).toBe(fakeToken)
    expect(session.user.email).toBe('testusr1@gmail.com')
    expect(session.user.groups).toEqual(['user'])
  })
})
