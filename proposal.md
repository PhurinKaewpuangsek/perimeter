# Technical & UX Redesign Proposal: Perimeter (`/map`)

## Instructions for the Codebase-Aware AI Evaluator

You have access to the actual Perimeter codebase. Your task is to critically evaluate this UX/UI and responsive architecture proposal against the existing implementation.

You must:

1. Verify how each proposed change maps to the current component tree, state management, CSS/layout system, map engine, and API data structures.
2. Answer all Codebase Verification Questions in Section 6 using evidence from the actual source code.
3. Identify technical constraints, breaking changes, unnecessary complexity, and simpler implementation paths within the existing stack.
4. Produce a prioritized, technically grounded implementation plan.
5. Distinguish verified defects from design hypotheses and optional enhancements.

**This is an analysis-only task. Do not modify files, implement changes, install dependencies, create commits, or open pull requests.** Wait for my explicit approval after presenting your complete review.

Do not blindly approve the proposal. Treat it as a set of recommendations to validate, not a specification that must be implemented exactly as written.

---

## 1. Core Diagnosis of Current UI Bottlenecks

Based on visual inspection of the current desktop `/map` interface, the following UX problems have been identified. Verify each against the actual codebase and reproduce the behavior where possible.

### 1.1 Context Loss During Sidebar Scrolling

The left sidebar, approximately 380–400px wide, appears to place the selected-room card, schedule-category controls (`ตารางเรียน` / `ตารางสอบ`), weekday selector (`จ.–อา.`), and vertical timetable within a single scrolling region.

As users scroll down to later schedule entries, the room identity, active schedule category, and selected weekday disappear from view.

**Proposed outcome:** Keep essential room and schedule context accessible while scrolling through the timetable.

### 1.2 Concurrent Schedule Records Become Unreadable

When multiple records overlap in time, the timetable appears to divide its horizontal space into narrow columns.

For example, Room 104 may have three concurrent examination records on Friday (`ศ.`), each occupying approximately one-third of a 300–340px content area.

Fixed-width actions such as `🔖 บันทึก` and `📅+` may consume most or all of each card's available width, leaving course identifiers and time ranges clipped or unreadable.

**Proposed outcome:** Preserve access to every overlapping record while ensuring essential information remains readable.

Verify the actual collision-layout algorithm, CSS positioning, and data conditions before selecting a solution.

### 1.3 Room Card Consumes Excessive Vertical Space

The selected-room card appears to occupy approximately 260px above the timetable, limiting the number of schedule entries visible on laptop screens.

Other potential issues include:

- Schedule actions competing visually with course information.
- Examination dates represented only by weekday labels.
- Map-marker colors lacking an obvious legend.
- Category filters being difficult to discover.

**Proposed outcome:** Improve information hierarchy, reduce unnecessary vertical space, and clarify schedule dates and map categories without removing useful information.

### 1.4 Desktop Split-View Does Not Scale to Mobile

A sidebar beside a large interactive 3D map cannot simply be compressed to fit a narrow viewport.

**Proposed outcome:** Create a deliberate mobile layout that retains all essential functionality and provides appropriate touch interactions.

These observations are initial hypotheses based on visual inspection. If source-code inspection or reproduction shows that a problem is absent or behaves differently, document the discrepancy and adjust the plan.

---

## 2. Proposed Architecture

### Contextual Split-View on Desktop + Adaptive Mobile Bottom Sheet

The proposed overall direction is to preserve the map-centric workflow while adapting the presentation to desktop, tablet, and mobile.

The intended experience is:

- **Desktop:** A global header, a room-and-schedule sidebar, and an interactive 3D map.
- **Tablet:** A full map with a floating or collapsible room-and-schedule panel, depending on available space.
- **Mobile:** A full-screen map with floating search and map controls, plus an adaptive Bottom Sheet for room details and schedules.

The desktop and mobile interfaces do not need identical layouts. They must preserve equivalent access to essential user capabilities.

Do not introduce a separate page or mode for every function unless the current architecture or usability evidence demonstrates a compelling reason.

### 2.1 Unified State Coordination

The following conceptual state must remain consistent across the interface:

- `selectedRoomId`: Selected marker, room details, and corresponding schedule.
- `activeBuildingId`: Active building and available floors.
- `activeFloorIndex`: Rendered floor and floor-selector state.
- `activeScheduleType`: `class`, `exam`, or `event`, where supported.
- `selectedWeekday` / `selectedDate`: The active schedule day or date.
- Mobile Bottom Sheet state: Peek, Medium, or Expanded, if this interaction is adopted.

These are conceptual state names, not requirements to create new variables or a global store.

Inspect the current state-management approach before deciding whether existing local state, shared state, context, or another mechanism is appropriate.

**Important state-preservation rule:** Selecting another room should generally preserve the active schedule category and selected weekday/date so users can compare different rooms on the same day.

However, inspect existing product semantics and state dependencies before implementing this rule. Define the appropriate behavior separately for room selection, building changes, floor switching, category changes, date changes, and navigation. Do not impose one universal state-reset or persistence rule on every interaction.

### 2.2 Dynamic Camera Centering

When a room is selected, the map should ideally center the selected marker in the portion of the viewport that remains visible after accounting for the sidebar or Bottom Sheet.

Initial design hypotheses:

- Desktop: Account for the approximately 380–420px sidebar.
- Mobile: Account for the height of the currently expanded Bottom Sheet.
- Tablet: Account for any floating panel or overlay.

Do not assume that the map engine supports `centerOnRoom(roomId)`, `paddingLeft`, or `paddingBottom` APIs.

Inspect the existing camera and viewport implementation. Use supported map-engine features or the least invasive equivalent. Prefer measurements derived from the actual layout over hardcoded offsets when practical.

Verify that camera adjustments do not interfere with marker selection, map zooming, floor changes, or navigation.

---

## 3. Proposed Component Specifications

These are design targets, not mandatory dimensions. Validate them against the current implementation before adopting them.

### Component 1: Desktop Sidebar and Pinned Context

**Target viewport:** `>= 1024px`, subject to validation of the existing layout and breakpoints.

#### A. Search Header

Keep room discovery immediately accessible while the user scrolls.

Potential elements:

- Search input with a clear placeholder such as `ค้นหาห้องหรือรหัสวิชา...`.
- Inline clear action.
- Filter trigger with a visible active-filter indication, if supported.
- Reset or history action with an explicit tooltip.

Potential styling:

- `position: sticky`.
- A suitable `top` offset.
- A controlled stacking order that does not obscure menus, dialogs, or other overlays.

Inspect the existing filter and reset behavior before changing either control.

#### B. Condensed Room Summary

The research proposes reducing the selected-room card from approximately 260px to approximately 176px, where content and accessibility permit.

Potential information hierarchy:

**Row 1:** Building and floor breadcrumb, room-category label, and close/deselect control.

**Row 2:** Room number, room code, room description, and a schedule-based status if the underlying data supports it.

**Row 3:** A compact landmark or location description.

**Row 4:** Primary navigation action and any verified secondary navigation options.

Do not remove necessary room information merely to meet a fixed height.

##### Availability-status guardrail

A badge such as `🟢 ว่างตอนนี้` must not imply actual physical occupancy unless the application has a reliable real-time occupancy source.

If the system only has scheduled events, use a clearly labeled schedule-based status, such as `ไม่มีรายการตามตารางขณะนี้`, and only when that conclusion can be calculated correctly from the available data.

Do not introduce a new live-availability system as part of a frontend-only redesign.

#### C. Collapsible Context Bar

When users scroll through the timetable, consider collapsing the room summary into a compact sticky bar.

The research suggests an approximately 48px-high bar containing:

- Room number and room code.
- Floor or building context.
- Compact navigation action.
- Close or deselect action, if applicable.

A possible implementation is a sticky element whose presentation changes after a scroll threshold, initially proposed at `scrollTop > 120px`.

Verify the actual scroll container, sticky behavior, and stacking contexts before choosing this mechanism.

Avoid duplicate room headers occupying space simultaneously. Preserve keyboard focus and accessibility when the expanded summary collapses.

#### D. Pinned Schedule Controls

Keep the schedule category and date navigation accessible while users scroll through records.

Potential controls:

- Section heading: `ตารางการใช้ห้อง`.
- Optional Timeline / Agenda view selector.
- Optional expanded weekly matrix.
- Full-width segmented control for supported schedule categories.
- Weekday selector.
- Explicit calendar dates where the underlying schedule semantics support them.

The proposed sticky offsets of `top: 64px` and `top: 112px` are initial hypotheses. Calculate the actual offsets from the global header and stacked elements instead of blindly hardcoding them.

The seven-day selector should retain accessible labels and usable touch targets.

For examination schedules, display actual calendar dates when reliable date data is available. Do not generate dates from weekday labels without a verified week definition.

#### E. Seven-Day Matrix

An expanded seven-day view may be useful for users who need to compare schedules across the week.

Treat this as optional until you determine:

- Whether a similar view already exists.
- Whether the API and current state support it.
- Whether the information remains readable at realistic screen sizes.
- Whether it adds value beyond the existing daily schedule.

Do not introduce a complex matrix merely to satisfy the proposal.

---

### Component 2: Adaptive Schedule Rendering

This is one of the highest-priority areas to investigate.

#### A. Concurrent Events

The research proposes avoiding narrow side-by-side cards when several events overlap in time.

An initial hypothesis is to use a minimum event width of approximately 260px and switch to vertically stacked cards when the available space cannot support readable columns.

However, `minEventWidth: 260px` is not a mandatory implementation requirement.

First inspect how the existing timetable calculates:

- Event start and end positions.
- Horizontal offsets and widths.
- Concurrent event groups.
- Time-axis geometry.
- Scrollable container dimensions.
- Text clipping and action placement.

Then select the simplest reliable solution.

Potential strategies include:

1. Stacking concurrent events vertically within a shared time-slot group.
2. Switching to an Agenda view when the viewport is too narrow.
3. Retaining the Timeline on wider screens and using a stacked representation at narrower widths.
4. Modifying the existing collision-layout algorithm if that is the most appropriate solution.

Do not assume that a minimum-width CSS rule alone solves the problem. Avoid horizontal overflow and preserve the chronological relationship between events.

Every event must remain individually accessible, even when several records share the same time range.

A shared group header may display the common interval and the number of concurrent events, provided the grouping logic is correct.

#### B. Schedule Card Information Hierarchy

Keep essential information visible:

- Course or event identifier.
- Full name when available.
- Start and end times.
- Event type or other useful metadata, where available.
- Existing schedule actions.

Ensure long Thai and English text wraps or truncates predictably, with an accessible way to inspect the full value when needed.

Do not silently omit records or alter schedule semantics to make the layout simpler.

#### C. Progressive Disclosure of Actions

The research proposes reducing the width consumed by repeated actions such as:

- `🔖 บันทึก`.
- `📅+`.

Potential alternatives include compact icon buttons, accessible labels, tooltips on desktop, and explicit accessible names on touch devices.

Before changing these controls, verify their exact functional differences in the source code.

Preserve every existing action and its handler. Do not merge actions that perform different operations.

Use appropriate hit targets, spacing, and visible focus states. A compact icon-only button is acceptable only if users can reliably understand and operate it.

#### D. Free-Gap Indicators

The research suggests displaying a subtle indicator for schedule gaps of at least 30 minutes, such as `ห้องว่าง 12:30–13:30`.

Treat this as optional.

Before adopting it, verify:

- Whether schedule records completely describe the room's availability.
- How overlapping events are handled.
- Whether gaps are calculated within the correct date and operating period.
- Whether missing or incomplete records could produce misleading results.

Do not label a room definitively vacant merely because no record exists in the current dataset.

---

### Component 3: Map Canvas, Legend, and Spatial Controls

#### A. Category Legend and Filters

The research proposes a floating legend and category-filter bar on the map.

Potential categories, subject to the actual data model, include:

- All.
- Lecture rooms.
- Laboratories.
- Seminar rooms.
- Offices.
- Restrooms and stairs.

The existing marker colors reportedly include purple, pink, orange, green, and dark slate.

Inspect the actual marker-category mapping before creating a legend. Do not assume that every color corresponds to the categories listed above.

Requirements:

- Labels or icons must supplement color distinctions.
- Filtering must work with existing map markers and search behavior.
- Filter states must be visible.
- Selected-room state must remain coherent when filters change.
- Users must be able to discover and clear active filters.
- The legend must not obstruct critical map content or controls.

If category filtering is already available, evaluate whether the issue is discoverability rather than missing functionality.

#### B. Marker Interaction

Evaluate marker readability and hit targets on desktop and mobile.

Initial reference targets:

- Desktop: approximately 24×24 CSS px where appropriate.
- Mobile: approximately 44×44 CSS px where appropriate.

Validate actual accessibility requirements, marker geometry, and the capabilities of the current map engine.

If markers are too dense, consider clustering, zoom-dependent labels, selection cycling, or another solution supported by the current map implementation.

Do not implement clustering solely because the proposal mentions it. Determine whether the current marker density creates a real usability problem and whether clustering would interfere with room-level selection.

#### C. Map Controls

Ensure that essential controls remain accessible:

- Building and floor selection.
- 2D/3D switching.
- Zoom.
- Recenter.
- Indoor navigation where supported.

The exact control layout may differ between desktop, tablet, and mobile.

Avoid placing controls beneath the Bottom Sheet or outside reachable touch areas.

---

### Component 4: My Schedule

The research proposes a non-modal right-hand drawer, approximately 380px wide, opened from `My Schedule` in the global header.

Potential capabilities include:

- Viewing saved schedule records.
- Opening a saved record's associated room on the map.
- Viewing relevant schedule details.
- Detecting conflicts, if the existing data and product rules support them.

**This is an optional enhancement, not a mandatory redesign requirement.**

Inspect the existing `My Schedule` route, components, interactions, permissions, and data flow first.

Determine whether a drawer improves the current workflow or duplicates an existing page or modal.

If conflict detection is proposed, establish its intended semantics and verify that the necessary schedule data is available. Do not introduce conflict calculations or backend changes without demonstrating their value.

Preserve existing saved records, user-specific behavior, and authorization rules.

---

### Component 5: Mobile-First Responsive Architecture

**Mobile support is mandatory.** A desktop sidebar must not simply be squeezed into a narrow viewport.

The proposed mobile layout uses a full-screen interactive map and three conceptual Bottom Sheet states.

#### A. Full-Screen Map

Use a viewport-aware layout, potentially based on `100dvh`, with appropriate handling for browser chrome and device safe areas.

Verify compatibility with the existing map engine and the current browser support requirements.

#### B. Floating Search and Action Area

Potential elements:

- Search input.
- Clear and filter actions.
- Reset action.
- My Schedule entry point.
- Account or role-specific controls.

A possible placement is below the top safe area, with horizontally scrollable category chips beneath the search field.

Tapping search may open a full-screen autocomplete overlay to prevent the virtual keyboard from crushing the map.

Validate the current search component before introducing a second search implementation.

Preserve keyboard navigation, focus behavior, autocomplete selection, and dismissal behavior.

#### C. Three-Detent Bottom Sheet

The proposed states are:

**Peek — approximately 148px**

Display a compact selected-room summary, a primary navigation action, and an affordance to expand the schedule.

The map remains visible and interactive wherever technically feasible.

**Medium — approximately 52dvh**

Display the room summary, schedule-category controls, weekday/date selector, and a schedule preview.

The map remains visible above the sheet.

**Expanded — approximately 92dvh**

Display a compact sticky room header, sticky schedule controls, and a full-width chronological Agenda.

Schedule entries scroll within the sheet.

These values are initial hypotheses, not fixed requirements. Validate them against actual content, device dimensions, safe areas, and supported browser behavior.

If a custom three-detent sheet introduces excessive complexity or conflicts with the existing map library, propose a simpler interaction that preserves the same core capabilities.

#### D. Gesture Ownership

Investigate conflicts between:

- Map panning and Bottom Sheet dragging.
- Map zooming and page scrolling.
- Sheet dragging and internal schedule scrolling.
- Horizontal weekday swipes and other touch gestures.
- Browser navigation gestures and interactive controls.

Do not blindly apply `touch-action: pan-y` across the sheet without checking its effect on nested controls and gestures.

The map should remain interactive in the visible region whenever the design claims it is interactive.

Define when the sheet expands, collapses, or remains fixed, and ensure users can reach all content without gesture traps.

#### E. Map Control Placement

The research proposes a vertical control stack near the right edge, initially around `right: 12px; bottom: 164px`.

Controls may include:

- Building or floor selection.
- 2D/3D switching.
- Recenter and zoom.

The controls may fade or relocate when the Bottom Sheet expands.

Validate these behaviors against the actual map API and viewport dimensions. Avoid hiding essential controls without an alternative way to access them.

#### F. Mobile Functional Parity

The redesigned mobile experience must preserve access to every existing essential capability, including:

- Room search and selection.
- Map-marker selection.
- Room details.
- Class and examination schedules.
- Weekday/date navigation.
- Building and floor switching.
- 2D/3D map views.
- Indoor navigation.
- My Schedule.
- Save and calendar actions.
- Account and role-specific controls.

Functional parity does not require identical layouts. It requires users to retain equivalent capabilities.

#### G. Mobile Landscape

The research suggests considering a left-side floating drawer for landscape viewports with limited height.

Treat this as an optional responsive variation.

Inspect the actual application behavior at short viewport heights before implementing a special landscape layout.

Do not add complex orientation-specific logic unless it improves usability beyond a simpler responsive layout.

---

### Component 6: Responsive Breakpoint Matrix

The initial proposal is:

| Layout | Proposed viewport | Concept |
|---|---|---|
| Desktop | `>= 1024px` | Global header, collapsible sidebar, map |
| Tablet portrait | `768–1023px` | Full map with floating or collapsible information panel |
| Mobile portrait | `< 768px` | Full-screen map, floating search, Bottom Sheet |
| Mobile landscape | Width `<= 932px`, height `<= 500px` | Consider a side drawer instead of a tall Bottom Sheet |

These are initial reference values.

Inspect the existing CSS breakpoints, map minimum dimensions, and content constraints before selecting final breakpoints.

Prefer content-driven breakpoints where appropriate. Verify that the transition between layouts does not produce sudden loss of functionality or unusable intermediate widths.

---

## 4. Phased Implementation Plan

The phases below represent proposed priorities. Reorder or revise them according to codebase findings and implementation dependencies.

### Phase 1 — Verified High-Impact UX Corrections

Potential tasks:

1. Fix schedule collisions, text clipping, and action overlap.
2. Keep essential room and schedule context accessible while scrolling.
3. Improve the hierarchy and space usage of the room summary.
4. Make schedule actions more compact without removing their functionality.
5. Display reliable calendar dates where the underlying data supports them.

For each task, identify whether the change can be completed within existing components and styles or requires a change to state management or data handling.

Do not introduce new architectural dependencies during this phase without justification.

### Phase 2 — Responsive Architecture

Potential tasks:

1. Implement the appropriate mobile layout.
2. Introduce the Bottom Sheet interaction if technically feasible and justified.
3. Preserve map interactions and room/schedule synchronization.
4. Ensure map controls remain reachable at all sheet states.
5. Verify floor switching, 2D/3D switching, search, navigation, and existing schedule actions across breakpoints.

### Phase 3 — Optional Enhancements

Potential tasks:

1. Add or improve map legends and category filters.
2. Refine marker interactions or implement clustering where necessary.
3. Reconsider My Schedule presentation.
4. Add free-gap indicators if data semantics support them.
5. Add a seven-day matrix or landscape-specific layout if testing demonstrates value.

Optional features must not delay essential usability fixes without a clear reason.

---

## 5. Implementation Guardrails and Evidence Requirements

### 5.1 Distinguish Facts From Hypotheses

Classify findings as:

- **Verified defect:** Confirmed through code inspection or reproducible behavior.
- **UX hypothesis:** A proposed improvement requiring validation.
- **Architectural dependency:** A change dependent on existing state, APIs, routing, or map capabilities.
- **Optional enhancement:** A feature not required to solve the core UX problems.

Do not describe an unverified visual observation as a confirmed code defect.

### 5.2 Do Not Treat Proposed Values as Mandatory

Panel dimensions, sticky offsets, breakpoints, hit targets, event widths, and Bottom Sheet detents are starting hypotheses.

Validate them against the actual implementation and content.

Prefer existing design tokens and responsive measurements where suitable. Do not introduce arbitrary fixed values merely to match the proposal.

### 5.3 Verify Data Before Introducing New UI

Do not introduce live-availability badges, calendar dates, instructor names, full course names, event categories, free-gap indicators, or accessibility-routing controls unless the underlying data and logic support them.

For every data-dependent feature, identify:

1. The data source.
2. Existing API response fields or frontend calculations.
3. Whether the data is sufficiently current and authoritative.
4. How missing, stale, or ambiguous values are handled.
5. Whether any backend or API changes are required.

In particular:

- No scheduled record does not necessarily mean the room is physically vacant.
- A weekday label does not establish an exact calendar date.
- A navigation graph does not necessarily support step-free routing.
- A saved schedule does not automatically imply conflict detection is implemented.

Do not fabricate data or present unsupported status as fact.

### 5.4 Preserve Existing Behavior

Preserve the semantics of room selection, map synchronization, schedule retrieval, date filtering, floor changes, navigation, My Schedule, permissions, and existing actions.

Explicitly document state-transition behavior for important interactions.

Avoid unnecessary state duplication or a new state-management library unless code evidence demonstrates a need.

### 5.5 Verify Map Capabilities Before Designing Camera and Gesture Behavior

Inspect the actual map engine and integration before specifying camera offsets, viewport padding, clustering, or gesture handling.

Do not assume that proposed APIs exist.

Choose the least invasive supported solution, and test the interaction between map gestures, sheet dragging, and internal scrolling.

### 5.6 Avoid Scope Expansion

Treat the following as optional until justified:

- My Schedule drawer.
- Seven-day matrix.
- Free-gap indicators.
- Marker clustering.
- New category filters.
- Step-free routing.
- New API capabilities.

Inspect existing functionality before proposing a duplicate.

### 5.7 Accessibility and Performance

Evaluate:

- Keyboard navigation and focus management.
- Accessible names and labels.
- Contrast and non-color indicators.
- Touch-target dimensions.
- Screen-reader behavior.
- Map responsiveness.
- Unnecessary component re-renders.
- Scroll and animation performance.
- Browser safe-area and viewport behavior.

Use WCAG 2.2 AA as a reference target where applicable, but verify the specific success criteria rather than claiming compliance based on visual appearance alone.

### 5.8 Evidence and Uncertainty

Use actual repository evidence, including file paths, component names, relevant functions, and line ranges when practical.

Do not invent:

- Component names.
- API fields.
- Map-engine features.
- Existing tests.
- Test results.
- Performance measurements.
- Implementation complexity.

If a question cannot be answered from the available source code, explain what is missing and how it should be verified.

---

## 6. Codebase Verification Questions

Inspect the source code and answer each question with evidence.

### 6.1 Technology Stack and Map Engine

- Which frontend framework and version are used?
- Which UI library, styling approach, and CSS/layout system are used?
- Which 3D map engine or custom rendering solution is used?
- How is the map integrated with the surrounding application?
- Which existing components manage the global header, sidebar, room card, schedule, and map controls?
- What responsive breakpoints already exist?

Provide relevant file paths and symbols.

### 6.2 Schedule Data Model

- What exact fields exist in the class-schedule objects?
- What exact fields exist in the examination-schedule objects?
- Are events and workshops represented by a separate model or category?
- Are course names, instructors, start times, end times, and calendar dates available?
- Where do these records originate: API responses, database records, static files, or frontend calculations?
- Are date/time values timezone-aware?
- How are missing values and recurring schedules handled?

Distinguish fields that exist in the source data from values derived in the frontend.

### 6.3 Overlap Calculation

- How does the current timetable calculate horizontal positioning for overlapping events?
- Does it use absolute positioning, calculated columns, CSS Grid, Flexbox, or another technique?
- Where are event collisions detected?
- Can overlapping records be grouped and stacked without changing the API?
- What happens when event durations differ or records partially overlap?
- Would a responsive Agenda view be simpler and more reliable than modifying the existing timeline layout?

Provide the relevant implementation locations and recommend the smallest robust fix.

### 6.4 Existing Control Mechanics

Investigate each control rather than inferring its purpose from its icon.

**Reset/history button (`↺`)**
- What function does it call?
- Does it reset search state, map position, navigation history, or something else?
- What is the correct user-facing label?

**Filter button (`≡`)**
- Which filter options actually exist?
- Which are implemented and connected to application state?
- Does the filter affect map markers, search results, schedules, or multiple areas?

**Schedule save button (`🔖 บันทึก`)**
- What data does it save?
- Where is that data stored?
- What happens when an item is already saved?

**Calendar button (`📅+`)**
- Does it export to an external calendar, create an event, or perform another action?
- Does it use a different handler and data path from the save button?
- What error and success behavior already exists?

**Navigation action (`นำทางมาที่นี่`)**
- Does navigation use A*, Dijkstra, a floor graph, SVG polylines, an external link, or another mechanism?
- Where are route data and algorithms implemented?
- How are stairs, elevators, ramps, and floor transitions represented?
- Does the current graph support step-free routing, or would that require new data and routing logic?

**ADMIN role**
- Which routes, components, actions, and API operations depend on the ADMIN role?
- How are permissions enforced in the frontend and backend?
- Which account controls must remain accessible on mobile?

### 6.5 State Management and Synchronization

- Where is the selected room stored?
- How are map-marker selection and room details synchronized?
- How do building and floor changes affect selected-room state?
- Where are schedule category and weekday/date stored?
- Does selecting a different room currently preserve or reset those values?
- What happens when filters hide a selected room?
- What happens when a selected room belongs to another floor?
- What is the least invasive way to preserve appropriate schedule context across room selection?

Do not propose a new global store until you have established that the existing approach is insufficient.

### 6.6 Mobile and Map Constraints

- What happens to the map canvas at widths below 768px?
- Does the existing layout already have tablet or mobile behavior?
- Which map APIs support camera centering and viewport offsets?
- Can markers remain interactive while an overlay covers part of the map?
- How are touch gestures currently handled?
- Are there existing conflicts between map scrolling and page scrolling?
- What browser or rendering constraints affect a Bottom Sheet implementation?

Identify which findings are confirmed from source code and which require runtime testing.

### 6.7 Testing and Build Infrastructure

- Which tests already cover map selection, schedules, state synchronization, and existing actions?
- Which unit, component, integration, or end-to-end test tools are available?
- What are the existing build, lint, and test commands?
- Which regression tests can be run without changing the codebase?
- Which behaviors require browser or physical-device verification?

Do not install new test tools as part of this analysis-only review.

---

## 7. Required Output

Produce a code-aware technical review using the following structure.

### Part 1 — Executive Verdict

State:

- Whether the proposed architecture is appropriate for the current codebase.
- The strongest recommendations.
- Recommendations that should be modified, deferred, or rejected.
- The most important technical risks.
- Any critical information missing from the research.

### Part 2 — Current-State Architecture

Summarize the actual frontend architecture, component boundaries, state ownership, data flow, map integration, schedule renderer, and responsive implementation.

Include relevant file paths and symbols.

### Part 3 — Recommendation Audit

Use this table:

| Recommendation | Current Code Evidence | Verdict | Required Changes | Risk | Priority |
|---|---|---|---|---|---|

Use these verdicts:

- Accept.
- Accept with modifications.
- Defer.
- Reject.

Evaluate at least:

- Desktop Split-View.
- Adaptive concurrent-event rendering.
- Sticky Context Header.
- Room-card condensation.
- Progressive Disclosure of schedule actions.
- Calendar-date presentation.
- Mobile Bottom Sheet.
- Map controls and camera positioning.
- Marker legend and filters.
- My Schedule presentation.
- Functional parity.
- Accessibility and regression testing.

Ground each verdict in the actual codebase.

### Part 4 — Target Architecture

Describe the smallest maintainable architecture that supports the approved recommendations.

Identify:

- Components to retain.
- Components to modify.
- New components that are genuinely justified.
- State that should remain local or shared.
- How room, floor, schedule, and map state remain synchronized.
- How responsive behavior should be organized.

Do not recommend a full rewrite without compelling evidence.

### Part 5 — Desktop Implementation Plan

Specify the recommended layout, sticky behavior, schedule-rendering strategy, action controls, date presentation, and map interaction.

Include the relevant existing files and dependencies.

### Part 6 — Mobile Implementation Plan

Specify the recommended responsive layout, search interaction, Bottom Sheet behavior if appropriate, schedule presentation, floor switching, map controls, gesture handling, and functional parity.

Identify browser or map-library limitations that require further verification.

### Part 7 — Prioritized Implementation Roadmap

Classify work into:

**P0 — Essential verified UX defects**
- Schedule text clipping or unreadable overlapping records.
- Loss of essential room or schedule context.
- Other confirmed defects preventing core workflows.

**P1 — Core experience improvements**
- Better information hierarchy and date clarity.
- Mobile-responsive layout.
- Reliable map and schedule interactions across breakpoints.
- Other significant usability improvements.

**P2 — Optional refinements**
- Legends and additional filters.
- Marker clustering.
- My Schedule drawer.
- Free-gap indicators.
- Expanded weekly matrix.
- Other enhancements that testing demonstrates are valuable.

For each task, identify:

- Scope.
- Relevant files/components.
- Dependencies.
- Complexity, with justification.
- Regression risks.
- Required tests.

Do not invent precise time estimates without sufficient evidence.

### Part 8 — Acceptance Criteria

Provide testable acceptance criteria for every P0 and P1 task.

Include relevant cases such as:

- Concurrent records remain readable and individually accessible.
- Essential context remains available during long schedule scrolling.
- Switching rooms preserves the appropriate date and category.
- Floor switching does not leave stale selection state.
- Map controls remain reachable when the Bottom Sheet changes state.
- Search and marker selection remain synchronized.
- Existing navigation, save, calendar, My Schedule, and permission behavior remains intact.
- Long text, empty schedules, and partially overlapping events are handled correctly.
- The layout works at realistic desktop, tablet, portrait-mobile, and landscape-mobile dimensions.

Adapt these criteria to the actual implementation.

### Part 9 — Test Strategy

Identify existing tests that should remain valid, additional tests required, and scenarios requiring manual browser/device verification.

Cover:

- Schedule collision logic.
- Room and schedule state synchronization.
- Save and calendar actions.
- Map and floor interactions.
- Responsive layout.
- Touch gestures.
- Accessibility.
- Regression checks.

Separate tests actually executed from tests merely recommended.

### Part 10 — Final Recommendation

Conclude with:

1. Final recommended scope.
2. The first three implementation tasks.
3. Changes that can be made without API or architectural modifications.
4. Changes requiring deeper state, routing, or backend work.
5. Unresolved questions.
6. A concise go/no-go verdict.

---

## 8. Initial Review Rules

This stage is strictly analysis-only.

- Do not edit files.
- Do not modify configuration.
- Do not install dependencies.
- Do not run destructive commands.
- Do not create commits or pull requests.
- Do not implement any part of the redesign.
- Do not assume the research report is technically correct.
- Do not claim a test passed unless you actually ran it and observed the result.
- Do not invent source files, component names, API fields, or existing behavior.
- Do not turn optional enhancements into mandatory scope without evidence.
- If inspection is incomplete, explicitly state what remains unknown.

**The objective is to produce a technically grounded, evidence-based decision and implementation plan—not to rubber-stamp the proposal or begin coding.**

After completing all ten output sections, stop and wait for my explicit approval before making any repository changes.