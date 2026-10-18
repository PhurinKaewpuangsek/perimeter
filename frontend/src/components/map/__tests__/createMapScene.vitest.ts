import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom has no WebGL: replace only the GPU-facing classes, keep the rest of three.js real.
const gpu = vi.hoisted(() => ({ composerThrows: false, rendererDispose: vi.fn() }))
vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>()
  class FakeRenderer {
    domElement = document.createElement('canvas')
    shadowMap = { enabled: false, type: 0, autoUpdate: true, needsUpdate: false }
    outputColorSpace = ''
    toneMapping = 0
    toneMappingExposure = 1
    setPixelRatio() {}
    setSize() {}
    dispose = gpu.rendererDispose
  }
  return { ...three, WebGLRenderer: FakeRenderer }
})
vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    constructor() {
      if (gpu.composerThrows) throw new Error('render target allocation failed')
    }
    addPass() {}
    setSize() {}
    render() {}
    dispose() {}
  },
}))
vi.mock('three/addons/postprocessing/RenderPass.js', () => ({
  RenderPass: class {
    dispose() {}
  },
}))
vi.mock('three/addons/postprocessing/OutputPass.js', () => ({
  OutputPass: class {
    dispose() {}
  },
}))
vi.mock('three/addons/postprocessing/SSAOPass.js', async () => {
  const { Matrix4 } = await import('three')
  return {
    SSAOPass: class {
      ssaoMaterial = {
        defines: {},
        uniforms: {
          cameraProjectionMatrix: { value: new Matrix4() },
          cameraInverseProjectionMatrix: { value: new Matrix4() },
        },
      }
      depthRenderMaterial = { defines: {} }
      dispose() {}
    },
  }
})
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { Vector3 } = await import('three')
  return {
    OrbitControls: class {
      target = new Vector3()
      mouseButtons = {}
      listenToKeyEvents() {}
      addEventListener() {}
      update() {}
      dispose() {}
    },
  }
})

import { CONTEXT_RESTORE_TIMEOUT, createMapScene } from '../createMapScene'

beforeEach(() => {
  gpu.composerThrows = false
  vi.useFakeTimers()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  // Model never loads; these tests only cover the renderer lifecycle.
  vi.stubGlobal('fetch', () => new Promise(() => {}))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('createMapScene lifecycle', () => {
  it('releases the renderer and DOM it added when setup fails partway', () => {
    gpu.composerThrows = true
    const host = document.createElement('div')
    expect(() => createMapScene(host, vi.fn())).toThrow('render target allocation failed')
    expect(gpu.rendererDispose).toHaveBeenCalledOnce()
    expect(host.children).toHaveLength(0)
  })

  it('keeps 3D when a lost WebGL context is restored in time', () => {
    const host = document.createElement('div')
    const onUnavailable = vi.fn()
    const map = createMapScene(host, onUnavailable)
    const canvas = host.querySelector('canvas')!
    const lost = new Event('webglcontextlost', { cancelable: true })
    canvas.dispatchEvent(lost)
    expect(lost.defaultPrevented).toBe(true)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    vi.advanceTimersByTime(CONTEXT_RESTORE_TIMEOUT)
    expect(onUnavailable).not.toHaveBeenCalled()
    map.dispose()
  })

  it('falls back when the context is not restored', () => {
    const host = document.createElement('div')
    const onUnavailable = vi.fn()
    const map = createMapScene(host, onUnavailable)
    host.querySelector('canvas')!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    vi.advanceTimersByTime(CONTEXT_RESTORE_TIMEOUT - 1)
    expect(onUnavailable).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onUnavailable).toHaveBeenCalledOnce()
    map.dispose()
  })

  it('does not fall back after disposal while the context is lost', () => {
    const host = document.createElement('div')
    const onUnavailable = vi.fn()
    const map = createMapScene(host, onUnavailable)
    host.querySelector('canvas')!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    map.dispose()
    vi.advanceTimersByTime(CONTEXT_RESTORE_TIMEOUT)
    expect(onUnavailable).not.toHaveBeenCalled()
  })
})
