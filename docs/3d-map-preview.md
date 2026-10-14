# LC3 3D map trial (#93)

The public map and admin map now open the approved LC3 model by default. Floor 1 hides the second-floor mesh; floor 2 shows the stacked assembly. Existing room IDs, search, schedules and selection callbacks are retained. Users can switch to the original 2D map, and model loading or WebGL failures fall back to it automatically.

## Controls

- Left-drag to pan; right-drag to orbit; wheel or +/- to zoom. Two-finger touch pans/zooms.
- Choose a floor, select a room label or room surface, or use the existing search results.
- Reset restores the initial angle. Keyboard users can focus labels and press Enter/Space; arrow keys pan when the map region has focus.
- Labels project into screen space and remain readable above walls. Crowded labels become dots, expanding on hover/focus. Selected rooms keep their label and an area highlight where the SVG area data is available.

## Asset and coordinate contract

`frontend/public/maps/lc3/lc3-campus.glb` is the approved 14 October 2026 Blender export: 6,507,000 bytes, 119,457 triangles, six groups. SHA-256: `5F86A31619110BEE40C372DFE8A9180E3BA610DFC4C7D381ED517B1F73DB7805`.

Use node `extras.part` as identity; Blender may suffix node names. Groups: `LC3_Floor_1`, `LC3_Floor_2`, `LC3_Connecting_Stairs`, `Site_Ground`, `Covered_Link`, `Surrounding_Buildings`.

The editable source is currently local at `C:/Users/admin/Documents/Blender/LC3-floor-study/lc3-campus-layout.blend`; it is not bundled into the website or stored in this repository. Preserve this source for future geometry changes.

`modelCoordinates.ts` maps each SVG's independent reference rectangle to the measured Blender bounds. Export shifts Blender X by +34 and maps Z-up to glTF Y-up. Floor 2 is at elevation 3.2. Do not normalize both SVGs to the same image width or use the campus-wide bounding box for room positions. The inverse transform maps floor ray intersections back to existing `ROOM_AREAS`.

The renderer loads lazily and renders on demand rather than running a perpetual animation loop. Pixel ratio is capped at 1.5. Camera changes are immediate, with no automatic animation. GLB materials have no image textures; camera overlays do not alter the model.

## Verification

On Windows, 14 October 2026:

- `npm run lint`, `npm run build`, `npm test` (70 tests), `npm run test:ui` (75 tests) passed from `frontend/`.
- Headless Edge, 1440×1000: floor switching, orbit without accidental selection, marker selection, search across floors, keyboard selection, 2D/3D remount, and admin selection checked. No admin writes were performed.
- 390×844 mobile emulation: cold floor-2 deep link, selected marker framing above the detail sheet, and two-finger gesture without changing selection checked.
- Aborted GLB request falls back to selectable SVG. The built production bundle was also opened locally with a floor-2 deep link.
- Browser checks used repository location/schedule seed responses, not the deployed API. The separate local review server marks seed data visibly and rejects writes. Normal application API configuration is unchanged (`VITE_API_BASE_URL`).
- The configured API currently rejects requests from the local preview origin with a CORS error. The local review build therefore sets `VITE_API_BASE_URL=/` for that build process only, serving seed responses from the same local origin; no `.env` or cloud setting was edited. Do not deploy this seed-preview build. Rebuild with the normal deployment environment before release.

## Remaining checks and limits

- Real-phone performance and comparative usability testing are still required before release. Desktop browser emulation is not a physical-device result.
- The additional lazy 3D JavaScript chunk is about 647 kB (163 kB gzip), plus the 6.5 MB model. Vite reports its >500 kB chunk advisory; no size-limit override was added.
- `LC3-217` is still a source-data discrepancy: its seed pin is in circulation space rather than an enclosed SVG room. Its existing pin is retained; no new room geometry is invented.
- Campus surroundings are schematic. This trial does not add navigation or edit cloud resources.

Development branch: `feat/3d-floor-map`, linked to issue #93. The local preview is not a deployment.
