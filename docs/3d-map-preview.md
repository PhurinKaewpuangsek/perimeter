# LC3 3D map trial (#93)

The public map and admin map now open the approved LC3 model by default. Floor 1 hides the second-floor mesh; floor 2 shows the stacked assembly. Existing room IDs, search, schedules and selection callbacks are retained. Users can switch to the original 2D map, and model loading or WebGL failures fall back to it automatically.

## Controls

- Left-drag to pan; right-drag to orbit; wheel or +/- to zoom. Two-finger touch pans/zooms.
- Choose a floor, select a room label or room surface, or use the existing search results.
- Reset restores the initial angle. Keyboard users can focus labels and press Enter/Space; arrow keys pan when the map region has focus.
- Labels project into screen space and remain readable above walls. Crowded labels become dots, expanding on hover/focus. Selected rooms keep their label and an area highlight where the SVG area data is available.

## Asset and coordinate contract

`frontend/public/maps/lc3/lc3-campus.glb` is the review-fix revision exported on 18 October 2026: 6,440,132 bytes, 190,757 triangles, six groups. SHA-256: `9901B40D8D98107FB8CEEC1917153B080E137C9BC9529BD1C37EC137DD9B9A44`.

The 18 October review-fix revision replaces the per-room low partitions with one continuous wall per collinear run (`F1/F2_Merged_Partitions`), removing doubled walls and end seams between adjoining rooms; the three floor-1 west exterior wall runs south of the west restrooms are likewise one wall and coping (`F1_Exterior_Wall_003`, with `_004`/`_005` hidden); the original partition objects stay hidden in the .blend. It also moves the entrance balcony columns to floor 2, solidifies the west water crossings, trims floor-2 railings that ran beside walls and lifts one floor-2 slab 5 mm to stop z-fighting. The GLB is larger despite fewer triangles because the box walls carry hard-edge split normals.

The 14 October architectural finish revision adds eased structural edges, a muted material palette derived from the SVG categories, smoother fountain and tree surfaces, low courtyard planting and fountain ripples. The exporter now preserves evaluated corner normals instead of flattening the shading when combining objects. The added geometry fits in a smaller GLB because smooth surfaces share vertices. Downward-facing open forecourt geometry was corrected in Blender.

Use node `extras.part` as identity; Blender may suffix node names. Groups: `LC3_Floor_1`, `LC3_Floor_2`, `LC3_Connecting_Stairs`, `Site_Ground`, `Covered_Link`, `Surrounding_Buildings`.

The editable source is currently local at `C:/Users/admin/Documents/Blender/LC3-floor-study/lc3-campus-layout.blend`; it is not bundled into the website or stored in this repository. Preserve this source for future geometry changes.

The same local folder contains `lc3-campus-before-quality-polish.blend`, the one-time finishing script `polish_architectural_model.py`, and the current repeatable exporter `prepare_architectural_export.py`. Use the current exporter to retain custom normals; the older `prepare_text_free_export.py` does not preserve them.

`modelCoordinates.ts` maps each SVG's independent reference rectangle to the measured Blender bounds. Export shifts Blender X by +34 and maps Z-up to glTF Y-up. Floor 2 is at elevation 3.2. Do not normalize both SVGs to the same image width or use the campus-wide bounding box for room positions. The inverse transform maps floor ray intersections back to existing `ROOM_AREAS`.

The renderer loads lazily and renders on demand rather than running a perpetual animation loop. Pixel ratio is capped at 1.75. Multisampled rendering, directional shadows and local ambient occlusion distinguish wall edges, stairs and ground contact. Shadow maps update on model/floor changes; camera changes are immediate, with no automatic animation. GLB materials are opaque and have no image textures; camera overlays do not alter the model.

## Verification

On Windows, 14 October 2026:

- `npm run lint`, `npm run build`, `npm test` (70 tests), `npm run test:ui` (75 tests) passed from `frontend/`.
- After the architectural revision, lint, build, 75 UI tests and browser checks were rerun. The unchanged service tests had passed during the initial integration.
- Headless Edge, 1440×1000: floor switching, left-drag pan and right-drag orbit without accidental selection, marker selection, search across floors, keyboard selection, 2D/3D remount, and admin selection checked. No admin writes were performed.
- Blender export reimport: six groups, floor 2 at 3.2, no image textures or transparent materials, and 5,822 sampled faces from 95 objects with no missing surface checks. SVG audit: all 164 recorded footprint checks passed; 116 of 117 seed rooms match enclosed geometry, with the existing `LC3-217` discrepancy below.
- 390×844 mobile emulation: cold floor-2 deep link, selected marker framing above the detail sheet, and two-finger gesture without changing selection checked.
- Aborted GLB request falls back to selectable SVG. The built production bundle was also opened locally with a floor-2 deep link.
- Browser checks used repository location/schedule seed responses, not the deployed API. The separate local review server marks seed data visibly and rejects writes. Normal application API configuration is unchanged (`VITE_API_BASE_URL`).
- The configured API currently rejects requests from the local preview origin with a CORS error. The local review build therefore sets `VITE_API_BASE_URL=/` for that build process only, serving seed responses from the same local origin; no `.env` or cloud setting was edited. Do not deploy this seed-preview build. Rebuild with the normal deployment environment before release.

## Remaining checks and limits

The orthographic camera sits outside the campus bounds while retaining its original framing. This avoids near-plane clipping of surrounding buildings when zoomed out. Before/after browser captures verified maximum zoom-out, orbit and pan.

- Real-phone performance and comparative usability testing are still required before release. Desktop browser emulation is not a physical-device result.
- The additional lazy 3D JavaScript chunk is about 676 kB (170 kB gzip), plus the 6.5 MB model. Vite reports its >500 kB chunk advisory; no size-limit override was added.
- `LC3-217` is still a source-data discrepancy: its seed pin is in circulation space rather than an enclosed SVG room. Its existing pin is retained; no new room geometry is invented.
- Campus surroundings are schematic. This trial does not add navigation or edit cloud resources.

Development branch: `feat/3d-floor-map`, linked to issue #93. The local preview is not a deployment.
