import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom has no WebGL: replace only the GPU-facing classes, keep the rest of three.js real.
const gpu = vi.hoisted(() => ({
  composerThrows: false,
  rendererDispose: vi.fn(),
  passes: [] as unknown[],
}))
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
    addPass(pass: unknown) {
      gpu.passes.push(pass)
    }
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

// A model with just the two floor groups the scene requires.
vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const { Group } = await import('three')
  return {
    GLTFLoader: class {
      setMeshoptDecoder() {
        return this
      }
      parseAsync() {
        const scene = new Group()
        for (const name of ['LC3_Floor_1', 'LC3_Floor_2']) {
          const floor = new Group()
          floor.name = name
          scene.add(floor)
        }
        return Promise.resolve({ scene })
      }
    },
  }
})

import * as THREE from 'three'
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js'
import { CONTEXT_RESTORE_TIMEOUT, createMapScene } from '../createMapScene'
import type { FoundRoute } from '../../../types/route'

beforeEach(() => {
  gpu.composerThrows = false
  gpu.passes = []
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

  it('skips ambient occlusion on touch screens, where it exhausts GPU memory', () => {
    const passesFor = (coarse: boolean) => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }))
      gpu.passes = []
      createMapScene(document.createElement('div'), vi.fn()).dispose()
      return gpu.passes.some((pass) => pass instanceof SSAOPass)
    }
    expect(passesFor(false)).toBe(true)
    expect(passesFor(true)).toBe(false)
  })
})

describe('createMapScene route (#145)', () => {
  const route: FoundRoute = {
    found: true,
    distance: 300,
    floors: [1, 2],
    path: [
      { nodeId: 'LC3_Junction_SM', floor: 1, x: 632, y: 484 },
      { nodeId: 'LC3_Junction_MStair', floor: 1, x: 620, y: 300 },
      { nodeId: 'LC3_stair-2', floor: 1, x: 622, y: 270 },
      { nodeId: 'LC3_F2_stair-2', floor: 2, x: 529, y: 228 },
      { nodeId: 'LC3_F2_201', floor: 2, x: 424, y: 280 },
    ],
    closuresAvoided: [],
  }

  it('draws the shown floor of the route, labels the stairs and frees the geometry when cleared', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, headers: new Headers(), body: null, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    )
    const host = document.createElement('div')
    const map = createMapScene(host, vi.fn())
    await map.ready
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const onFloorChange = vi.fn()
    const state = { rooms: [], currentFloor: 1, selectedRoomId: null, onSelectRoom: vi.fn(), onFloorChange, route }

    map.update(state)
    const label = host.querySelector<HTMLButtonElement>('.map3d-route-floor')
    expect(label?.textContent).toBe('ขึ้นบันไดไปชั้น 2')
    label!.click() // keyboard activation (detail 0)
    expect(onFloorChange).toHaveBeenCalledWith(2)
    expect(disposeGeometry).not.toHaveBeenCalled()

    // Same route and floor again: nothing is rebuilt.
    map.update({ ...state })
    expect(disposeGeometry).not.toHaveBeenCalled()

    map.update({ ...state, route: null })
    expect(disposeGeometry.mock.contexts.some((geometry) => geometry instanceof THREE.CylinderGeometry)).toBe(true)
    expect(host.querySelector('.map3d-route-floor')).toBeNull()

    disposeGeometry.mockRestore()
    map.dispose()
  })

  async function sceneWithRoute(currentFloor: number) {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, headers: new Headers(), body: null, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    )
    const addToScene = vi.spyOn(THREE.Scene.prototype, 'add')
    const map = createMapScene(document.createElement('div'), vi.fn())
    await map.ready
    const routeGroup = addToScene.mock.calls.flat().find((object) => object.name === 'Route')!
    addToScene.mockRestore()
    map.update({ rooms: [], currentFloor, selectedRoomId: null, onSelectRoom: vi.fn(), route })
    return { map, routeGroup }
  }

  it('draws the line in from the start, then stops rendering', async () => {
    const { map, routeGroup } = await sceneWithRoute(2)
    const endMarker = routeGroup.children.at(-1)!
    expect(endMarker.visible).toBe(false)

    vi.advanceTimersByTime(1000)
    expect(routeGroup.children.every((child) => child.visible)).toBe(true)
    const frames = vi.spyOn(window, 'requestAnimationFrame')
    vi.advanceTimersByTime(500)
    expect(frames).not.toHaveBeenCalled()
    map.dispose()
  })

  it('shows the whole line at once when motion is reduced', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }))
    const { map, routeGroup } = await sceneWithRoute(2)
    expect(routeGroup.children.every((child) => child.visible)).toBe(true)
    const tube = routeGroup.children.find((child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry)!
    expect(tube.scale.z).toBeGreaterThan(1)
    map.dispose()
  })

  it('has no stairs label on the last floor of the route', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, headers: new Headers(), body: null, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    )
    const host = document.createElement('div')
    const map = createMapScene(host, vi.fn())
    await map.ready
    map.update({ rooms: [], currentFloor: 2, selectedRoomId: null, onSelectRoom: vi.fn(), route })
    expect(host.querySelector('.map3d-route-floor')).toBeNull()
    map.dispose()
  })
})
