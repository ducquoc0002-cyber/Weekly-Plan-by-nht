# Design Document — Frontend Refactor & Optimization

## Overview

This document describes the technical design for refactoring and optimizing the **Weekly Plan Website** — a Vanilla JS single-page application (no frameworks). The codebase consists of three files: `index.html`, `style.css`, and `script.js`.

The refactor is purely non-functional: no features are added or removed. The goals are:

1. **Mobile responsiveness** — full usability on Redmi Note 12 Pro 5G (360–412px viewport)
2. **Touch UX** — correct touch event handling for drag-and-drop without scroll interference
3. **Code hygiene** — English-only comments/text, zero dead code, consistent indentation
4. **DOM performance** — rAF batching, DocumentFragment rendering, 400ms debounce on save

The existing IIFE module pattern, State Store (`store`), and Scheduler (`scheduler`) are preserved without structural changes.

---

## Architecture

The application follows a single-file IIFE architecture with no build step:

```
index.html          ← markup + static UI text
style.css           ← all visual styles (CSS variables, layout, components, media queries)
script.js           ← all logic (IIFE wrapper containing store, scheduler, renderers, event handlers)
config.js           ← Supabase credentials (not modified)
```

### Module Boundaries (unchanged)

```
script.js (IIFE)
├── store          — centralized mutable state (getters/setters only)
├── scheduler      — debounce/throttle centre (uiUpdate, save, globalSave)
├── Renderers      — renderDays, renderHabits, initNotesUI, initAbbrUI, renderCalendar
├── Event handlers — initEventDelegation (single delegation root)
├── Data layer     — saveData, loadWeekData, saveGlobalData, loadGlobalDataFromDB
└── Utilities      — date helpers, autoResizeTextarea, _capitalizeFirstLetter
```

### Change Surface

| File | Change Type | Scope |
|---|---|---|
| `style.css` | Add media queries | `@media (max-width: 768px)` and `@media (max-width: 480px)` blocks |
| `style.css` | Refactor hover rules | Wrap in `@media (hover: hover)` |
| `style.css` | Touch target sizing | `min-height`, `touch-action` on interactive elements |
| `script.js` | Touch event rewrite | `touchstart`/`touchmove`/`touchend`/`touchcancel` handlers |
| `script.js` | Comment cleanup | Translate Vietnamese → English, remove dead code |
| `script.js` | UI text | Replace Vietnamese placeholder/title strings |
| `index.html` | Text replacement | `.abbr-header` cell text |
| `index.html` | Indentation | Normalize to 4-space indent throughout |
| `index.html` | Comment cleanup | Remove stale HTML comments |

---

## Components and Interfaces

### 1. CSS Responsive System

**Current state:** `style.css` has two breakpoints — `@media (max-width: 1200px)` (2-column grid) and `@media (max-width: 900px)` (summary body stacks). No mobile breakpoints exist below 900px.

**Target state:** Add two new breakpoint blocks:

```css
/* Breakpoint 1: tablet/mobile — 768px */
@media (max-width: 768px) {
    body { zoom: 1; padding: 10px 10px 30px; }
    .grid-container { grid-template-columns: 1fr; gap: 16px; }
    .grid-item { padding: 12px !important; }
    .modal-content { width: 95vw; max-height: 85vh; overflow-y: auto; }
    .summary-header__body { grid-template-columns: 1fr; }
    .monthly-charts { flex-direction: column; }
    .weekly-cols { grid-template-columns: repeat(3, 1fr); }
    .move-task-months { grid-template-columns: repeat(4, 1fr); }
    .move-task-days { grid-template-columns: repeat(4, 1fr); }
}

/* Breakpoint 2: compact mobile — 480px */
@media (max-width: 480px) {
    body { padding: 8px 8px 20px; }
    .page-main-title { font-size: 1.3em; letter-spacing: 2px; }
    .summary-header__quote-text { font-size: 13px; }
    .summary-header__stats-value { font-size: 28px; }
    .weekly-cols { grid-template-columns: repeat(2, 1fr); }
    .move-task-months { grid-template-columns: repeat(3, 1fr); }
    .month-picker__grid { grid-template-columns: repeat(4, 1fr); }
}
```

### 2. Touch Target Sizing

**Current state:** `.nav-btn` has `min-height: 44px` and `touch-action: manipulation`. `.auth-btn` and `.modal-close` have no `min-height` or `touch-action`. Modal inputs/selects have no `min-height`.

**Target state:**

```css
/* Touch targets — 48px minimum per WCAG 2.5.5 */
.nav-btn, .auth-btn, .modal-close {
    min-height: 48px;
    touch-action: manipulation;
}
.modal-content input,
.modal-content select {
    min-height: 48px;
}

/* Hover effects — only on pointer devices */
@media (hover: hover) {
    .nav-btn:hover { background: #fff; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
    .auth-btn:hover { background: var(--border-dark); }
    .summary-header__stats-item:hover { transform: translateY(-2px); box-shadow: var(--shadow-hover); }
    .greeting-text:hover { color: var(--border-color); }
    /* ... all other :hover rules moved here */
}
/* No hover rules outside @media (hover: hover) */
```

### 3. Touch Drag-and-Drop Rewrite

**Current state:** `touchstart` is `passive: true`, `touchmove` is `passive: true` (cannot call `preventDefault`). No drag threshold — drag starts immediately on touchstart. No `touchcancel` handler. No rAF throttling for clone position updates.

**Target state:**

```
touchstart (passive: true)
  → record startX, startY, taskItem reference
  → do NOT create clone yet (drag not confirmed)

touchmove (passive: false — required to call preventDefault)
  → if drag not confirmed:
      compute dx = |touch.clientX - startX|, dy = |touch.clientY - startY|
      if sqrt(dx²+dy²) >= 8px → confirm drag, create clone
      else → return (allow native scroll)
  → if drag confirmed:
      e.preventDefault()  ← suppress scroll
      schedule clone position update via rAF (one update per frame)

touchend (passive: true)
  → complete drop
  → cleanup: remove clone, reset _touchDragInfo, clear rAF handle

touchcancel
  → reset drag state to pre-drag values
  → remove clone, restore taskItem opacity
  → clear store.draggedTask
```

Key state variables added to the touch drag closure:

```js
let _touchStartX   = 0;
let _touchStartY   = 0;
let _touchDragConfirmed = false;
let _touchRafHandle = null;
```

### 4. Script Comment & Text Cleanup

All Vietnamese comments are translated to English. The full list of changes:

| Location | Before | After |
|---|---|---|
| Line ~147 | `/** Capitalize chữ đầu tiên của input, giữ nguyên cursor position */` | `/** Capitalize the first letter of an input while preserving cursor position */` |
| Line ~444 | `// Gán auth listener ngay khi trang load, không chờ login xong` | `// Attach auth listener immediately on page load` |
| Line ~485–487 | Vietnamese block comment about `_getSourceWeekForPersist` | English equivalent |
| Line ~491 | `// Lấy tất cả tuần không thuộc cùng tháng với target, sort giảm dần → lấy gần nhất` | `// Get all weeks not in the same month as target, sorted descending — pick the most recent` |
| Line ~517 | `// Chỉ copy tên habit, không copy trạng thái check` | `// Copy habit names only, not check states` |
| Line ~601 | `addBtn.title = 'Thêm dòng ghi chú'` | `addBtn.title = 'Add note'` |
| Line ~627 | `kInput.placeholder = 'Viết tắt'` | `kInput.placeholder = 'Abbreviation'` |
| Line ~631 | `vInput.placeholder = 'Nghĩa'` | `vInput.placeholder = 'Meaning'` |
| Line ~651 | `addBtn.title = 'Thêm từ viết tắt'` | `addBtn.title = 'Add abbreviation'` |
| Line ~1986 | `// chặn browser context menu` | `// prevent browser context menu` |
| Line ~1993–1996 | Vietnamese inline comments | English equivalents |
| Line ~2001 | `// ngăn checkbox tự toggle — menu sẽ xử lý thay` | `// prevent checkbox auto-toggle — menu handles it instead` |

### 5. HTML Cleanup

- `.abbr-header` cells: `"Viết tắt"` → `"Abbreviation"`, `"Nghĩa"` → `"Meaning"`
- All elements normalized to 4-space indentation
- Stale HTML comments (e.g., `<!-- Task action menu: shown on left-click checkbox -->`) evaluated — functional comments retained, purely descriptive ones removed
- `<meta name="viewport">` tag retained unchanged

---

## Data Models

No data model changes. The existing structures are preserved:

```js
// store.appData shape (unchanged)
{
  weeks: {
    "YYYY-MM-DD": {
      tasks:      { "t_name_d_t": string, "t_check_d_t": bool, ... },
      habits:     { "h_name_h": string, "h_check_h_d": bool },
      notes:      { "note_i": string },
      notesCount: number
    }
  },
  monthly: { "YYYY-MM": { mg_1..3, gr_name/target/actual/status_1..3 } },
  abbrs:   { "abbr_k_i": string, "abbr_v_i": string },
  abbrsCount: number,
  settings: { persistentNotes, persistentAbbr, persistentHabit, language }
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: CSS Variable Preservation

*For any* CSS variable declared in the original `:root` block (e.g., `--border-color`, `--font-main`, `--shadow-soft`), the refactored stylesheet must declare that same variable with the same value in `:root`.

**Validates: Requirements 1.3, 7.1**

---

### Property 2: Touch Target Compliance

*For any* element matching `.nav-btn`, `.auth-btn`, or `.modal-close`, the computed `min-height` must be at least 48px and `touch-action` must equal `manipulation`.

**Validates: Requirements 2.1, 2.2**

---

### Property 3: Drag State Cleanup

*For any* touch drag sequence (whether terminated by `touchend` or `touchcancel`), after the terminating event fires: `_touchDragInfo` must be `null`, `_touchClone` must be `null`, `store.draggedTask` must be `null`, and the dragged task element must have no inline `opacity` style.

**Validates: Requirements 3.3, 3.5**

---

### Property 4: English-Only Source Text

*For any* comment token or string literal in `script.js`, the text must contain only ASCII characters and standard Unicode punctuation — no Vietnamese diacritical characters (Unicode blocks Latin Extended Additional U+1E00–U+1EFF, Combining Diacritical Marks, or Vietnamese-specific precomposed characters).

**Validates: Requirements 4.1, 4.3**

---

### Property 5: DOM Attribute Preservation

*For any* `id`, `data-*`, or `aria-label` attribute value referenced in `script.js` (via `getElementById`, `querySelector`, `dataset`, or `getAttribute`), that attribute must exist on the corresponding element in `index.html`.

**Validates: Requirements 5.4**

---

### Property 6: DocumentFragment Rendering

*For any* list rendering function (`renderDays`, `renderHabits`, `initNotesUI`, `initAbbrUI`, `renderCalendar`), the function must use `document.createDocumentFragment()` to batch DOM insertions before appending to the live document.

**Validates: Requirements 6.2**

---

### Property 7: Debounce Correctness

*For any* sequence of N calls to `scheduler.save()` within a 400ms window, the underlying `saveData()` function must be invoked exactly once — after the last call's 400ms timer expires.

**Validates: Requirements 6.3**

---

### Property 8: IIFE Structure Preservation

*For any* version of the refactored `script.js`, the top-level IIFE wrapper must exist, `store` must expose the same getter/setter API surface as before, and `scheduler` must expose `uiUpdate`, `save`, and `globalSave` methods.

**Validates: Requirements 4.5**

---

## Error Handling

No new error paths are introduced. Existing error handling is preserved:

- **Supabase init failure** — caught in try/catch, falls back to localStorage
- **Network errors on load/save** — `showNetworkError()` banner, localStorage fallback
- **Touch drag on empty task** — early return if `nameEl.value.trim() === ''` (preserved)
- **touchcancel during drag** — new handler resets all drag state cleanly

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. They are complementary:

- **Unit tests** cover specific examples, integration points, and edge cases
- **Property tests** verify universal invariants across randomized inputs

Unit tests should be minimal — avoid testing what property tests already cover.

### Property-Based Testing Library

**Target:** Vanilla JS (no framework), browser environment.
**Library:** [fast-check](https://github.com/dubzzz/fast-check) — runs in Node.js and browser, no dependencies.

Each property test must run a **minimum of 100 iterations**.

Tag format for each test:
```
// Feature: frontend-refactor-optimization, Property N: <property_text>
```

### Property Tests

| Property | Test Description | fast-check Arbitraries |
|---|---|---|
| P1: CSS Variable Preservation | Generate list of expected variable names, assert each exists in parsed stylesheet with correct value | `fc.constantFrom(...cssVarNames)` |
| P2: Touch Target Compliance | For each matching selector, assert computed min-height ≥ 48px and touch-action = manipulation | `fc.constantFrom(...selectors)` |
| P3: Drag State Cleanup | Simulate random touchstart → touchend/touchcancel sequences, assert state is null after each | `fc.boolean()` (end vs cancel) |
| P4: English-Only Source | For any substring of script.js source, assert no Vietnamese Unicode codepoints present | `fc.integer({min:0, max:src.length-100})` |
| P5: DOM Attribute Preservation | For each ID referenced in script.js, assert document.getElementById returns non-null | `fc.constantFrom(...referencedIds)` |
| P6: DocumentFragment Rendering | For each render function, assert it calls createDocumentFragment before appending to live DOM | `fc.constantFrom(...renderFns)` |
| P7: Debounce Correctness | Call scheduler.save() N times (1–20) within 399ms, assert saveData called exactly once after 400ms | `fc.integer({min:1, max:20})` |
| P8: IIFE Structure | Assert store and scheduler expose required API surface after script loads | `fc.constantFrom(...apiKeys)` |

### Unit Tests

Specific examples and edge cases not covered by property tests:

1. **Breakpoint layout** — at 768px viewport, `.grid-container` computed `grid-template-columns` equals `"1fr"`
2. **Breakpoint layout** — at 480px viewport, `.page-main-title` font-size is smaller than at 769px
3. **Modal mobile** — at 768px, `.modal-content` width ≥ 95vw and has `overflow-y: auto`
4. **Hover media query** — `.nav-btn:hover` transform rule exists only inside `@media (hover: hover)` block
5. **Touch drag threshold** — touchmove with movement < 8px does not create clone or call preventDefault
6. **Touch drag threshold** — touchmove with movement ≥ 8px creates clone and calls preventDefault
7. **Viewport meta tag** — `index.html` contains `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
8. **Abbreviation header text** — `.abbr-header` first child text is "Abbreviation", second is "Meaning"
9. **Add note button title** — `addBtn.title === 'Add note'` in `initNotesUI`
10. **Add abbreviation button title** — `addBtn.title === 'Add abbreviation'` in `initAbbrUI`
11. **Abbreviation placeholders** — `kInput.placeholder === 'Abbreviation'`, `vInput.placeholder === 'Meaning'`
12. **No synchronous XHR** — `script.js` source does not contain `new XMLHttpRequest` or `XMLHttpRequest.open`
13. **Bento grid preserved** — default `.grid-container` rule has `grid-template-columns: repeat(4, 1fr)`
14. **Body zoom preserved** — `body` rule contains `zoom: 1.1`
15. **rAF in uiUpdate** — `scheduler.uiUpdate` calls `requestAnimationFrame`

### Regression Safety

Before and after each change:

1. Run the full test suite in a headless browser (e.g., Playwright or jsdom)
2. Manually verify on a 360px-wide viewport (Chrome DevTools mobile emulation — Redmi Note 12 Pro)
3. Manually verify drag-and-drop on desktop (mouse) still works after touch handler rewrite
4. Verify Supabase save/load cycle still functions (no structural changes to data layer)
