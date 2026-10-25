import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { Graph } from '../../types/graph'

const getGraphMock = vi.hoisted(() => vi.fn<() => Promise<Graph>>())
vi.mock('../../services/graphService.ts', () => ({ getGraph: getGraphMock }))

import { useGraph } from '../useGraph'

const graph = (closed: boolean): Graph => ({
  graphId: 'LC3',
  nodes: [{ elementId: 'NODE#LC3_101', nodeId: 'LC3_101', floor: 1, x: 0, y: 0, nodeType: 'room', closed }],
  edges: [],
})

describe('useGraph', () => {
  beforeEach(() => getGraphMock.mockReset())

  it('loads the graph', async () => {
    getGraphMock.mockResolvedValueOnce(graph(false))
    const { result } = renderHook(() => useGraph())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.graph?.nodes[0].closed).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('shows the error when the first load fails', async () => {
    getGraphMock.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useGraph())
    await waitFor(() => expect(result.current.error?.message).toBe('network'))
    expect(result.current.graph).toBeNull()
  })

  it('reload() resolves with the new closures in state', async () => {
    getGraphMock.mockResolvedValueOnce(graph(false)).mockResolvedValueOnce(graph(true))
    const { result } = renderHook(() => useGraph())
    await waitFor(() => expect(result.current.graph).not.toBeNull())
    await act(() => result.current.reload())
    expect(result.current.graph?.nodes[0].closed).toBe(true)
  })

  it('a failed reload rejects but keeps the last good graph and no error', async () => {
    getGraphMock.mockResolvedValueOnce(graph(false)).mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useGraph())
    await waitFor(() => expect(result.current.graph).not.toBeNull())
    await act(async () => {
      await expect(result.current.reload()).rejects.toThrow('network')
    })
    expect(result.current.graph?.nodes[0].closed).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
