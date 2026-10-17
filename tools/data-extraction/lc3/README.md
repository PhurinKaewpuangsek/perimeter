# LC3 map assets and location inventory

Floor-plan assets and the extracted location inventory for **อาคาร LC3** (building code `LC3`),
floors 1–2. Issue #8.

This directory is **data and assets only**. It contains no SQL, no importer, and no runtime code.

## What is here

| Path | What it is |
| --- | --- |
| `lc3-locations.seed.json` | **Generated. The seed dataset — the deliverable.** 131 records |
| `lc3-locations.seed.csv` | Generated from the same in-memory array as the JSON, so the two cannot drift |
| `source/graph.source.json` | Byte-identical copy of the upstream `Database/graph.json` blob (288 nodes, 302 edges) |
| `source/source-manifest.json` | Provenance: source repo + commit, SHA-256 of every copied file, per-floor viewBox and coordinate transform |
| `reports/node-inventory.csv` | Generated. Every one of the 288 source nodes with a disposition and a reason |
| `survey/lc3-field-survey.template.csv` | Generated. Worksheet for the things that need a person standing in the building |
| `../../../frontend/public/maps/lc3/floor-{1,2}.svg` | The floor-plan assets, byte-identical to the upstream blobs |

## Commands

```bash
node tools/data-extraction/extract-lc3.mjs                  # regenerate seed + inventory + survey template
node tools/data-extraction/extract-lc3.mjs --verify-assets  # also re-check SHA-256 and viewBox
node --test tools/data-extraction/validate-lc3-seed.mjs     # validate the generated location and schedule data
npm --prefix tools/data-extraction test                     # also test conditional seed writes
node tools/data-extraction/preview-lc3-overlay.mjs          # write pin-baked QA SVGs to reports/qa/
```

Schedule exam rows carry `event_date` as `YYYY-MM-DD`; class rows leave it empty.
The DynamoDB seeder conditionally writes only items without `updatedBy`, preserving
administrator-edited records. Its `--dry-run` scans the selected table read-only to
report how many seed records would be written or skipped.

Everything under "Generated" above comes out of `extract-lc3.mjs`. **Never hand-edit them** —
the next run overwrites your change. Corrections belong in the generator or in the survey results.

Both scripts are Node 24 stdlib with **zero dependencies** — `AGENTS.md` §8.3 forbids installing
at the repo root, and neither `frontend/` nor `backend/` owns this data. For the same reason they
are `.mjs` rather than TypeScript: no TS toolchain exists outside the two service directories yet.

They are not wired into CI. `.github/workflows/` is off-limits outside a `ci/` issue (§6.4); wiring
`extract-lc3.mjs` in as a drift check is a follow-up.

## Coordinate system

`x`/`y` are **integer SVG user units** for the floor's asset — origin top-left, y increasing
downward. They are not latitude/longitude, and no px→metre scale is known.

The upstream project drew its graph against a different pair of SVGs. We adopted better-looking
variants from the same upstream repo, which are the **same artwork translated by a fixed integer
offset**, so upstream coordinates are remapped rather than re-surveyed:

| Floor | Asset | viewBox | Transform applied | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `floor-1.svg` | 1217×742 | `x+40, y+40` | 196 of 221 rects in the superseded asset match at this offset |
| 2 | `floor-2.svg` | 1070×528 | `x−2, y−37` | 236 of 240 match |

All 288 nodes land inside their viewBox after transforming; the extractor asserts this and fails
if it ever stops being true.

**The transform lives in `source-manifest.json` and nowhere else.** Tools read it from there. If
you ever replace an asset, update the manifest — never hardcode an offset in a second place.

**Do not run SVGO, reformat, or edit the viewBox of the assets.** Any geometry change silently
invalidates the transform. The SHA-256 gate in `--verify-assets` is what catches this.

### Line endings are load-bearing

The manifest hashes are of the **upstream committed blob**, which is LF:

```bash
git -C <CS232 clone> cat-file -p 7bfa02c:Frontend/resources/LC3-MAP-1stFloor-old.svg | sha256sum
```

They are deliberately *not* hashes of a working-tree checkout. On Windows with
`core.autocrlf=true`, checking out that repo produces CRLF and a completely different hash — so
copying from the working tree would bake this machine's git config into the provenance record and
make the hash unreproducible for anyone else.

`.gitattributes` pins these paths to `eol=lf`, which is what keeps every platform's working tree
matching the recorded hashes. Do not relax those rules to `-text` or `binary`.

### Known soft spot

Floor 1's artwork was genuinely redrawn left of `x=200` — 29 rects there do not match the
superseded asset. Those 13 pins are called out in magenta in the QA preview and listed in
`reports/qa/qa-checklist.md`. They were checked visually and land correctly, but re-check them if
the asset is ever swapped again.

## Room codes

Room code is `LC3-` plus the **full** upstream node name, slash included: `LC3-101/1`.

> The slash is part of the room number, not a duplicate marker. `101/1` is ห้องบรรยาย 4 and
> `101/2` is ห้องสัมมนาบัณฑิตศึกษา — different rooms. `125` has no name upstream while `125/1` is
> ห้องเก็บของ. **Never split on `/` to derive a "base" room code**; it merges unrelated rooms.

## What was included and what was not

131 of 288 nodes are in scope: 117 rooms + 8 toilets + 6 stairs.

| Excluded | Count | Reason |
| --- | --- | --- |
| `junction`, `entrance` nodes | 149 | `routing_topology_out_of_v1_scope` — routing is not in V1. The 93 "entrance" nodes are room doorways, not building entrances. |
| `LC3_QR1`–`QR8` | 8 | `qr_anchor_not_a_room` — QR deep-link anchors, typed `room` upstream. Seeding them would put fake rooms in the search index. |
| all 302 edges | — | Routing topology. Kept in the snapshot for provenance, never emitted. |

Every node gets exactly one disposition, and the extractor asserts the three counts — so a silent
upstream change fails loudly instead of quietly dropping rooms.

## Data that is inferred or missing

`name_verification` records how each name was established:

- `from_source` — the upstream `label`. 111 rooms.
- `inferred` — derived from the node's name code, **not observed**. All 8 toilets (`LM`/`LF`/`RM`/`RF`
  = left/right + male/female) and all 6 stairs. Confirm on the field pass.
- `pending_survey` — no name upstream. 6 rooms: `LC3_125`, `LC3_126`, `LC3_135`, `LC3_F2_210/1`,
  `LC3_F2_211/1`, `LC3_F2_211/2`. These carry `category: unknown` and flag `needs_field_validation`.

**There is no elevator node anywhere in the source graph**, and building entrances are not modelled.
Both appear as blank rows in the survey template.

### Landmarks: how they were derived, and what they are not

Upstream has no landmark data. Rather than guess, landmarks are computed from **the upstream
graph's own edges** — a breadth-first search from each room to the nearest toilet and the nearest
stairwell, counting hops along `walk` and same-floor `up` edges. Cross-floor `stairs` edges are
excluded, or a floor-2 room would look adjacent to a floor-1 toilet.

Hops, not metres. Straight-line pixel distance was rejected deliberately: two rooms can be 20px
apart with a wall between them, and only the edge topology knows that. No px→metre scale exists.

Every derived landmark is marked `derived_unverified`, and **`detail_th` deliberately does not
mention them.** A user-facing string saying "ใกล้ห้องน้ำ" that nobody confirmed is simply false;
the field pass promotes them to `field_verified` and only then does the clause get appended. The
validator enforces both halves of this — see `detail_th never asserts an unverified landmark`.

All 117 rooms resolve to both a toilet and a stairwell within the 15-hop cap (the furthest actual
distance is 14 hops), so the survey is a confirm-or-correct job rather than a blank sheet.

The 302 edges are read for this and **never emitted** — no routing data is in the seed.

## Hand-off

- **Issue #7** owns the facility schema. Nothing in this directory is a ratified contract; the
  inventory's column set is a starting point for that discussion, not a decision.
- **Issue #19** owns the DDL and the importer. `database/init.sql` is untouched.
- **Issue #10** will render these SVGs. They live under `frontend/public/maps/lc3/` so Vite serves
  them once the frontend is scaffolded; `map_asset_id` in the inventory is the logical handle.

Upstream is a teammate's coursework repo
([`ronnakrit303/CS232-Map_Navigation`](https://github.com/ronnakrit303/CS232-Map_Navigation)).
Confirm reuse with the author before anything here is published outside the course.
