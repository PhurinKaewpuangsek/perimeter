import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getGraph, isClosedAt, isClosureCurrentOrUpcoming, normalizeEdge, normalizeNode } from '../graphService'

const RAW_NODE = {
  graph_id: 'LC3',
  element_id: 'NODE#LC3_101',
  node_id: 'LC3_101',
  floor: 1,
  x: 543,
  y: 230,
  node_type: 'room',
  location_id: 'LC3-F1-R101',
}
const RAW_EDGE = {
  graph_id: 'LC3',
  element_id: 'EDGE#LC3_124/2|LC3_124/1',
  from: 'LC3_124/2',
  to: 'LC3_124/1',
  edge_type: 'walk',
  distance: 67,
  closed: true,
  closed_from: '2026-10-29T08:00:00+07:00',
  closed_until: '2026-10-29T12:00:00+07:00',
  closed_reason: 'ซ่อมพื้น',
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status < 300, status, statusText: 'x', json: () => Promise.resolve(body) }),
  )
}

describe('normalize', () => {
  it('maps a node and leaves an open node unclosed', () => {
    expect(normalizeNode(RAW_NODE)).toEqual({
      elementId: 'NODE#LC3_101',
      nodeId: 'LC3_101',
      floor: 1,
      x: 543,
      y: 230,
      nodeType: 'room',
      locationId: 'LC3-F1-R101',
      closed: false,
    })
  })

  it('maps an edge with its closure', () => {
    expect(normalizeEdge(RAW_EDGE)).toEqual({
      elementId: 'EDGE#LC3_124/2|LC3_124/1',
      from: 'LC3_124/2',
      to: 'LC3_124/1',
      edgeType: 'walk',
      distance: 67,
      closed: true,
      closedFrom: '2026-10-29T08:00:00+07:00',
      closedUntil: '2026-10-29T12:00:00+07:00',
      closedReason: 'ซ่อมพื้น',
    })
  })
})

describe('getGraph', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('reads nodes and edges', async () => {
    mockFetch(200, { graph_id: 'LC3', nodes: [RAW_NODE], edges: [RAW_EDGE] })
    const graph = await getGraph()
    expect(graph.graphId).toBe('LC3')
    expect(graph.nodes).toHaveLength(1)
    expect(graph.edges[0].closed).toBe(true)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/\/api\/graph$/)
  })

  it('throws on HTTP error and on a malformed body', async () => {
    mockFetch(500, {})
    await expect(getGraph()).rejects.toThrow(/Failed to fetch graph: 500/)
    mockFetch(200, { nodes: [] })
    await expect(getGraph()).rejects.toThrow(/Invalid graph data/)
  })
})

describe('isClosedAt (same rule as get-route isElementClosed)', () => {
  const window = { closed: true, closedFrom: '2026-10-29T08:00:00+07:00', closedUntil: '2026-10-29T12:00:00+07:00' }

  it('is closed only inside the window, bounds included', () => {
    expect(isClosedAt(window, new Date('2026-10-29T07:59:00+07:00'))).toBe(false)
    expect(isClosedAt(window, new Date('2026-10-29T08:00:00+07:00'))).toBe(true)
    expect(isClosedAt(window, new Date('2026-10-29T12:00:00+07:00'))).toBe(true)
    expect(isClosedAt(window, new Date('2026-10-29T12:01:00+07:00'))).toBe(false)
  })

  it('treats a missing bound as open-ended and closed:false as open', () => {
    expect(isClosedAt({ closed: true }, new Date())).toBe(true)
    expect(isClosedAt({ closed: true, closedUntil: '2026-10-29T12:00:00+07:00' }, new Date('2020-01-01'))).toBe(true)
    expect(isClosedAt({ closed: false, closedFrom: '2000-01-01T00:00:00Z' }, new Date())).toBe(false)
  })
})

describe('isClosureCurrentOrUpcoming', () => {
  const at = new Date('2026-10-29T10:00:00+07:00')
  it('lists active and future closures but not ended ones', () => {
    expect(isClosureCurrentOrUpcoming({ closed: true, closedUntil: '2026-10-29T12:00:00+07:00' }, at)).toBe(true)
    expect(isClosureCurrentOrUpcoming({ closed: true, closedFrom: '2026-11-01T08:00:00+07:00' }, at)).toBe(true)
    expect(isClosureCurrentOrUpcoming({ closed: true }, at)).toBe(true)
    expect(isClosureCurrentOrUpcoming({ closed: true, closedUntil: '2026-10-29T09:00:00+07:00' }, at)).toBe(false)
    expect(isClosureCurrentOrUpcoming({ closed: false }, at)).toBe(false)
  })
})
