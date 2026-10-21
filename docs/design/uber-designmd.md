# Design System Inspired by Uber — Perimeter source of truth

> Derived from the DesignMD page **"Design System Inspired by Uber"**: <https://designmd.me/discover/uber/raw>
> Section structure, hierarchy and token values follow that document. Section 10 maps the tokens onto this
> repository (Tailwind v4 theme in `frontend/src/index.css`). Issue: #137.
>
> **Light theme only.** The UI never follows the OS colour scheme and must never grow a dark variant
> (guarded by `frontend/src/test/lightTheme.vitest.ts`).

## 1. Visual Theme & Atmosphere

Bold, efficient, accessible. A high-contrast monochrome foundation (pure black on pure white) with a single
electric-blue accent reserved for interaction. Confident typography, generous whitespace, minimal and controlled
shadows, square containers and pill-shaped buttons.

Key characteristics:

- Black and white carry ~90 % of the interface; blue appears only on primary CTAs, links and focus states.
- Headings are bold (700) display type; body and UI text is regular/medium (400/500).
- Spacing is an 8 px system with large gaps between major sections.
- Every colour pairing targets WCAG AA; touch targets are at least 44 px.

## 2. Color Palette & Roles

### Primary

| Role        | Hex       | Usage                                               |
| ----------- | --------- | --------------------------------------------------- |
| Primary CTA | `#0000EE` | links, primary interactive elements, focus, emphasis |

### Interactive

| Role             | Hex       |
| ---------------- | --------- |
| Primary button   | `#000000` |
| Secondary button | `#FFFFFF` (black text, 1 px black border) |
| Tertiary button  | `#EEEEEE` |

### Neutral Scale

| Role            | Hex       | Usage                                  |
| --------------- | --------- | -------------------------------------- |
| Dominant text   | `#000000` | all primary copy                       |
| Secondary text  | `#333333` | supporting copy, subheadings           |
| Tertiary text   | `#757575` | placeholders, hints, disabled text     |
| Quaternary text | `#5E5E5E` | very light hierarchy levels            |
| Border / divider| `#767676` | input underline, dividers              |

### Surface & Borders

| Role              | Hex       | Usage                                   |
| ----------------- | --------- | --------------------------------------- |
| Primary surface   | `#FFFFFF` | pages, cards                            |
| Secondary surface | `#F3F3F3` | sections, form containers               |
| Search surface    | `#F6F6F6` | search input background                 |
| Tertiary surface  | `#4A4A4A` | footer / dark content blocks            |
| Soft border       | `#D8D8D8` | cards, dropdowns, boxed inputs          |

## 3. Typography Rules

### Font Family

- **Display** (headings 20 px and larger): UberMove → in this repo **Plus Jakarta Sans + Prompt**, weight 700.
- **Text** (body, buttons, UI): UberMoveText → in this repo **Plus Jakarta Sans + Prompt**, weights 400 / 500.

Both Uber fonts are proprietary and have no Thai glyphs, so the two open fonts already in the project carry
the two roles. Only weights 400, 500 and 700 are loaded.

### Hierarchy

| Role                    | Size | Weight | Line height | Letter spacing | Tailwind utility |
| ----------------------- | ---- | ------ | ----------- | -------------- | ---------------- |
| Display / H1            | 52px | 700    | 64px        | 0              | `text-display`   |
| Heading / H2            | 36px | 700    | 44px        | 0              | `text-h2`        |
| Subheading / H3 (large) | 24px | 700    | 32px        | 0              | `text-h3`        |
| Subheading / H3 (medium)| 20px | 700    | 28px        | 0              | `text-h3-sm`     |
| Label / H4              | 18px | 500    | 24px        | 0              | `text-label`     |
| Body                    | 16px | 400    | 24px        | 0              | `text-body`      |
| Button / Label          | 14px | 500    | 20px\*      | 0              | `text-button`    |

\* DesignMD lists 16 px; Thai vowel marks clip below 20 px, so the button line height is 20 px here.

### Principles

- `h1`–`h3` use the display family at 700 (set globally in `index.css`).
- Line height always exceeds the font size by at least 20 %.
- No letter spacing; no weights other than 400 / 500 / 700.
- 12 px (`text-xs`) is allowed only for captions and metadata, never for buttons or labels.

## 4. Component Stylings

### Buttons

All buttons: pill (`border-radius: 999px`), 14 px / 500, padding `10px 12px`, height 36–38 px
(44 px and `12px 16px` on phones). Classes: `btn` plus one variant.

| Variant   | Class           | Resting                          | Hover     | Active                        | Disabled                       |
| --------- | --------------- | -------------------------------- | --------- | ----------------------------- | ------------------------------ |
| Primary   | `btn-primary`   | `#000000` bg, white text         | `#333333` | `#000000` + floating shadow   | `#EEEEEE` bg, `#757575` text   |
| Secondary | `btn-secondary` | white bg, black text, black 1px  | `#F3F3F3` | `#E8E8E8` + raised shadow     | `#D8D8D8` border, `#757575`    |
| Tertiary  | `btn-tertiary`  | `#EEEEEE` bg, black text         | `#E0E0E0` | `#D8D8D8`                     | `#757575` text                 |
| Ghost     | `btn-ghost`     | transparent, `#333333` text      | `#EEEEEE` | `#E0E0E0`                     | `#757575` text                 |
| Nav link  | `btn-nav`       | transparent on black, white text | `#E8E8E8` text | `#EEEEEE` text           | —                              |
| On dark   | `btn-on-dark`   | white bg, black text (on nav)    | `#F3F3F3` | `#E8E8E8`                     | —                              |

Modifiers: `btn-icon` (40 px circle), `btn-icon-sm` (32 px circle), `btn-lg` (44 px, 16 px text),
`btn-sm` (32 px, 12 px text, dense chrome only).

### Links

`link`: `#0000EE`, underlined, hover `#0000BB`, active `#0000AA`.

### Input Fields & Forms

| Kind            | Class          | Resting                                         | Focus                                  |
| --------------- | -------------- | ----------------------------------------------- | -------------------------------------- |
| Text (default)  | `input`        | transparent, 1 px bottom border `#767676`, 44px | 2 px bottom indicator `#0000EE`        |
| Search          | `input-search` | `#F6F6F6` bg, no border, radius 0, min 40 px    | white bg, 1 px border `#0000EE`        |
| Boxed/date/time | `input-boxed`  | white, 1 px `#D8D8D8`, radius 0, 44 px          | `#0000EE` border + 2 px 10 % blue ring |

Placeholder text is `#757575`; disabled fields use `#EEEEEE` / `#757575`. Field labels use `label`
(14 px / 500).

### Navigation

- Top bar: `#000000`, 64 px tall, `position: fixed; top: 0; z-index: 100`, flex space-between.
- Links in the bar: white 14 px, hover `#EEEEEE`, active `#0000EE`.
- Dropdown (`dropdown`): white, 1 px `#D8D8D8`, radius 0, floating shadow, `z-index: 101`, min 200 px.

### Cards & Containers

- Card (`card`): white, 1 px `#D8D8D8`, radius 0, padding 20–24 px; `card-hover` adds the raised shadow.
- Section (`surface`): `#F3F3F3`, radius 0, no border, padding 32–64 px.
- Modal overlay (`modal-overlay`): `rgba(0,0,0,0.5)`, fixed, `z-index: 2001`.
- Modal dialog (`modal`): white, radius 0, padding 24–32 px, modal shadow, `z-index: 2002`, max 500 px.

## 5. Layout Principles

### Spacing System

Base unit 8 px. Scale: 4, 8, 12, 16, 20, 24, 28, 32, 36, 64, 80.

- 4–8: icons, badges, inline elements
- 12–16: form fields, buttons, navigation items
- 20–32: content sections, card padding
- 36–80: major layout sections, hero blocks

### Grid & Container

Max width 1440 px. 12 columns on desktop, 6 on tablet, 1 on mobile; 16 px gutters. Container padding
20 px (mobile) / 32 px (tablet) / 40 px (desktop).

### Whitespace Philosophy

Large margins between sections create hierarchy; dense forms use the tighter 12–16 px steps.

### Border Radius Scale

| Radius | Use                                             |
| ------ | ----------------------------------------------- |
| 0      | inputs, cards, modals, tables, most containers  |
| 8 px   | optional secondary surfaces                     |
| 50 %   | icon buttons, avatars                           |
| 999 px | buttons, pills, badges                          |

### Border Widths

1 px for inputs, borders and dividers; 2 px for focus and active indicators; none on most cards.

## 6. Depth & Elevation

| Level               | Shadow                        | Tailwind          | Use                                  |
| ------------------- | ----------------------------- | ----------------- | ------------------------------------ |
| Base / Ground       | none                          | —                 | surfaces, cards, backgrounds         |
| Hover / Raised      | `0 2px 8px rgba(0,0,0,0.08)`  | `shadow-raised`   | button and card hover                |
| Floating / Elevated | `0 2px 8px rgba(0,0,0,0.16)`  | `shadow-floating` | active buttons, dropdowns, tooltips  |
| Modal / Dialog      | `0 8px 24px rgba(0,0,0,0.24)` | `shadow-modal`    | modals, important dialogs            |

Never stack shadows; one per element.

### Opacity Levels

1.0 primary content · 0.8 secondary / hover · 0.5 disabled content and overlays · 0.2 disabled states and hints.

### Z-index / Layering

| Layer              | z-index | Tailwind  |
| ------------------ | ------- | --------- |
| Base               | 1       | `z-1`     |
| Elevated           | 2       | `z-2`     |
| Sticky / Fixed nav | 100     | `z-100`   |
| Dropdown / Popover | 101     | `z-101`   |
| Modal overlay      | 2001    | `z-2001`  |
| Modal dialog       | 2002    | `z-2002`  |
| Toast              | 2003    | `z-2003`  |

## 7. Do's and Don'ts

### Do

- Build on pure black and pure white; use `#0000EE` sparingly for primary interaction.
- Keep button padding at `10px 12px` and the 999 px pill radius.
- Keep inputs at least 44 px tall with a 1 px border and a 2 px focus indicator.
- Keep 20–32 px padding inside cards and 36–64 px between major sections.
- Pair every colour with text or an icon; test combinations for WCAG AA (4.5:1 text, 3:1 UI).

### Don't

- Don't override the pill radius on buttons or shrink them below 36 px.
- Don't mix display and text fonts arbitrarily; display is for headings 20 px and up.
- Don't add more than one shadow per element.
- Don't use hex colours outside the palette (see the functional-colour exception in section 10).
- Don't set line height below 120 % of the font size.
- Don't use opacity to de-emphasise text; use a lighter grey instead.
- Don't nest modals or extend the z-index scale beyond 2003.

## 8. Responsive Behavior

### Breakpoints

| Name          | Width          | Key changes                                                     |
| ------------- | -------------- | --------------------------------------------------------------- |
| Mobile        | 320–767 px     | single column, 20 px padding, 14 px base font, stacked nav      |
| Tablet        | 768–1023 px    | two columns where useful, 24 px padding, simplified nav         |
| Desktop       | 1024–1439 px   | full grid, 32 px padding, full nav                              |
| Large desktop | 1440 px+       | centred 1440 px container, 40 px padding                        |

The map workspace keeps its own 640 px switch (`useIsDesktop`) between the bottom sheet and the side panel.

### Touch Targets

Minimum 44 × 44 px, 48 px recommended for frequent actions, at least 8 px between targets. Buttons scale to
`12px 16px` padding on phones (`.btn` media rule in `index.css`).

### Collapsing Strategy

- Hero: padding 64 → 40 → 20 px; H1 52 → 36 → 28 px.
- Two-column layouts stack at the tablet breakpoint; forms are full width below desktop and max 400 px on it.
- Navigation collapses to the account/hamburger control at 768 px.
- Button groups stack vertically and full width on mobile.
- Every margin and padding drops one step per breakpoint (24 → 20 → 16).

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA / link: `#0000EE` · Primary button: `#000000` · Secondary button: `#FFFFFF`
- Tertiary button: `#EEEEEE` · Primary text: `#000000` · Secondary text: `#333333`
- Tertiary text / placeholder: `#757575` · Surface: `#FFFFFF` · Secondary surface: `#F3F3F3`
- Border / divider: `#767676` (strong) and `#D8D8D8` (soft)

### Iteration Guide

1. Start every screen in black and white; add blue only for the primary action, links and focus.
2. Buttons are pills; icon buttons are circles; cards, inputs and modals are square.
3. Inputs are at least 44 px tall; buttons at least 36 px (44 px on phones).
4. Two font roles, three weights, 8 px spacing, three shadows, one z-index scale.
5. Collapse to one column and a hamburger/account control at 768 px.

## 10. Perimeter mapping (this repository)

Tokens live in `frontend/src/index.css` under `@theme static`; component recipes under `@layer components`.

| Token            | Value     | Utilities                                      |
| ---------------- | --------- | ---------------------------------------------- |
| `ink`            | `#000000` | `text-ink`, `bg-ink`, `border-ink`             |
| `ink-2`          | `#333333` | `text-ink-2`, `hover:bg-ink-2`                 |
| `ink-3`          | `#757575` | `text-ink-3`, `placeholder:text-ink-3`         |
| `ink-4`          | `#5E5E5E` | `text-ink-4`                                   |
| `line`           | `#767676` | `border-line`, `divide-line`                   |
| `line-soft`      | `#D8D8D8` | `border-line-soft`, `divide-line-soft`         |
| `surface`        | `#FFFFFF` | `bg-surface` (or `bg-white`)                   |
| `surface-2`      | `#F3F3F3` | `bg-surface-2`                                 |
| `surface-3`      | `#4A4A4A` | `bg-surface-3`                                 |
| `search`         | `#F6F6F6` | `bg-search`                                    |
| `tertiary`       | `#EEEEEE` | `bg-tertiary` (+ `-hover`, `-active`)          |
| `secondary-active` | `#E8E8E8` | `bg-secondary-active`                        |
| `accent`         | `#0000EE` | `text-accent`, `bg-accent`, `border-accent`, `ring-accent` (+ `-hover`, `-active`) |

Recipes: `btn` + variant/modifier · `input`, `input-search`, `input-boxed`, `label` · `card`, `card-hover`,
`surface`, `dropdown`, `modal-overlay`, `modal`, `chip`, `link`.

Rules of thumb while migrating a component:

- `text-slate-900/800` → `text-ink`; `text-slate-700/600` → `text-ink-2`; `text-slate-500/400` → `text-ink-3`.
- `bg-slate-50/100` → `bg-surface-2`; `bg-slate-200` → `bg-tertiary`; `bg-slate-900/950` → `bg-ink`.
- `border-slate-*` → `border-line-soft` (cards, hairlines) or `border-line` (input underline).
- Any `rose-*` accent (CTA, link, active, badge) → `accent` or plain `ink`; never red.
- `rounded-xl/2xl/3xl` on cards, inputs, modals, sheets → `rounded-none`; on buttons/badges → `rounded-full`.
- `shadow-sm/md/lg/xl/2xl` → `shadow-raised` / `shadow-floating` / `shadow-modal`; drop `ring-*` glows.
- `z-10/20/30/40/50` → the scale in section 6.
- `backdrop-blur-*`, gradients and decorative auras are removed.
- Status messages (error, warning, success) are monochrome: `card` + icon + text (`border-ink` for errors).

**Functional-colour exception.** Room-category colours (`CATEGORY_COLORS`, `CATEGORY_PIN_COLORS` in
`frontend/src/services/roomDisplay.ts`) and the floor-plan artwork (2D SVG, 3D GLB) encode data and stay as
they are. They are always paired with an icon or label.
