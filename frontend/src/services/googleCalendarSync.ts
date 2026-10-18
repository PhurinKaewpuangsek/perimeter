import {
  buildGoogleCalendarEvent,
  GOOGLE_EVENT_TAG,
  type CalendarExportOptions,
  type GoogleCalendarEventBody,
} from './calendarExport'
import type { PinnedSchedule } from '../types/pin'
import { getSession } from './authService'

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
const TORCH_USER_KEY = 'torchUser'

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

// Bound to the TORCH user so a token granted to one account is never reused for another.
let cachedToken: { value: string; expiresAt: number; torchUser: string } | null = null
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
function requestAccessToken(torchUser: string): Promise<string> {
  if (cachedToken && cachedToken.torchUser === torchUser && cachedToken.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return Promise.resolve(cachedToken.value)
  }
  if (cachedToken && cachedToken.torchUser !== torchUser) cachedToken = null
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
          torchUser,
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
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...init.headers },
  })
  // Re-prompting here would lose the click gesture, so ask the user to press Sync again.
  if (res.status === 401) {
    cachedToken = null
    throw new GoogleSyncError('auth_expired')
  }
  return res
}

async function listTaggedEvents(token: string, torchUser: string): Promise<{ id: string; iCalUID: string }[]> {
  const events: { id: string; iCalUID: string }[] = []
  let pageToken: string | undefined
  do {
    // Repeated privateExtendedProperty params are ANDed: only this app's events for this TORCH user.
    const params = new URLSearchParams({ maxResults: '250' })
    params.append('privateExtendedProperty', `${GOOGLE_EVENT_TAG.key}=${GOOGLE_EVENT_TAG.value}`)
    params.append('privateExtendedProperty', `${TORCH_USER_KEY}=${torchUser}`)
    if (pageToken) params.set('pageToken', pageToken)
    const res = await calendarFetch(token, `${EVENTS_URL}?${params.toString()}`)
    if (!res.ok) throw new GoogleSyncError('api')
    const data = (await res.json()) as { items?: { id: string; iCalUID: string }[]; nextPageToken?: string }
    events.push(...(data.items ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return events
}

/** events.patch must not resend the immutable iCalUID. */
function patchBody(body: GoogleCalendarEventBody): Omit<GoogleCalendarEventBody, 'iCalUID'> {
  const copy: Partial<GoogleCalendarEventBody> = { ...body }
  delete copy.iCalUID
  return copy as Omit<GoogleCalendarEventBody, 'iCalUID'>
}

/**
 * Imports an event. A previously deleted event keeps its iCalUID as a cancelled entry, so a re-pin makes
 * import answer 409; in that case revive the cancelled event instead.
 */
async function importEvent(token: string, body: GoogleCalendarEventBody): Promise<Response> {
  const res = await calendarFetch(token, `${EVENTS_URL}/import`, { method: 'POST', body: JSON.stringify(body) })
  if (res.status !== 409) return res
  const lookup = await calendarFetch(
    token,
    `${EVENTS_URL}?${new URLSearchParams({ iCalUID: body.iCalUID, showDeleted: 'true' })}`,
  )
  const found = lookup.ok ? ((await lookup.json()) as { items?: { id: string }[] }).items?.[0] : undefined
  if (!found) return res
  const updateBody = patchBody(body)
  return calendarFetch(token, `${EVENTS_URL}/${encodeURIComponent(found.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...updateBody, status: 'confirmed' }),
  })
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
 * Upserts every announced pin into the user's primary calendar (update when an event with the same
 * iCalUID already exists; import only when missing) and deletes previously synced events that are no longer pinned.
 * Only events carrying our private tag are ever deleted.
 */
export interface GoogleSyncOptions extends CalendarExportOptions {
  userId?: string
}

export async function syncPinsToGoogleCalendar(
  pins: PinnedSchedule[],
  options: GoogleSyncOptions = {},
): Promise<SyncSummary> {
  const torchUser = options.userId || getSession()?.user.sub || pins[0]?.userId
  if (!torchUser) throw new GoogleSyncError('auth_expired')

  const tokenPromise = requestAccessToken(torchUser)
  tokenPromise.catch(() => {}) // awaited below; this only avoids an unhandled rejection if building events throws first

  const events: GoogleCalendarEventBody[] = []
  const skippedExams: PinnedSchedule[] = []
  for (const pin of pins) {
    const body = buildGoogleCalendarEvent(pin, options)
    if (body) {
      events.push({
        ...body,
        extendedProperties: { private: { ...body.extendedProperties.private, [TORCH_USER_KEY]: torchUser } },
      })
    } else {
      skippedExams.push(pin)
    }
  }

  const token = await tokenPromise
  const summary: SyncSummary = { upserted: 0, deleted: 0, failed: 0, skippedExams, pruneSkipped: false }

  let existing: { id: string; iCalUID: string }[] = []
  try {
    existing = await listTaggedEvents(token, torchUser)
  } catch (err) {
    if (err instanceof GoogleSyncError && err.code === 'auth_expired') throw err
    summary.pruneSkipped = true
  }

  const currentByUid = new Map<string, string>()
  const duplicateIdsByUid = new Map<string, string[]>()
  for (const event of existing) {
    const primary = currentByUid.get(event.iCalUID)
    if (!primary) {
      currentByUid.set(event.iCalUID, event.id)
      continue
    }
    const duplicates = duplicateIdsByUid.get(event.iCalUID)
    if (duplicates) duplicates.push(event.id)
    else duplicateIdsByUid.set(event.iCalUID, [event.id])
  }

  for (const body of events) {
    const existingId = currentByUid.get(body.iCalUID)
    const ok = existingId
      ? await attempt(() => {
          return calendarFetch(token, `${EVENTS_URL}/${encodeURIComponent(existingId)}`, {
            method: 'PATCH',
            body: JSON.stringify(patchBody(body)),
          })
        })
      : await attempt(() => importEvent(token, body))
    if (ok) summary.upserted++
    else summary.failed++
  }

  // Uses every built UID (even ones whose import failed) so a transient failure never deletes the old copy.
  const wanted = new Set(events.map((e) => e.iCalUID))
  const staleEventIds = existing.filter((e) => !wanted.has(e.iCalUID)).map((e) => e.id)
  for (const [uid, duplicateIds] of duplicateIdsByUid) {
    if (wanted.has(uid)) staleEventIds.push(...duplicateIds)
  }
  for (const staleEventId of staleEventIds) {
    const ok = await attempt(
      () => calendarFetch(token, `${EVENTS_URL}/${encodeURIComponent(staleEventId)}`, { method: 'DELETE' }),
      [404, 410],
    )
    if (ok) summary.deleted++
    else summary.failed++
  }

  return summary
}
