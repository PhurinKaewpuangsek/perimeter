# LC3 3D map trial (#93)

The public map and admin map now open the approved LC3 model by default. Floor 1 hides the second-floor mesh; floor 2 shows the stacked assembly. Existing room IDs, search, schedules and selection callbacks are retained. Users can switch to the original 2D map, and model loading or WebGL failures fall back to it automatically.

## Controls

- Left-drag to pan; right-drag to orbit; wheel or +/- to zoom. Two-finger touch pans/zooms.
- Choose a floor, select a room label or room surface, or use the existing search results.
- Reset restores the initial angle. Keyboard users can focus labels and press Enter/Space; arrow keys pan when the map region has focus.
- Labels project into screen space and remain readable above walls. Crowded labels become dots, expanding on hover/focus. Selected rooms keep their label and an area highlight where the SVG area data is available.

## Asset and coordinate contract

`frontend/src/assets/maps/lc3-campus.glb` is the review-fix revision exported on 18 October 2026: 6,440,132 bytes, 190,757 triangles, six groups. SHA-256: `9901B40D8D98107FB8CEEC1917153B080E137C9BC9529BD1C37EC137DD9B9A44`.

The 18 October review-fix revision replaces the per-room low partitions with one continuous wall per collinear run (`F1/F2_Merged_Partitions`), removing doubled walls and end seams between adjoining rooms; the three floor-1 west exterior wall runs south of the west restrooms are likewise one wall and coping (`F1_Exterior_Wall_003`, with `_004`/`_005` hidden); the original partition objects stay hidden in the .blend. It also moves the entrance balcony columns to floor 2, solidifies the west water crossings, trims floor-2 railings that ran beside walls and lifts one floor-2 slab 5 mm to stop z-fighting. The GLB is larger despite fewer triangles because the box walls carry hard-edge split normals.

The 14 October architectural finish revision adds eased structural edges, a muted material palette derived from the SVG categories, smoother fountain and tree surfaces, low courtyard planting and fountain ripples. The exporter now preserves evaluated corner normals instead of flattening the shading when combining objects. The added geometry fits in a smaller GLB because smooth surfaces share vertices. Downward-facing open forecourt geometry was corrected in Blender.

Use node `extras.part` as identity; Blender may suffix node names. Groups: `LC3_Floor_1`, `LC3_Floor_2`, `LC3_Connecting_Stairs`, `Site_Ground`, `Covered_Link`, `Surrounding_Buildings`.

The editable source lives in `assets/3d/lc3/` (not bundled into the website):

- `lc3-campus-layout.blend`: the Blender source of the current GLB, stored in Git LFS. Run `git lfs install` once, then `git lfs pull`, or the file is only a pointer.
- `prepare_architectural_export.py`: the repeatable exporter. Use it to retain custom normals.
- `polish_architectural_model.py`: the one-time finishing script that produced the 14 October revision. It is kept for reference; do not rerun it on the finished model.
- `svg-audit-inventory.json`: the SVG reference inventory that both scripts and `modelCoordinates.ts` depend on.
- `lc3-campus-ready-manifest.json`: the export manifest that the exporter reads back.

To regenerate, open the `.blend` in Blender and run `prepare_architectural_export.py` from the Scripting tab. It writes `lc3-campus-ready.glb` next to the `.blend`, which is ignored by Git. Copy that file over `frontend/src/assets/maps/lc3-campus.glb`, then update the size, triangle count and SHA-256 above. The scripts resolve every path relative to the `.blend`, so they work from any checkout. Older backups and review screenshots were not moved into the repository.

`modelCoordinates.ts` maps each SVG's independent reference rectangle to the measured Blender bounds. Export shifts Blender X by +34 and maps Z-up to glTF Y-up. Floor 2 is at elevation 3.2. Do not normalize both SVGs to the same image width or use the campus-wide bounding box for room positions. The inverse transform maps floor ray intersections back to existing `ROOM_AREAS`.

The model is imported through Vite, so its published name carries a content hash (for example `assets/lc3-campus-D4_X5ZOU.glb`). `cd-frontend.yml` serves everything under `assets/` with `Cache-Control: public, max-age=31536000, immutable`, and everything else (`index.html`, `public/`) with `no-cache`. A new model revision therefore gets a new URL and is downloaded once, and returning visitors reuse the cached copy.

If the WebGL context is lost, the map waits up to 3 seconds for the browser to restore it, then redraws. It falls back to 2D only if the context does not come back. If renderer setup fails partway, the canvas and GPU resources are released before the 2D fallback.

The renderer loads lazily and renders on demand rather than running a perpetual animation loop. Pixel ratio is capped at 1.75. Multisampled rendering, directional shadows and local ambient occlusion distinguish wall edges, stairs and ground contact. Shadow maps update on model/floor changes; camera changes are immediate, with no automatic animation. This meets the `prefers-reduced-motion` requirement for the 3D view by design. The 2D fallback still animates zoom for 200 ms. GLB materials are opaque and have no image textures; camera overlays do not alter the model.

## Verification

On Windows, 14 October 2026:

- `npm run lint`, `npm run build`, `npm test` (70 tests), `npm run test:ui` (75 tests) passed from `frontend/`.
- After the architectural revision, lint, build, 75 UI tests and browser checks were rerun. The unchanged service tests had passed during the initial integration.
- Headless Edge, 1440×1000: floor switching, left-drag pan and right-drag orbit without accidental selection, marker selection, search across floors, keyboard selection, 2D/3D remount, and admin selection checked. No admin writes were performed.
- Blender export reimport: six groups, floor 2 at 3.2, no image textures or transparent materials, and 5,822 sampled faces from 95 objects with no missing surface checks. SVG audit: all 164 recorded footprint checks passed; 116 of 117 seed rooms match enclosed geometry, with the existing `LC3-217` discrepancy below.
- 390×844 mobile emulation: cold floor-2 deep link, selected marker framing above the detail sheet, and two-finger gesture without changing selection checked.
- Aborted GLB request falls back to selectable SVG. The built production bundle was also opened locally with a floor-2 deep link.
- Browser checks used repository location/schedule seed responses, not the deployed API. The separate local review server marks seed data visibly and rejects writes. Normal application API configuration is unchanged (`VITE_API_BASE_URL`).
- On 18 October 2026, after the PR review fixes (marker focus kept across updates, callback refs, sidebar-aware hint): `npm run lint`, `npx tsc -b`, `npm test` (92 tests) and `npm run test:ui` (263 tests) passed. The counts above apply to the 14 October revision.
- 18 October 2026, mobile emulation in the in-app browser with repository seed data. At 375×812 (Android touch emulation), 320×568 and 812×375 landscape: no horizontal scroll, labels and controls stay on screen, the model loads from the hashed URL, and tapping room 120 frames it above the detail sheet. Floor 2 switching was also checked. Landscape revealed the controls hint running under the floor buttons. The hint is now width-limited so it stops before the controls, and hidden on touch screens, where its mouse instructions do not apply, and below 900 px wide.
- The configured API currently rejects requests from the local preview origin with a CORS error. The local review build therefore sets `VITE_API_BASE_URL=/` for that build process only, serving seed responses from the same local origin; no `.env` or cloud setting was edited. Do not deploy this seed-preview build. Rebuild with the normal deployment environment before release.

## Remaining checks and limits

The orthographic camera sits outside the campus bounds while retaining its original framing. This avoids near-plane clipping of surrounding buildings when zoomed out. Before/after browser captures verified maximum zoom-out, orbit and pan.

- Responsive layout was checked in mobile emulation only (see Verification). Physical-phone performance and the comparative 2D/3D usability study from #93 were not run. Record that deferral on #93 if they are not planned.
- The additional lazy 3D JavaScript chunk is about 676 kB (170 kB gzip), plus the 6.5 MB model. Vite reports its >500 kB chunk advisory; no size-limit override was added.
- `LC3-217` is still a source-data discrepancy: its seed pin is in circulation space rather than an enclosed SVG room. Its existing pin is retained; no new room geometry is invented.
- Campus surroundings are schematic. This trial does not add navigation or edit cloud resources.

Development branch: `feat/3d-floor-map`, linked to issue #93. The local preview is not a deployment.
