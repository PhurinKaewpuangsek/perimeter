import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { MapContainerProps } from "./MapContainer2D";
import { ROOM_AREAS } from "./roomAreaGeometry";
import { findRoomAt, isMapTap, modelToSvg, svgToModel } from "./modelCoordinates";
import { getMarkerLabel } from "../../services/markerLayout";
import { getCategoryPinColor } from "../../services/roomDisplay";
// Vite fingerprints the file name, so the model can be cached as immutable.
import modelUrl from "../../assets/maps/lc3-campus.glb?url";

// icons: rendered category icons keyed by data-room-id (see MapContainer3D).
type MapState = Omit<MapContainerProps, "onFloorChange"> & {
  icons?: HTMLElement | null;
};
export const CONTEXT_RESTORE_TIMEOUT = 3000;
export interface MapScene {
  ready: Promise<void>;
  update: (state: MapState) => void;
  reset: () => void;
  zoom: (factor: number) => void;
  dispose: () => void;
}

function disposeModel(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      materials.add(material);
  });
  materials.forEach((material) => material.dispose());
}

export function createMapScene(
  host: HTMLDivElement,
  onUnavailable: () => void,
  onProgress?: (fraction: number) => void,
): MapScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "low-power",
  });
  try {
    return buildMapScene(host, onUnavailable, renderer, onProgress);
  } catch (error) {
    // Anything after the renderer exists may throw; release its GPU context
    // and canvas before rethrowing.
    host.querySelector(".map3d-labels")?.remove();
    renderer.domElement.remove();
    renderer.dispose();
    throw error;
  }
}

function buildMapScene(
  host: HTMLDivElement,
  onUnavailable: () => void,
  renderer: THREE.WebGLRenderer,
  onProgress?: (fraction: number) => void,
): MapScene {
  // Phone GPUs run out of memory with full-resolution AO and a 2048 shadow map,
  // and lose the WebGL context; touch devices get the lighter path.
  const lite = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 1.75),
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);
  host.tabIndex = 0;
  const labels = document.createElement("div");
  labels.className = "map3d-labels";
  host.append(labels);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#edf2ee");
  scene.add(new THREE.HemisphereLight("#ffffff", "#b4bca6", 1.8));
  const sunlight = new THREE.DirectionalLight("#fff6e6", 3);
  sunlight.position.set(-18, 55, 32);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.setScalar(lite ? 1024 : 2048);
  Object.assign(sunlight.shadow.camera, {
    left: -44,
    right: 44,
    top: 38,
    bottom: -38,
    near: 1,
    far: 150,
  });
  sunlight.shadow.normalBias = 0.025;
  sunlight.shadow.bias = -0.0001;
  scene.add(sunlight);
  const camera = new THREE.OrthographicCamera(-40, 40, 30, -30, 0.1, 1000);
  // Multisampled beauty pass keeps thin rails clean; local AO separates the
  // walls, floor and step edges without textures painted onto the model.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  const beautyPass = new RenderPass(scene, camera);
  const contactPass = new SSAOPass(scene, camera, 1, 1, 16);
  contactPass.ssaoMaterial.defines.PERSPECTIVE_CAMERA = 0;
  contactPass.depthRenderMaterial.defines.PERSPECTIVE_CAMERA = 0;
  contactPass.kernelRadius = 0.6;
  contactPass.minDistance = 0.00004;
  contactPass.maxDistance = 0.0015;
  const outputPass = new OutputPass();
  composer.addPass(beautyPass);
  if (!lite) composer.addPass(contactPass);
  composer.addPass(outputPass);
  const controls = new OrbitControls(camera, host);
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI / 2.4;
  controls.minZoom = 0.35;
  controls.maxZoom = 7;
  controls.enableDamping = false;
  controls.listenToKeyEvents(host);
  // Render only on interaction/resize/data changes. Camera moves are immediate
  // and damping is off, so prefers-reduced-motion needs no separate code path:
  // there is no automatic animation or perpetual render loop to disable.
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const UP_AXIS = new THREE.Vector3(0, 1, 0);
  let disposed = false;
  let contextLost = false;
  let lostTimer = 0;
  let frame = 0;
  let isDrawing = false;
  let root: THREE.Group | undefined;
  let state: MapState | undefined;
  let floorMesh: THREE.Object3D | undefined;
  let focusKey = "";
  let demoStarted = false;
  let demoStopped = false;
  let idleOrbiting = false;
  let flyInStart = 0;
  let lastOrbitTime = 0;
  let glide:
    | {
        startTime: number;
        duration: number;
        fromTarget: THREE.Vector3;
        toTarget: THREE.Vector3;
        fromPos: THREE.Vector3;
        toPos: THREE.Vector3;
        fromZoom: number;
        toZoom: number;
      }
    | undefined;
  let markers: {
    button: HTMLButtonElement;
    point: THREE.Vector3;
    selected: boolean;
  }[] = [];
  const highlight = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: "#ef4444",
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  highlight.rotation.x = -Math.PI / 2;
  highlight.visible = false;
  scene.add(highlight);

  function stopIdleDemo() {
    if (!demoStopped) {
      demoStopped = true;
      idleOrbiting = false;
      flyInStart = 0;
      lastOrbitTime = 0;
    }
  }

  function startCameraGlide(
    toTarget: THREE.Vector3,
    toPos: THREE.Vector3,
    toZoom: number,
  ) {
    if (reduceMotion) {
      glide = undefined;
      controls.target.copy(toTarget);
      camera.position.copy(toPos);
      camera.zoom = toZoom;
      camera.updateProjectionMatrix();
      controls.update();
      invalidate();
      return;
    }
    glide = {
      startTime: performance.now(),
      duration: 550,
      fromTarget: controls.target.clone(),
      toTarget: toTarget.clone(),
      fromPos: camera.position.clone(),
      toPos: toPos.clone(),
      fromZoom: camera.zoom,
      toZoom,
    };
    invalidate();
  }

  function maybeStartIdleDemo() {
    if (
      demoStarted ||
      demoStopped ||
      reduceMotion ||
      !root ||
      !state?.idleOrbit ||
      state.demoInterrupted ||
      state.selectedRoomId
    )
      return;
    demoStarted = true;
    idleOrbiting = true;
    const now = performance.now();
    flyInStart = now;
    lastOrbitTime = now;
    const baseZoom = state.initialScale ?? 1;
    camera.zoom = baseZoom * 0.72;
    camera.updateProjectionMatrix();
    invalidate();
  }

  function draw(now = performance.now()) {
    frame = 0;
    if (disposed || contextLost) return;
    isDrawing = true;
    if (idleOrbiting && state?.idleOrbit && !demoStopped) {
      const dt = lastOrbitTime ? Math.min(64, Math.max(1, now - lastOrbitTime)) : 16.67;
      lastOrbitTime = now;
      if (flyInStart > 0) {
        const t = Math.min(1, (now - flyInStart) / 1100);
        const eased = 1 - Math.pow(1 - t, 3);
        const baseZoom = state.initialScale ?? 1;
        camera.zoom = THREE.MathUtils.lerp(baseZoom * 0.72, baseZoom, eased);
        if (t >= 1) flyInStart = 0;
      }
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(
        UP_AXIS,
        THREE.MathUtils.degToRad(0.05) * (dt / 16.67),
      );
      camera.position.copy(controls.target).add(offset);
      camera.updateProjectionMatrix();
      controls.update();
    } else if (glide) {
      const t = Math.min(1, Math.max(0, (now - glide.startTime) / glide.duration));
      const eased = 1 - Math.pow(1 - t, 3);
      controls.target.lerpVectors(glide.fromTarget, glide.toTarget, eased);
      camera.position.lerpVectors(glide.fromPos, glide.toPos, eased);
      camera.zoom = THREE.MathUtils.lerp(glide.fromZoom, glide.toZoom, eased);
      camera.updateProjectionMatrix();
      controls.update();
      if (t >= 1) glide = undefined;
    }
    isDrawing = false;

    contactPass.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(
      camera.projectionMatrix,
    );
    contactPass.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
      camera.projectionMatrixInverse,
    );
    composer.render();
    const width = host.clientWidth,
      height = host.clientHeight;
    const occupied: { x: number; y: number; width: number }[] = [];
    for (const marker of markers) {
      const screen = marker.point.clone().project(camera);
      const x = ((screen.x + 1) * width) / 2,
        y = ((1 - screen.y) * height) / 2;
      const visible =
        screen.z > -1 &&
        screen.z < 1 &&
        x > 0 &&
        x < width &&
        y > 0 &&
        y < height;
      marker.button.hidden = !visible;
      if (!visible) continue;
      const labelWidth = Math.min(
        160,
        (marker.button.textContent?.length ?? 0) * 7 + 34,
      );
      const crowded = occupied.some(
        (p) =>
          Math.abs(p.x - x) < (p.width + labelWidth) / 2 + 4 &&
          Math.abs(p.y - y) < 23,
      );
      marker.button.dataset.compact = String(!marker.selected && crowded);
      if (!crowded || marker.selected)
        occupied.push({ x, y, width: labelWidth });
      marker.button.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    }
    if (!disposed && !contextLost && (idleOrbiting || glide)) {
      frame = requestAnimationFrame(draw);
    }
  }
  function invalidate() {
    if (!disposed && !frame && !isDrawing) frame = requestAnimationFrame(draw);
  }
  controls.addEventListener("change", () => {
    if (!isDrawing) glide = undefined;
    invalidate();
  });

  function resize() {
    const width = Math.max(1, host.clientWidth),
      height = Math.max(1, host.clientHeight);
    const sidebar =
      width >= 640
        ? (state?.sidebarWidth ?? (state?.mode === "admin" ? 460 : 400))
        : 0;
    const span = Math.max(42, (72 * height) / Math.max(280, width - sidebar));
    camera.left = (-span * width) / height / 2;
    camera.right = -camera.left;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.setViewOffset(
      width,
      height,
      -sidebar / 2,
      width < 640 && state?.isDetailOpen ? height * 0.22 : 0,
      width,
      height,
    );
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    invalidate();
  }
  function getDefaultCameraPose() {
    const y = state?.currentFloor === 2 ? 3.2 : 0;
    const target = new THREE.Vector3(0, y, -3);
    const pos = new THREE.Vector3(-28, 48, 49).multiplyScalar(8).add(target);
    const zoom = state?.initialScale ?? 1;
    return { target, pos, zoom };
  }
  function reset(smooth = false) {
    const { target, pos, zoom } = getDefaultCameraPose();
    if (smooth && state?.idleOrbit && !reduceMotion) {
      stopIdleDemo();
      startCameraGlide(target, pos, zoom);
      return;
    }
    glide = undefined;
    controls.target.copy(target);
    // Orthographic zoom does not move the camera. Keep it outside the campus
    // bounds so zooming out cannot slice nearby buildings with the near plane.
    // Distance changes preserve the framing and orbit angle in this projection.
    camera.position.copy(pos);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
  }
  reset();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  let pointerStart = { x: 0, y: 0 };
  let moved = false;
  let multiTouch = false;
  let pointerRoom: string | undefined;
  const pointers = new Set<number>();
  function pointerDown(event: PointerEvent) {
    stopIdleDemo();
    glide = undefined;
    pointers.add(event.pointerId);
    if (pointers.size === 1) {
      pointerStart = { x: event.clientX, y: event.clientY };
      moved = false;
      multiTouch = false;
      pointerRoom =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>("[data-room-id]")?.dataset
              .roomId
          : undefined;
    } else multiTouch = true;
  }
  function pointerMove(event: PointerEvent) {
    if (
      pointers.size &&
      !isMapTap(pointerStart, { x: event.clientX, y: event.clientY })
    )
      moved = true;
  }
  function pointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (
      event.button !== 0 ||
      pointers.size ||
      moved ||
      !isMapTap(
        pointerStart,
        { x: event.clientX, y: event.clientY },
        multiTouch,
      )
    )
      return;
    // OrbitControls captures pointers on the host, so click's target can no
    // longer be the original room button. Retain the down target for a tap.
    if (pointerRoom) state?.onSelectRoom(pointerRoom);
    else pick(event);
  }
  function pointerCancel(event: PointerEvent) {
    moved = true;
    pointers.delete(event.pointerId);
  }
  function pick(event: MouseEvent) {
    if (!state || !floorMesh) return;
    const rect = host.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = ray.intersectObject(floorMesh, true)[0];
    if (hit) {
      const room = findRoomAt(
        state.rooms,
        state.currentFloor,
        modelToSvg(state.currentFloor, hit.point),
      );
      if (room) {
        state.onSelectRoom(room.id);
        return;
      }
    }
    state.onClearSelection?.();
  }
  // preventDefault lets the browser restore the context; three.js re-uploads
  // GPU resources on restore. Fall back to 2D only if it does not come back.
  function handleContextLost(event: Event) {
    event.preventDefault();
    contextLost = true;
    lostTimer = window.setTimeout(() => {
      if (!disposed) onUnavailable();
    }, CONTEXT_RESTORE_TIMEOUT);
  }
  function handleContextRestored() {
    contextLost = false;
    clearTimeout(lostTimer);
    renderer.shadowMap.needsUpdate = true;
    resize();
  }
  function interruptOnInput() {
    stopIdleDemo();
    glide = undefined;
  }
  host.addEventListener("pointerdown", pointerDown, true);
  host.addEventListener("pointermove", pointerMove, true);
  host.addEventListener("pointerup", pointerUp, true);
  host.addEventListener("pointercancel", pointerCancel, true);
  host.addEventListener("wheel", interruptOnInput, { capture: true, passive: true });
  host.addEventListener("keydown", interruptOnInput, true);
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  renderer.domElement.addEventListener(
    "webglcontextrestored",
    handleContextRestored,
  );

  const abort = new AbortController();
  const ready = fetch(modelUrl, { signal: abort.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error("Model unavailable");
      // The stream yields decoded bytes; a gzipped upload carries its decoded
      // size as S3 metadata because content-length is the compressed size.
      const total = Number(
        response.headers.get("x-amz-meta-decoded-length") ||
          response.headers.get("content-length"),
      );
      if (!onProgress || !total || !response.body)
        return response.arrayBuffer();
      // The model takes a while on mobile data; report bytes as they arrive.
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      const reader = response.body.getReader();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onProgress(Math.min(1, received / total));
      }
      return new Blob(chunks).arrayBuffer();
    })
    // The GLB embeds all buffers and has no textures, so no resource path.
    .then((data) =>
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, ""),
    )
    .then((gltf) => {
      if (disposed) {
        disposeModel(gltf.scene);
        return;
      }
      root = gltf.scene;
      // Blender appends .001/.002 to duplicate object names. Exported `part`
      // metadata is the stable identity shared by all model revisions.
      root.traverse((object) => {
        if (typeof object.userData.part === "string")
          object.name = object.userData.part;
        if (object instanceof THREE.Mesh) {
          // glTF splits material primitives into child meshes; part metadata
          // belongs to their parent group.
          let partRoot: THREE.Object3D | null = object;
          while (partRoot && !partRoot.userData.part)
            partRoot = partRoot.parent;
          const part = partRoot?.userData.part;
          object.castShadow =
            part !== "Surrounding_Buildings" && part !== "Site_Ground";
          object.receiveShadow = true;
          // The export uses double-sided materials. Cast with back faces to
          // avoid self-shadow stripes across otherwise flat walls.
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.shadowSide = THREE.BackSide;
        }
      });
      if (
        !root.getObjectByName("LC3_Floor_1") ||
        !root.getObjectByName("LC3_Floor_2")
      ) {
        disposeModel(root);
        root = undefined;
        throw new Error("Missing model floor groups");
      }
      scene.add(root);
      renderer.shadowMap.needsUpdate = true;
      maybeStartIdleDemo();
      invalidate();
    });

  function update(next: MapState) {
    state = next;
    if (next.demoInterrupted || next.selectedRoomId) {
      stopIdleDemo();
    }
    if (!root || disposed) return;
    root.getObjectByName("LC3_Floor_2")!.visible = state.currentFloor === 2;
    renderer.shadowMap.needsUpdate = true;
    floorMesh = root.getObjectByName(`LC3_Floor_${state.currentFloor}`);
    // Rebuilding markers drops keyboard focus; restore it on the same room.
    const focusedRoom = labels.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.roomId
      : undefined;
    labels.replaceChildren();
    markers = [];
    const rooms = state.rooms.filter(
      (room) => room.floor === state?.currentFloor,
    );
    // Selected marker has priority when resolving label overlap.
    rooms.sort(
      (a, b) =>
        Number(b.id === next.selectedRoomId) -
        Number(a.id === next.selectedRoomId),
    );
    const icons = new Map<string, Element>();
    for (const holder of state.icons?.querySelectorAll<HTMLElement>(
      "[data-room-id]",
    ) ?? []) {
      const svg = holder.querySelector("svg");
      if (svg) icons.set(holder.dataset.roomId!, svg);
    }
    for (const room of rooms) {
      const point = svgToModel(room.floor, room.coordinates, 1.15);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map3d-marker";
      button.style.setProperty("--pin", getCategoryPinColor(room.category));
      const icon = icons.get(room.id);
      if (icon) {
        const disc = document.createElement("span");
        disc.className = "map3d-icon";
        disc.append(icon.cloneNode(true));
        button.append(disc);
      }
      button.append(getMarkerLabel(room));
      button.setAttribute(
        "aria-label",
        `${room.code || room.nameThai} ${room.nameThai}`.trim(),
      );
      button.setAttribute(
        "aria-pressed",
        String(room.id === state.selectedRoomId),
      );
      button.dataset.roomId = room.id;
      button.title = room.nameThai;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.detail === 0) state?.onSelectRoom(room.id);
      });
      labels.append(button);
      if (room.id === focusedRoom) button.focus({ preventScroll: true });
      markers.push({
        button,
        point: new THREE.Vector3(point.x, point.y, point.z),
        selected: room.id === state.selectedRoomId,
      });
    }
    const selected = rooms.find((room) => room.id === state?.selectedRoomId);
    const area = selected && ROOM_AREAS[selected.id];
    highlight.visible = Boolean(area);
    if (area) {
      const a = svgToModel(area.floor, { x: area.x, y: area.y });
      const b = svgToModel(area.floor, {
        x: area.x + area.width,
        y: area.y + area.height,
      });
      highlight.position.set((a.x + b.x) / 2, a.y, (a.z + b.z) / 2);
      highlight.scale.set(b.x - a.x, b.z - a.z, 1);
    }
    const isInitialFocus = focusKey === "";
    const nextFocus = `${state.currentFloor}:${selected?.id ?? ""}`;
    if (focusKey !== nextFocus) {
      if (selected) {
        stopIdleDemo();
        const point = svgToModel(selected.floor, selected.coordinates);
        const target = new THREE.Vector3(point.x, point.y, point.z);
        const toPos = camera.position
          .clone()
          .add(target.clone().sub(controls.target));
        if (isInitialFocus) {
          camera.position.copy(toPos);
          controls.target.copy(target);
          camera.zoom = 2.2;
          camera.updateProjectionMatrix();
          controls.update();
        } else {
          startCameraGlide(target, toPos, 2.2);
        }
      } else {
        reset(!isInitialFocus);
      }
      focusKey = nextFocus;
    }
    maybeStartIdleDemo();
    resize();
  }
  return {
    ready,
    update,
    reset: () => reset(true),
    zoom(factor) {
      stopIdleDemo();
      glide = undefined;
      camera.zoom = THREE.MathUtils.clamp(
        camera.zoom * factor,
        controls.minZoom,
        controls.maxZoom,
      );
      camera.updateProjectionMatrix();
      invalidate();
    },
    dispose() {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      host.removeEventListener("pointerdown", pointerDown, true);
      host.removeEventListener("pointermove", pointerMove, true);
      host.removeEventListener("pointerup", pointerUp, true);
      host.removeEventListener("pointercancel", pointerCancel, true);
      host.removeEventListener("wheel", interruptOnInput, true);
      host.removeEventListener("keydown", interruptOnInput, true);
      clearTimeout(lostTimer);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost,
      );
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
      );
      if (root) disposeModel(root);
      highlight.geometry.dispose();
      highlight.material.dispose();
      beautyPass.dispose();
      contactPass.dispose();
      outputPass.dispose();
      composer.dispose();
      sunlight.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.remove();
    },
  };
}
