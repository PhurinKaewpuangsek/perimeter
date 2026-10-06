# TORCH UI Refinement & Map Overhaul — Session Handoff Document

> **Created At**: 2026-10-06T16:20:00+07:00  
> **Repository**: `CloudV2/workspace/perimeter`  
> **Active Branch**: `feat/ui-overhaul` (tracked against `origin/feat/ui-overhaul`)  
> **Originating Issue**: #82  
> **Status**: All requested features, gesture interactions, visual hierarchy refinements, and linter fixes are complete and verified. Green CI / Green Tests (100%). Ready for final human review before commit & PR.

---

## 1. Executive Summary & Session Achievements

During this session, we completed a comprehensive overhaul of the `/map` interface across both **Desktop** and **Mobile** viewports, establishing a unified, intuitive UX matching Google Maps / Linear design standards, accompanied by buttery-smooth 60 FPS mobile touch gestures.

### Key Milestones Completed:

1. **Unified Left Sidebar Overhaul on `/map` (Desktop)**:
   - Replaced floating modal popups with an integrated, cohesive Unified Left Sidebar (`aside` at `left-3.5 top-3.5 bottom-3.5`).
   - Combined Brand Header (Perimeter logo with reset action), Search Controls, Collapsible Category Filters, Search Results, and Room Detail into one fluid container.
   - Implemented Sidebar Collapse/Expand via a floating circular chevron toggle (`<`).
   - Added persistent **Pinned Room Banner** (`ปักหมุดอยู่ · ชั้น {floor}`) when a room is pinned and the detail panel is closed, allowing users to freely pan/explore the map while keeping track of their selection.
   - Removed obsolete "ประเภทพื้นที่" dropdown filter button and the redundant "< กลับ" button.
   - Enhanced visual borders and elevation with subtle card shadows (`shadow-sm` / `shadow-xs`) for crisp contrast.

2. **Mobile Layout & Pinned Pill Repositioning**:
   - **Relocated Pinned Room Floating Pill**: Moved from the crowded bottom-left to the **top-left directly beneath the search bar** (`fixed top-2.5 inset-x-2.5 z-30 pointer-events-none`).
   - **Dynamic Flow**: Nesting the pill inside the top header container allows it to automatically slide down/up smoothly when `<CategoryFilter />` is toggled open/closed.
   - **Unobstructed Bottom Controls**: Completely freed up the bottom screen space for the Floor Switcher and Zoom Controls ([ + | - ]).

3. **Mobile Bottom Sheet Touch Gestures & Physics**:
   - **Real-Time Finger Tracking (1:1)**: Implemented touch tracking (`onTouchStart`, `onTouchMove`, `onTouchEnd`, `onTouchCancel`) with direct 60 FPS `translateY` transforms on the sheet element. Dragging down on the grab handle (`—`) or pulling down from the top of the sheet moves the card smoothly with the user's finger.
   - **Upward Damping**: Applied rubber-band elastic resistance (`deltaY * 0.15`) when pulling upward.
   - **CSS Animation Lock Fix**: Removed `animation-fill-mode: forwards` from `.animate-modal-mobile` in `frontend/src/index.css` and added `sheet.style.animation = 'none'` on touch start, resolving an issue where CSS keyframes overrode inline `style.transform`.
   - **Smooth Exit Physics**: Dragging down $> 65\text{px}$ or flicking downward with velocity $> 0.3$ smoothly animates the sheet off-screen (`translateY(100%)` with `cubic-bezier(0.2, 0.9, 0.3, 1)`) before unmounting. If released early, it springs back smoothly (`translateY(0)`).
   - **Animated Close on Tap**: Tapping the grab handle directly or tapping the `✕` close button on mobile now triggers the same smooth slide-down animation instead of abruptly disappearing.
   - **Synthetic Click Suppression**: Handled `hasDraggedRef` to prevent accidental click events from firing immediately after a drag gesture ends.

4. **Visual Hierarchy Refinements on Room Hero Card**:
   - **De-emphasized Location Context**: Replaced the loud, aggressive red/pink pill (`bg-rose-50 border-rose-100 text-rose-600 font-bold`) with a subtle, elegant neutral slate pill (`bg-slate-100/90 border border-slate-200/60 text-[11px] font-medium text-slate-500`).
   - **Removed Icon Clutter**: Removed the `Buildings` icon per user request to maintain clean simplicity.
   - **True Focal Point**: The Room Number (`ห้อง 110 (LC3-110)`) and Thai Title (`ห้องบรรยายเรียนรวม`) now serve as the clear, primary focal point of the card.
   - **Removed Dividing Border**: Removed the horizontal `border-b` line dividing the location pill from the title, allowing the card header to flow organically.
   - **Uniform Application**: Because `RoomDetailContent` is shared, this refinement applies seamlessly to both Desktop Sidebar and Mobile Bottom Sheet.

5. **Code Hygiene & ESLint Compliance**:
   - Fixed `react-hooks/static-components` ESLint error by extracting `RoomCategoryBadge` to module scope and rendering the category icon with `createElement(Icon, { size: 14, weight: 'duotone' })`.
   - Cleaned up duplicate functions in `MapPage.tsx`.
   - Linter (`npm run lint`): **0 errors, 0 warnings**.

---

## 2. Non-Negotiable Project Rules (`AGENTS.md`)

The incoming agent **MUST strictly adhere** to the non-negotiables documented in [AGENTS.md](file:///d:/1codingworkspace/CloudV2/workspace/perimeter/AGENTS.md):
- **Never commit or push directly to `main`**.
- **Require Explicit Authorization**: Never run `git commit`, `git push`, or `gh pr create` on your own. Always pause and ask the human for permission first, even when running with `--dangerously-skip-permissions`.
- **Zero AI Attribution**: Do not add AI footers, co-authors, or "Generated by AI" unless explicitly requested.
- **Leave workflows alone**: Do not edit `.github/workflows/`.
- **No ClickOps**: Manage AWS SAM resources via `template.yaml`.

---

## 3. Git & Working Tree Status

- **Branch**: `feat/ui-overhaul`
- **Tracked upstream**: `origin/feat/ui-overhaul`
- **Modified files in working tree** (ready for commit after human review):
  ```
  modified:   frontend/index.html
  modified:   frontend/src/components/MapPage.tsx
  modified:   frontend/src/components/SearchBar.tsx
  modified:   frontend/src/components/SearchResultList.tsx
  modified:   frontend/src/components/map/MapContainer.tsx
  modified:   frontend/src/components/map/MapLegend.tsx
  modified:   frontend/src/components/map/RoomMarkers.tsx
  modified:   frontend/src/components/map/__tests__/MapContainer.vitest.tsx
  modified:   frontend/src/index.css
  ```

### File-by-File Summary of Uncommitted Changes:
- `frontend/src/components/MapPage.tsx`:
  - Unified left sidebar layout for desktop (`aside.hidden.sm:flex`).
  - Mobile header with dynamically positioned floating pinned room pill (`fixed top-2.5`).
  - Mobile bottom sheet with interactive touch gesture dragging, spring-back, and smooth exit slide-down.
  - Refined Room Hero Card visual hierarchy (subtle location pill, prominent room number/name, no icon, no horizontal dividing border).
  - Modular `RoomCategoryBadge` component using `createElement` (ESLint clean).
- `frontend/src/index.css`:
  - Removed `forwards` from `.animate-modal-mobile` to unblock dynamic inline `style.transform`.
  - Added minimalist custom `.thin-scrollbar` styling for schedule day filter pills.
- `frontend/src/components/SearchBar.tsx`:
  - Removed obsolete area type ("ประเภทพื้นที่") dropdown trigger button.
- `frontend/src/components/SearchResultList.tsx`:
  - Refined result items with card borders, subtle shadows, and category color accents.
- `frontend/src/components/map/MapContainer.tsx`:
  - Coordinated floor switching and background click behavior with sidebar/sheet state.
- `frontend/src/components/map/RoomMarkers.tsx`:
  - Google Maps 1:1 selected pin vector path and POI teardrop badges.
- `frontend/src/components/map/MapLegend.tsx`:
  - Refined category pill colors and labels.
- `frontend/src/components/map/__tests__/MapContainer.vitest.tsx`:
  - Updated test assertions to match updated component structure.

---

## 4. Test Suite & Health Verification

All suites pass with 100% success rate:
- **Root Unit / Domain Tests**: `npm test` → **70/70 tests passing**.
- **Frontend Vitest Suite**: `npm --prefix frontend run test:ui` → **62/62 tests passing**.
- **ESLint Code Quality**: `npm --prefix frontend run lint` → **0 errors, 0 warnings**.
- **TypeScript & Production Build**: `npm --prefix frontend run build` → **Built cleanly in ~1.2s**.

---

## 5. Next Session Focus & Recommended Next Steps

When resuming in the next session:
1. **User Verification**:
   - Check if the user has tested on mobile (`http://<ip>:5174/map`) or desktop (`http://localhost:5174/map`) and has any further styling adjustments.
2. **Seek Human Authorization for Git Operations**:
   - Ask the user: *"Are you ready to commit these changes to `feat/ui-overhaul` and open the PR?"*
   - Once authorized, stage touched files, verify zero AI attribution with `git log origin/main..HEAD --pretty=fuller`, and commit using Conventional Commits:
     ```bash
     git add frontend/index.html frontend/src/components/MapPage.tsx frontend/src/components/SearchBar.tsx frontend/src/components/SearchResultList.tsx frontend/src/components/map/MapContainer.tsx frontend/src/components/map/MapLegend.tsx frontend/src/components/map/RoomMarkers.tsx frontend/src/components/map/__tests__/MapContainer.vitest.tsx frontend/src/index.css handoff.md
     git commit -m "feat(map): overhaul unified sidebar, mobile gestures, and room hierarchy (#82)"
     git push origin feat/ui-overhaul
     gh pr create --base main --head feat/ui-overhaul --title "feat(map): overhaul unified sidebar, mobile gestures, and room hierarchy (#82)"
     ```

---

## 6. Suggested Skills for Next Agent

- **`pr`**: Use when creating the pull request description to ensure proper tracking against Issue #82.
- **`code-review`**: Use if the user requests an automated review of the branch changes against repository coding standards.
- **`diagnosing-bugs`**: Use if any edge cases emerge during mobile device testing (e.g. Safari viewport quirks, older WebKit touch handling).

---

## 7. Quick Start & Dev Commands

```powershell
# Start Vite development server accessible over local network (phone & PC):
npm --prefix frontend run dev -- --host

# Run linter:
npm --prefix frontend run lint

# Run UI tests:
npm --prefix frontend run test:ui

# Verify production build:
npm --prefix frontend run build
```
