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
import {
  CLOSED_MARKER_STATUS,
  CLOSED_PIN_COLOR,
  getMarkerText,
} from "../../services/markerLayout";
import { getCategoryPinColor } from "../../services/roomDisplay";
import {
  getFloorChangeLabel,
  getRouteKey,
  isRoomInRouteCorridor,
  splitRouteByFloor,
} from "../../services/routeDisplay";
// Vite fingerprints the file name, so the model can be cached as immutable.
import modelUrl from "../../assets/maps/lc3-campus.glb?url";

// icons: rendered category icons keyed by data-room-id (see MapContainer3D).
// onFloorChange: the route's "ขึ้นบันไดไปชั้น N" label switches floors.
type MapState = Omit<MapContainerProps, "onFloorChange"> & {
  icons?: HTMLElement | null;
  onFloorChange?: (floor: number) => void;
};
// Route tube height above the floor, just over the selected-room highlight (0.49).
const ROUTE_HEIGHT = 0.62;
// Route draw-in length; matches the 2D .animate-route-draw in index.css.
const ROUTE_DRAW_MS = 800;
export const CONTEXT_RESTORE_TIMEOUT = 3000;
export interface MapScene {
  ready: Promise<void>;
  update: (state: MapState) => void;
  reset: () => void;
  frameRoute?: () => void;
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
  // Route: rebuilt only when the route or floor changes. Geometries are per build and
  // disposed on every rebuild; the two materials live as long as the scene.
  const routeGroup = new THREE.Group();
  routeGroup.name = "Route";
  scene.add(routeGroup);
  const routeLineMaterial = new THREE.MeshBasicMaterial({ color: "#000000" });
  const routeCapMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff" });

  let routeKey = "";
  let routeFocusKey = "";
  // The line drawing in from the start: each part shows once the line reaches `at`
  // (its distance along the route); segments also grow up to their `length`.
  let routeDraw:
    | {
        startTime: number;
        length: number;
        parts: { mesh: THREE.Mesh; at: number; length?: number }[];
      }
    | undefined;
  let routeLabels: {
    button: HTMLElement;
    point: THREE.Vector3;
  }[] = [];

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
    drawRouteIn(now);

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
    const sidebarLeft =
      width >= 640
        ? (state?.sidebarWidth ?? (state?.mode === "admin" ? 460 : 400))
        : 0;
    const occupied: { x: number; y: number; width: number }[] = [];
    for (const marker of markers) {
      const screen = marker.point.clone().project(camera);
      const x = ((screen.x + 1) * width) / 2,
        y = ((1 - screen.y) * height) / 2;
      const visible =
        screen.z > -1 &&
        screen.z < 1 &&
        x > sidebarLeft &&
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
      const occluded = occupied.some(
        (p) =>
          Math.abs(p.x - x) < p.width / 2 + 2 &&
          Math.abs(p.y - y) < 16,
      );
      if (!marker.selected && occluded) {
        marker.button.hidden = true;
        continue;
      }
      marker.button.dataset.compact = String(!marker.selected && crowded);
      if (!crowded || marker.selected)
        occupied.push({ x, y, width: labelWidth });
      marker.button.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    }
    for (const label of routeLabels) {
      const screen = label.point.clone().project(camera);
      const x = ((screen.x + 1) * width) / 2,
        y = ((1 - screen.y) * height) / 2;
      // Stairs labels wait until the line has drawn in to them.
      label.button.hidden = !(
        !routeDraw &&
        screen.z > -1 &&
        screen.z < 1 &&
        x > sidebarLeft &&
        x < width &&
        y > 0 &&
        y < height
      );
      label.button.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    }
    if (!disposed && !contextLost && (idleOrbiting || glide || routeDraw)) {
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
    // Phones: lift the view above the bottom sheets (room detail sheet or navigation sheet)
    const phoneOffset =
      width >= 640
        ? 0
        : state?.isDetailOpen || state?.route
          ? height * 0.22
          : 0;
    camera.setViewOffset(
      width,
      height,
      -sidebar / 2,
      phoneOffset,
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
    if (state?.route) {
      stopIdleDemo();
      frameRoute(state);
      return;
    }
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
  let pointerRouteFloor: string | undefined;
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
      pointerRouteFloor =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>("[data-route-floor]")
              ?.dataset.routeFloor
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
    if (pointerRouteFloor) state?.onFloorChange?.(Number(pointerRouteFloor));
    else if (pointerRoom) state?.onSelectRoom(pointerRoom);
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

  function clearRoute() {
    routeDraw = undefined;
    const geometries = new Set<THREE.BufferGeometry>();
    routeGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    routeGroup.clear();
  }
  function routePoint(point: { floor: number; x: number; y: number }) {
    const model = svgToModel(point.floor, point, ROUTE_HEIGHT);
    return new THREE.Vector3(model.x, model.y, model.z);
  }
  // The route's part on the shown floor: round start disc, square destination box,
  // black tube with sphere joints, and "ขึ้นบันไดไปชั้น N" labels where it leaves.
  function buildRoute(next: MapState) {
    clearRoute();
    const route = next.route;
    if (!route) return;
    const radius = 0.22;
    let joint: THREE.SphereGeometry | undefined;
    // One unit-long open tube along +z from the origin, stretched to each segment's
    // length, so the draw-in can grow a segment without new geometry.
    let segment: THREE.CylinderGeometry | undefined;
    const parts: { mesh: THREE.Mesh; at: number; length?: number }[] = [];
    let distance = 0;
    for (const leg of splitRouteByFloor(route.path)) {
      if (leg.floor !== next.currentFloor) continue;
      joint ??= new THREE.SphereGeometry(radius, 12, 8);
      segment ??= new THREE.CylinderGeometry(radius, radius, 1, 8, 1, true)
        .rotateX(Math.PI / 2)
        .translate(0, 0, 0.5);
      const points = leg.points.map(routePoint);
      points.forEach((point, i) => {
        const length = i > 0 ? point.distanceTo(points[i - 1]) : 0;
        if (length >= 1e-3) {
          const tube = new THREE.Mesh(segment, routeLineMaterial);
          tube.position.copy(points[i - 1]);
          tube.lookAt(point);
          tube.scale.z = length;
          routeGroup.add(tube);
          parts.push({ mesh: tube, at: distance, length });
          distance += length;
        }
        const sphere = new THREE.Mesh(joint, routeLineMaterial);
        sphere.position.copy(point);
        routeGroup.add(sphere);
        parts.push({ mesh: sphere, at: distance });
      });
    }
    const start = route.path[0];
    if (start?.floor === next.currentFloor) {
      const at = routePoint(start);
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 0.14, 24),
        routeLineMaterial,
      );
      const dot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.16, 16),
        routeCapMaterial,
      );
      disc.position.copy(at);
      dot.position.copy(at);
      routeGroup.add(disc, dot);
    }
    const end = route.path[route.path.length - 1];
    if (route.path.length > 1 && end.floor === next.currentFloor) {
      const at = routePoint(end);
      const square = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.14, 1.1),
        routeLineMaterial,
      );
      const dot = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.16, 0.42),
        routeCapMaterial,
      );
      square.position.copy(at);
      dot.position.copy(at);
      routeGroup.add(square, dot);
      parts.push({ mesh: square, at: distance }, { mesh: dot, at: distance });
    }
    if (reduceMotion || parts.length === 0) return;
    routeDraw = { startTime: performance.now(), length: distance, parts };
    drawRouteIn(routeDraw.startTime);
    invalidate();
  }
  // Show as much of the route as has drawn in by `now`; the start disc is always shown.
  function drawRouteIn(now: number) {
    if (!routeDraw) return;
    const t = Math.min(1, Math.max(0, (now - routeDraw.startTime) / ROUTE_DRAW_MS));
    const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    const reach = t >= 1 ? Infinity : eased * routeDraw.length;
    for (const part of routeDraw.parts) {
      part.mesh.visible = reach >= part.at;
      if (part.length !== undefined)
        part.mesh.scale.z = THREE.MathUtils.clamp(reach - part.at, 1e-3, part.length);
    }
    if (t >= 1) routeDraw = undefined;
  }
  // "ขึ้นบันไดไปชั้น N" buttons where the route leaves the shown floor. They live in
  // the labels layer, which every update clears, so they are recreated each time.
  function addRouteLabels(next: MapState) {
    routeLabels = [];
    if (!next.route) return;
    const legs = splitRouteByFloor(next.route.path);
    legs.forEach((leg, index) => {
      const following = legs[index + 1];
      if (!following || leg.floor !== next.currentFloor) return;
      const stairs = svgToModel(
        leg.floor,
        leg.points[leg.points.length - 1],
        1.4,
      );
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map3d-route-floor";
      button.textContent = getFloorChangeLabel(leg.floor, following.floor);
      button.dataset.routeFloor = String(following.floor);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.detail === 0) state?.onFloorChange?.(following.floor);
      });
      labels.append(button);
      routeLabels.push({
        button,
        point: new THREE.Vector3(stairs.x, stairs.y, stairs.z),
      });
    });
  }
  // Glide to show the whole part of the route on the shown floor.
  function frameRoute(next: MapState) {
    const points = (next.route?.path ?? [])
      .filter((point) => point.floor === next.currentFloor)
      .map(routePoint);
    if (points.length === 0) return;
    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 6) * 1.75;
    const zoom = THREE.MathUtils.clamp(
      Math.min(
        (camera.right - camera.left) / span,
        (camera.top - camera.bottom) / span,
      ),
      controls.minZoom,
      2.4,
    );
    stopIdleDemo();
    startCameraGlide(
      center,
      camera.position.clone().add(center.clone().sub(controls.target)),
      zoom,
    );
  }

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
    const currentFloor = state?.currentFloor;
    const isNavigating = Boolean(state?.route);
    const originLocationId = state?.route?.path?.[0]?.locationId;
    const destLocationId = state?.route?.path?.[state.route.path.length - 1]?.locationId;
    const floorRoutePoints =
      isNavigating && state?.route && currentFloor !== undefined
        ? state.route.path.filter((p) => p.floor === currentFloor)
        : [];
    const rooms = (state?.rooms ?? []).filter((room) => {
      if (room.floor !== currentFloor) return false;
      if (isNavigating && floorRoutePoints.length > 0) {
        // While navigating (Option C: Corridor-only filter):
        // Always show destination and origin rooms
        const isDestination =
          room.id === next.selectedRoomId || (destLocationId && room.id === destLocationId);
        const isOrigin = Boolean(originLocationId && room.id === originLocationId);
        if (isDestination || isOrigin) return true;
        // Keep intermediate corridor rooms along the active walking path as reference points
        return isRoomInRouteCorridor(room, floorRoutePoints);
      }
      return true;
    });
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
      // Rooms staff closed right now (#147): grey pin and "ปิดชั่วคราว", as in 2D.
      const closed = state.closedRoomIds?.has(room.id) ?? false;
      button.style.setProperty(
        "--pin",
        closed ? CLOSED_PIN_COLOR : getCategoryPinColor(room.category),
      );
      const icon = icons.get(room.id);
      if (icon) {
        const disc = document.createElement("span");
        disc.className = "map3d-icon";
        disc.append(icon.cloneNode(true));
        button.append(disc);
      }
      if (closed) button.dataset.closed = "true";
      button.append(getMarkerText(room, closed));
      const name = `${room.code || room.nameThai} ${room.nameThai}`.trim();
      button.setAttribute(
        "aria-label",
        closed ? `${name} (${CLOSED_MARKER_STATUS})` : name,
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
    const nextRoute = state.route
      ? getRouteKey(state.route.path, state.currentFloor)
      : "";
    if (nextRoute !== routeKey) {
      buildRoute(state);
      routeKey = nextRoute;
    }
    addRouteLabels(state);
    resize();
    // After the room focus above, so a new route (or a floor of it) wins the camera.
    if (nextRoute && nextRoute !== routeFocusKey) frameRoute(state);
    routeFocusKey = nextRoute;
    maybeStartIdleDemo();
  }
  return {
    ready,
    update,
    reset: () => reset(true),
    frameRoute: () => {
      if (state) frameRoute(state);
    },
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
      clearRoute();
      routeLineMaterial.dispose();
      routeCapMaterial.dispose();
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
