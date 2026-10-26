import { describe, it } from 'node:test'
import assert from 'node:assert'
import { fetchWithRetry } from '../apiClient.ts'

describe('apiClient - fetchWithRetry()', () => {
  it('returns response immediately on successful 200 response', async () => {
    let callCount = 0
    const mockFetch = async () => {
      callCount++
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    const response = await fetchWithRetry('https://api.example.com/test', {}, {
      fetchFn: mockFetch as typeof fetch,
    })

    assert.strictEqual(response.status, 200)
    assert.strictEqual(callCount, 1)
  })

  it('retries on 429 and returns response if a subsequent attempt succeeds', async () => {
    let callCount = 0
    const delays: number[] = []
    const mockSleep = async (ms: number) => {
      delays.push(ms)
    }

    const mockFetch = async () => {
      callCount++
      if (callCount < 3) {
        return new Response('Too Many Requests', { status: 429 })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    const response = await fetchWithRetry('https://api.example.com/test', {}, {
      maxRetries: 3,
      initialDelayMs: 100,
      backoffFactor: 2,
      jitter: false,
      sleep: mockSleep,
      fetchFn: mockFetch as typeof fetch,
    })

    assert.strictEqual(response.status, 200)
    assert.strictEqual(callCount, 3)
    assert.deepStrictEqual(delays, [100, 200])
  })

  it('retries on 503 and returns response if subsequent attempt succeeds', async () => {
    let callCount = 0
    const mockSleep = async () => {}

    const mockFetch = async () => {
      callCount++
      if (callCount === 1) {
        return new Response('Service Unavailable', { status: 503 })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    const response = await fetchWithRetry('https://api.example.com/test', {}, {
      maxRetries: 2,
      sleep: mockSleep,
      fetchFn: mockFetch as typeof fetch,
    })

    assert.strictEqual(response.status, 200)
    assert.strictEqual(callCount, 2)
  })

  it('throws friendly Thai message "ระบบกำลังคนใช้งานมาก ลองใหม่" when 429 persists after maxRetries', async () => {
    let callCount = 0
    const mockSleep = async () => {}

    const mockFetch = async () => {
      callCount++
      return new Response('Too Many Requests', { status: 429, statusText: 'Too Many Requests' })
    }

    await assert.rejects(
      async () => {
        await fetchWithRetry('https://api.example.com/test', {}, {
          maxRetries: 2,
          sleep: mockSleep,
          fetchFn: mockFetch as typeof fetch,
        })
      },
      (err: Error) => {
        assert.match(err.message, /ระบบกำลังคนใช้งานมาก ลองใหม่/)
        return true
      }
    )
    assert.strictEqual(callCount, 3) // Initial + 2 retries
  })

  it('retries on 500 and returns response after maxRetries are exhausted', async () => {
    let callCount = 0
    const mockSleep = async () => {}

    const mockFetch = async () => {
      callCount++
      return new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })
    }

    const res = await fetchWithRetry('https://api.example.com/test', {}, {
      maxRetries: 2,
      sleep: mockSleep,
      fetchFn: mockFetch as typeof fetch,
    })

    assert.strictEqual(res.status, 500)
    assert.strictEqual(callCount, 3) // 1 initial + 2 retries
  })

  it('does not retry 400 Bad Request or 404 Not Found', async () => {
    let callCount = 0
    const mockFetch = async () => {
      callCount++
      return new Response('Not Found', { status: 404 })
    }

    const response = await fetchWithRetry('https://api.example.com/test', {}, {
      maxRetries: 3,
      fetchFn: mockFetch as typeof fetch,
    })

    assert.strictEqual(response.status, 404)
    assert.strictEqual(callCount, 1)
  })

  it('applies jitter within range when jitter is enabled', async () => {
    const delays: number[] = []
    const mockSleep = async (ms: number) => {
      delays.push(ms)
    }

    const mockFetch = async () => new Response('Too Many Requests', { status: 429 })

    await assert.rejects(async () => {
      await fetchWithRetry('https://api.example.com/test', {}, {
        maxRetries: 1,
        initialDelayMs: 1000,
        jitter: true,
        sleep: mockSleep,
        fetchFn: mockFetch as typeof fetch,
      })
    })

    assert.strictEqual(delays.length, 1)
    // Delay with jitter should be between 0.5 * 1000 and 1.0 * 1000 (i.e. 500 to 1000)
    assert.ok(delays[0] >= 500 && delays[0] <= 1000, `Expected delay ${delays[0]} to be between 500 and 1000`)
  })
})
