export interface FetchWithRetryOptions {
  maxRetries?: number
  initialDelayMs?: number
  backoffFactor?: number
  maxDelayMs?: number
  jitter?: boolean
  retryOnStatus?: number[]
  sleep?: (ms: number) => Promise<void>
  fetchFn?: typeof fetch
}

const DEFAULT_RETRY_STATUSES = [429, 500, 502, 503, 504]
export const TOO_MANY_REQUESTS_MESSAGE = 'ระบบกำลังคนใช้งานมาก ลองใหม่'

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Resilient fetch wrapper with exponential backoff and jitter for handling transient
 * throttling (HTTP 429) and upstream server errors (HTTP 5xx).
 */
export async function fetchWithRetry(
  url: string | URL,
  init?: RequestInit,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelayMs = 150,
    backoffFactor = 2,
    maxDelayMs = 2000,
    jitter = true,
    retryOnStatus = DEFAULT_RETRY_STATUSES,
    sleep = defaultSleep,
    fetchFn = globalThis.fetch,
  } = options

  let attempt = 0

  while (true) {
    const response = await fetchFn(url, init)

    if (retryOnStatus.includes(response.status)) {
      if (attempt < maxRetries) {
        attempt++
        let delay = Math.min(maxDelayMs, initialDelayMs * Math.pow(backoffFactor, attempt - 1))
        if (jitter) {
          delay = delay * (0.5 + Math.random() * 0.5)
        }
        await sleep(delay)
        continue
      }

      // Max retries reached for 429
      if (response.status === 429) {
        throw new Error(TOO_MANY_REQUESTS_MESSAGE)
      }

      return response
    }

    return response
  }
}
