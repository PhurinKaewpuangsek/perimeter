import {
  buildGoogleCalendarEvent,
  GOOGLE_EVENT_TAG,
  type CalendarExportOptions,
  type GoogleCalendarEventBody,
} from './calendarExport'
import type { PinnedSchedule } from '../types/pin'

/**
 * One-click Google Calendar sync using the Google Identity Services token flow.
 * The access token lives in module memory only: no refresh token, client secret or
 * backend is involved, and nothing is persisted.
 */

const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
// Refresh slightly early so a token never expires mid-sync.
const EXPIRY_MARGIN_MS = 60_000

interface GisTokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
}

interface GisTokenClient {
  requestAccessToken(): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: GisTokenResponse) => void
            error_callback?: (error: { type?: string }) => void
          }): GisTokenClient
        }
      }
    }
  }
}

export type GoogleSyncErrorCode =
  | 'not_configured'
  | 'script_unavailable'
  | 'denied'
  | 'popup_blocked'
  | 'auth_expired'
  | 'api'

export class GoogleSyncError extends Error {
  code: GoogleSyncErrorCode

  constructor(code: GoogleSyncErrorCode) {
    super(code)
    this.name = 'GoogleSyncError'
    this.code = code
  }
}

export interface SyncSummary {
  upserted: number
  deleted: number
  failed: number
  skippedExams: PinnedSchedule[]
  /** True when the existing tagged events could not be listed, so stale ones were not removed. */
  pruneSkipped: boolean
}

let cachedToken: { value: string; expiresAt: number } | null = null
let scriptPromise: Promise<void> | null = null

// Read at call time (not module load) so the button hides cleanly when the client ID is unset.
function getClientId(): string {
  return import.meta.env?.VITE_GOOGLE_CLIENT_ID || ''
}

export function isGoogleSyncConfigured(): boolean {
  return Boolean(getClientId())
}

/** Preload the GIS script (e.g. when the drawer opens) so the later click can open the consent popup synchronously. */
export function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GIS_SRC
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        script.remove()
        scriptPromise = null
        reject(new GoogleSyncError('script_unavailable'))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

/** Must be called synchronously from a click handler, otherwise the browser blocks the consent popup. */
function requestAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return Promise.resolve(cachedToken.value)
  }
  const clientId = getClientId()
  if (!clientId) return Promise.reject(new GoogleSyncError('not_configured'))
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) return Promise.reject(new GoogleSyncError('script_unavailable'))

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new GoogleSyncError('denied'))
          return
        }
        cachedToken = {
          value: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000,
        }
        resolve(response.access_token)
      },
      error_callback: (error) =>
        reject(new GoogleSyncError(error.type === 'popup_failed_to_open' ? 'popup_blocked' : 'denied')),
    })
    client.requestAccessToken()
  })
}

async function calendarFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  })
  // Re-prompting here would lose the click gesture, so ask the user to press Sync again.
  if (res.status === 401) {
    cachedToken = null
    throw new GoogleSyncError('auth_expired')
  }
  return res
}

async function listTaggedEvents(token: string): Promise<{ id: string; iCalUID: string }[]> {
  const events: { id: string; iCalUID: string }[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      privateExtendedProperty: `${GOOGLE_EVENT_TAG.key}=${GOOGLE_EVENT_TAG.value}`,
      maxResults: '250',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await calendarFetch(token, `${EVENTS_URL}?${params.toString()}`)
    if (!res.ok) throw new GoogleSyncError('api')
    const data = (await res.json()) as { items?: { id: string; iCalUID: string }[]; nextPageToken?: string }
    events.push(...(data.items ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return events
}

/** True when the request succeeded. Network errors count as failed; only an expired token aborts the run. */
async function attempt(request: () => Promise<Response>, okStatuses: number[] = []): Promise<boolean> {
  try {
    const res = await request()
    return res.ok || okStatuses.includes(res.status)
  } catch (err) {
    if (err instanceof GoogleSyncError) throw err
    return false
  }
}

/**
 * Upserts every announced pin into the user's primary calendar (events.import keyed by iCalUID, so
 * repeated syncs never duplicate) and deletes previously synced events that are no longer pinned.
 * Only events carrying our private tag are ever deleted.
 */
export async function syncPinsToGoogleCalendar(
  pins: PinnedSchedule[],
  options: CalendarExportOptions = {},
): Promise<SyncSummary> {
  const tokenPromise = requestAccessToken()

  const events: GoogleCalendarEventBody[] = []
  const skippedExams: PinnedSchedule[] = []
  for (const pin of pins) {
    const body = buildGoogleCalendarEvent(pin, options)
    if (body) events.push(body)
    else skippedExams.push(pin)
  }

  const token = await tokenPromise
  const summary: SyncSummary = { upserted: 0, deleted: 0, failed: 0, skippedExams, pruneSkipped: false }

  for (const body of events) {
    const ok = await attempt(() =>
      calendarFetch(token, `${EVENTS_URL}/import`, { method: 'POST', body: JSON.stringify(body) }),
    )
    if (ok) summary.upserted++
    else summary.failed++
  }

  let existing: { id: string; iCalUID: string }[] = []
  try {
    existing = await listTaggedEvents(token)
  } catch (err) {
    if (err instanceof GoogleSyncError && err.code === 'auth_expired') throw err
    summary.pruneSkipped = true
  }

  // Uses every built UID (even ones whose import failed) so a transient failure never deletes the old copy.
  const wanted = new Set(events.map((e) => e.iCalUID))
  for (const stale of existing.filter((e) => !wanted.has(e.iCalUID))) {
    const ok = await attempt(
      () => calendarFetch(token, `${EVENTS_URL}/${encodeURIComponent(stale.id)}`, { method: 'DELETE' }),
      [404, 410],
    )
    if (ok) summary.deleted++
    else summary.failed++
  }

  return summary
}
