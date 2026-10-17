import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PinnedSchedule } from '../../types/pin'

const session = vi.hoisted(() => ({ sub: 'sub-1' }))
vi.mock('../authService', () => ({ getSession: () => ({ user: { sub: session.sub } }) }))

type SyncModule = typeof import('../googleCalendarSync')

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

const classPin: PinnedSchedule = {
  userId: 'user-1',
  pinKey: 'LC3-105#MON#09:30#CS333',
  roomCode: 'LC3-105',
  scheduleSlot: 'MON#09:30#CS333',
  eventCode: 'CS333',
  eventName: 'Software Engineering',
  dayOfWeek: 'MON',
  startTime: '09:30',
  endTime: '12:30',
  eventType: 'class',
}

const examPin: PinnedSchedule = {
  ...classPin,
  pinKey: 'LC3-201#WED#13:30#CS102',
  roomCode: 'LC3-201',
  scheduleSlot: 'WED#13:30#CS102',
  eventCode: 'CS102',
  dayOfWeek: 'WED',
  eventType: 'exam',
  eventDate: '2026-10-21',
}

const unannouncedExamPin: PinnedSchedule = {
  ...examPin,
  pinKey: 'LC3-205#FRI#09:00#CS999',
  eventCode: 'CS999',
  eventDate: undefined,
}

type Handler = (method: string, url: string) => Response | Promise<Response>

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFetch(handler: Handler) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(init?.method ?? 'GET', url)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function calls(fetchMock: ReturnType<typeof mockFetch>): string[] {
  return fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url.replace(EVENTS_URL, '')}`)
}

type GisConfig = Parameters<NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']>[0]

function installGis(respond: (config: GisConfig) => void) {
  const initTokenClient = vi.fn((config: GisConfig) => ({ requestAccessToken: () => respond(config) }))
  window.google = { accounts: { oauth2: { initTokenClient } } }
  return initTokenClient
}

const grant = (config: GisConfig) => config.callback({ access_token: 'tok-1', expires_in: 3600 })

describe('googleCalendarSync service', () => {
  let sync: SyncModule

  beforeEach(async () => {
    vi.resetModules() // the access token is cached at module level
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id.apps.googleusercontent.com')
    sync = await import('../googleCalendarSync')
  })

  afterEach(() => {
    delete window.google
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('reports whether a client ID is configured', async () => {
    expect(sync.isGoogleSyncConfigured()).toBe(true)
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    expect(sync.isGoogleSyncConfigured()).toBe(false)
  })

  it('imports each announced pin with the tag, skips unannounced exams, and sends a bearer token', async () => {
    const initTokenClient = installGis(grant)
    const fetchMock = mockFetch((method) => (method === 'GET' ? json({ items: [] }) : json({ id: 'g1' })))

    const result = await sync.syncPinsToGoogleCalendar([classPin, examPin, unannouncedExamPin])

    expect(initTokenClient.mock.calls[0][0].scope).toBe('https://www.googleapis.com/auth/calendar.events')
    expect(result).toMatchObject({ upserted: 2, deleted: 0, failed: 0, pruneSkipped: false })
    expect(result.skippedExams.map((p) => p.eventCode)).toEqual(['CS999'])

    const imports = fetchMock.mock.calls.filter(([url]) => url.endsWith('/events/import'))
    expect(imports).toHaveLength(2)
    const [, firstInit] = imports[0]
    expect((firstInit?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')
    const body = JSON.parse(firstInit?.body as string)
    expect(body.iCalUID).toBe('LC3-105#MON#09:30#CS333@perimeter')
    expect(body.extendedProperties.private).toEqual({ source: 'torch', torchUser: 'sub-1' })

    const listCall = fetchMock.mock.calls.find(([url]) => url.includes('privateExtendedProperty'))
    const listUrl = decodeURIComponent(listCall![0])
    expect(listUrl).toContain('privateExtendedProperty=source=torch')
    expect(listUrl).toContain('privateExtendedProperty=torchUser=sub-1')
  })

  it('deletes tagged events whose pin was removed and keeps the ones still pinned', async () => {
    installGis(grant)
    const fetchMock = mockFetch((method, url) => {
      if (method === 'GET') {
        return json({
          items: [
            { id: 'keep', iCalUID: 'LC3-105#MON#09:30#CS333@perimeter' },
            { id: 'stale', iCalUID: 'LC3-999#TUE#08:00#GONE@perimeter' },
          ],
        })
      }
      return url.includes('/stale') ? new Response(null, { status: 204 }) : json({ id: 'g1' })
    })

    const result = await sync.syncPinsToGoogleCalendar([classPin])

    expect(result).toMatchObject({ upserted: 1, deleted: 1, failed: 0 })
    expect(calls(fetchMock)).toContain('PATCH /keep')
    const deletes = calls(fetchMock).filter((c) => c.startsWith('DELETE'))
    expect(deletes).toEqual(['DELETE /stale'])
  })

  it('does not reuse a cached token for a different TORCH user, even when syncing zero pins', async () => {
    const initTokenClient = installGis(grant)
    mockFetch((method) => (method === 'GET' ? json({ items: [] }) : json({ id: 'g1' })))

    await sync.syncPinsToGoogleCalendar([classPin], { userId: 'user-1' })
    await sync.syncPinsToGoogleCalendar([], { userId: 'user-2' })

    expect(initTokenClient).toHaveBeenCalledTimes(2)
  })

  it('continues after a failed import, counts it, and never deletes that pin\'s existing copy', async () => {
    installGis(grant)
    const fetchMock = mockFetch((method, url) => {
      if (method === 'GET') return json({ items: [{ id: 'old-exam', iCalUID: 'LC3-201#WED#13:30#CS102@perimeter' }] })
      return url.endsWith('/old-exam') || url.endsWith('/import') ? json({}, 500) : new Response(null, { status: 204 })
    })

    const result = await sync.syncPinsToGoogleCalendar([classPin, examPin])

    expect(result).toMatchObject({ upserted: 0, deleted: 0, failed: 2 })
    expect(calls(fetchMock).filter((c) => c.startsWith('DELETE'))).toEqual([])
    expect(calls(fetchMock).filter((c) => c.includes('/import'))).toHaveLength(1)
  })

  it('revives a cancelled event when import answers 409 after a re-pin', async () => {
    installGis(grant)
    const fetchMock = mockFetch((method, url) => {
      if (url.endsWith('/import')) return json({}, 409)
      if (method === 'GET') return url.includes('showDeleted=true') ? json({ items: [{ id: 'gone-1' }] }) : json({ items: [] })
      return json({ id: 'gone-1' })
    })

    const result = await sync.syncPinsToGoogleCalendar([classPin])

    expect(result).toMatchObject({ upserted: 1, failed: 0 })
    const patch = fetchMock.mock.calls.find(([url, init]) => url.endsWith('/gone-1') && init?.method === 'PATCH')
    expect(JSON.parse(patch![1].body as string).status).toBe('confirmed')
  })

  it('prunes duplicate tagged events that share the same iCalUID', async () => {
    installGis(grant)
    const fetchMock = mockFetch((method, url) => {
      if (method === 'GET') {
        return json({
          items: [
            { id: 'keep', iCalUID: 'LC3-105#MON#09:30#CS333@perimeter' },
            { id: 'dup', iCalUID: 'LC3-105#MON#09:30#CS333@perimeter' },
          ],
        })
      }
      return url.includes('/dup') || url.includes('/keep') ? new Response(null, { status: 204 }) : json({ id: 'g1' })
    })

    const result = await sync.syncPinsToGoogleCalendar([classPin])

    expect(result).toMatchObject({ upserted: 1, deleted: 1, failed: 0 })
    expect(calls(fetchMock)).toContain('PATCH /keep')
    expect(calls(fetchMock)).toContain('DELETE /dup')
  })

  it('skips the delete step when the existing events cannot be listed', async () => {
    installGis(grant)
    const fetchMock = mockFetch((method) => (method === 'GET' ? json({}, 500) : json({ id: 'g1' })))

    const result = await sync.syncPinsToGoogleCalendar([classPin])

    expect(result).toMatchObject({ upserted: 1, deleted: 0, pruneSkipped: true })
    expect(calls(fetchMock).some((c) => c.startsWith('DELETE'))).toBe(false)
  })

  it('treats an already-gone event (404/410) as deleted', async () => {
    installGis(grant)
    mockFetch((method) => {
      if (method === 'GET') return json({ items: [{ id: 'gone', iCalUID: 'x@perimeter' }] })
      return method === 'DELETE' ? json({}, 410) : json({ id: 'g1' })
    })

    const result = await sync.syncPinsToGoogleCalendar([classPin])
    expect(result.deleted).toBe(1)
  })

  it('rejects with "denied" and makes no API calls when the user declines consent', async () => {
    installGis((config) => config.callback({ error: 'access_denied' }))
    const fetchMock = mockFetch(() => json({}))

    await expect(sync.syncPinsToGoogleCalendar([classPin])).rejects.toMatchObject({ code: 'denied' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects with "popup_blocked" when the browser blocks the consent popup', async () => {
    installGis((config) => config.error_callback?.({ type: 'popup_failed_to_open' }))
    mockFetch(() => json({}))

    await expect(sync.syncPinsToGoogleCalendar([classPin])).rejects.toMatchObject({ code: 'popup_blocked' })
  })

  it('rejects with "not_configured" when no client ID is set', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    installGis(grant)
    mockFetch(() => json({}))

    await expect(sync.syncPinsToGoogleCalendar([classPin])).rejects.toMatchObject({ code: 'not_configured' })
  })

  it('aborts with "auth_expired" on a 401 and asks for a fresh token on the next run', async () => {
    const initTokenClient = installGis(grant)
    mockFetch(() => json({}, 401))

    await expect(sync.syncPinsToGoogleCalendar([classPin])).rejects.toMatchObject({ code: 'auth_expired' })

    mockFetch((method) => (method === 'GET' ? json({ items: [] }) : json({ id: 'g1' })))
    await sync.syncPinsToGoogleCalendar([classPin])
    expect(initTokenClient).toHaveBeenCalledTimes(2)
  })

  it('reuses a still-valid in-memory token instead of prompting again', async () => {
    const initTokenClient = installGis(grant)
    mockFetch((method) => (method === 'GET' ? json({ items: [] }) : json({ id: 'g1' })))

    await sync.syncPinsToGoogleCalendar([classPin])
    await sync.syncPinsToGoogleCalendar([classPin])

    expect(initTokenClient).toHaveBeenCalledTimes(1)
  })

  it('does not reuse a token or prune events when a different TORCH user syncs in the same tab', async () => {
    const initTokenClient = installGis(grant)
    const fetchMock = mockFetch((method) => (method === 'GET' ? json({ items: [] }) : json({ id: 'g1' })))

    await sync.syncPinsToGoogleCalendar([classPin])
    session.sub = 'sub-2'
    await sync.syncPinsToGoogleCalendar([])

    expect(initTokenClient).toHaveBeenCalledTimes(2)
    const listUrls = fetchMock.mock.calls.map(([url]) => decodeURIComponent(url)).filter((u) => u.includes('privateExtendedProperty'))
    expect(listUrls.at(-1)).toContain('privateExtendedProperty=torchUser=sub-2')
    session.sub = 'sub-1'
  })

  it('follows list pagination so no tagged event is missed', async () => {
    installGis(grant)
    const fetchMock = mockFetch((method, url) => {
      if (method === 'GET') {
        return url.includes('pageToken=p2')
          ? json({ items: [{ id: 'stale-2', iCalUID: 'b@perimeter' }] })
          : json({ items: [{ id: 'stale-1', iCalUID: 'a@perimeter' }], nextPageToken: 'p2' })
      }
      return method === 'DELETE' ? new Response(null, { status: 204 }) : json({ id: 'g1' })
    })

    const result = await sync.syncPinsToGoogleCalendar([classPin])

    expect(result.deleted).toBe(2)
    expect(calls(fetchMock).filter((c) => c.startsWith('DELETE')).sort()).toEqual(['DELETE /stale-1', 'DELETE /stale-2'])
  })
})
