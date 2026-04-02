# Implementation Plan: Frontend Refactor & Optimization

## Overview

Refactor `style.css`, `script.js`, and `index.html` of the Weekly Plan Website for mobile responsiveness, touch UX correctness, code hygiene, and DOM performance. No features are added or removed. All changes are purely non-functional.

## Tasks

- [x] 1. Add mobile responsive breakpoints to style.css
  - Add `@media (max-width: 768px)` block: set `.grid-container` to `grid-template-columns: 1fr`, `.grid-item` padding ≤ 12px, `.modal-content` width ≥ 95vw with `overflow-y: auto` and `max-height: 85vh`, stack `.summary-header__body`, `.monthly-charts`, `.weekly-cols`, `.move-task-months`, `.move-task-days`
  - Add `@media (max-width: 480px)` block: reduce body padding, shrink `.page-main-title` font-size, `.summary-header__quote-text`, `.summary-header__stats-value`, adjust `.weekly-cols`, `.move-task-months`, `.month-picker__grid` column counts
  - Reset `body { zoom: 1; }` inside the 768px breakpoint (desktop `zoom: 1.1` must remain outside)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 1.1 Write property test for CSS Variable Preservation (Property 1)
    - **Property 1: CSS Variable Preservation** — for each variable in the original `:root` block, assert it exists with the same value after refactor
    - Use `fc.constantFrom(...cssVarNames)` over 100+ iterations
    - **Validates: Requirements 1.3, 7.1**
    - Tag: `// Feature: frontend-refactor-optimization, Property 1: CSS Variable Preservation`

  - [ ]* 1.2 Write unit tests for breakpoint layout
    - Test: at 768px viewport, `.grid-container` computed `grid-template-columns` equals `"1fr"`
    - Test: at 480px viewport, `.page-main-title` font-size is smaller than at 769px
    - Test: at 768px, `.modal-content` width ≥ 95vw and has `overflow-y: auto`
    - Test: default `.grid-container` rule has `grid-template-columns: repeat(4, 1fr)` (bento grid preserved)
    - Test: `body` rule contains `zoom: 1.1`
    - _Requirements: 1.1, 1.2, 1.3, 7.2, 7.3_

- [x] 2. Add touch target sizing and hover media query guards to style.css
  - Set `min-height: 48px` and `touch-action: manipulation` on `.nav-btn`, `.auth-btn`, `.modal-close`
  - Set `min-height: 48px` on `.modal-content input` and `.modal-content select`
  - Move all `:hover` rules (`.nav-btn:hover`, `.auth-btn:hover`, `.summary-header__stats-item:hover`, `.greeting-text:hover`, `.move-task-month-cell:hover`, `.move-task-week-cell:hover`, `.move-task-day-cell:hover`, `.week-card` hover, etc.) inside `@media (hover: hover)` block
  - Remove any `:hover` rules that remain outside `@media (hover: hover)`
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 2.1 Write property test for Touch Target Compliance (Property 2)
    - **Property 2: Touch Target Compliance** — for each selector in `['.nav-btn', '.auth-btn', '.modal-close']`, assert computed `min-height ≥ 48px` and `touch-action === 'manipulation'`
    - Use `fc.constantFrom(...selectors)` over 100+ iterations
    - **Validates: Requirements 2.1, 2.2**
    - Tag: `// Feature: frontend-refactor-optimization, Property 2: Touch Target Compliance`

  - [ ]* 2.2 Write unit test for hover media query guard
    - Test: `.nav-btn:hover` transform rule exists only inside `@media (hover: hover)` block in the parsed stylesheet
    - _Requirements: 2.3, 2.4_

- [x] 3. Checkpoint — Ensure all CSS tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Rewrite touch drag-and-drop handlers in script.js
  - Add closure variables `_touchStartX`, `_touchStartY`, `_touchDragConfirmed`, `_touchRafHandle` to the touch drag section
  - Change `touchstart` listener to `passive: true` — record `startX`, `startY`, task element reference; do NOT create clone yet
  - Change `touchmove` listener to `passive: false` — if drag not confirmed, compute distance; if ≥ 8px confirm drag and create clone; if confirmed call `e.preventDefault()` and schedule clone position update via `requestAnimationFrame` (one rAF per frame, cancel previous handle)
  - Update `touchend` handler — complete drop, remove clone, reset `_touchDragInfo = null`, `_touchClone = null`, `store.draggedTask = null`, clear rAF handle, restore task element opacity
  - Add `touchcancel` handler — reset all drag state to pre-drag values, remove clone, restore task element opacity, clear `store.draggedTask`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 4.1 Write property test for Drag State Cleanup (Property 3)
    - **Property 3: Drag State Cleanup** — simulate random touchstart → touchend/touchcancel sequences; after each terminating event assert `_touchDragInfo === null`, `_touchClone === null`, `store.draggedTask === null`, no inline opacity on task element
    - Use `fc.boolean()` (end vs cancel) over 100+ iterations
    - **Validates: Requirements 3.3, 3.5**
    - Tag: `// Feature: frontend-refactor-optimization, Property 3: Drag State Cleanup`

  - [ ]* 4.2 Write unit tests for touch drag threshold
    - Test: touchmove with movement < 8px does not create clone and does not call `preventDefault`
    - Test: touchmove with movement ≥ 8px creates clone and calls `preventDefault`
    - Test: `scheduler.uiUpdate` calls `requestAnimationFrame`
    - _Requirements: 3.1, 3.2, 3.4_

- [x] 5. Translate all Vietnamese comments and strings in script.js to English
  - Translate comment at `_capitalizeFirstLetter`: `"Capitalize chữ đầu tiên..."` → `"Capitalize the first letter of an input while preserving cursor position"`
  - Translate comment at `window.onload`: `"Gán auth listener ngay khi trang load..."` → `"Attach auth listener immediately on page load"`
  - Translate block comment above `_getSourceWeekForPersist` (lines ~485–487) to English equivalent
  - Translate inline comment `"Lấy tất cả tuần không thuộc cùng tháng..."` → `"Get all weeks not in the same month as target, sorted descending — pick the most recent"`
  - Translate comment `"Chỉ copy tên habit, không copy trạng thái check"` → `"Copy habit names only, not check states"`
  - Translate comment `"chặn browser context menu"` → `"prevent browser context menu"`
  - Translate remaining Vietnamese inline comments in the context menu / event delegation section
  - Replace `addBtn.title = 'Thêm dòng ghi chú'` → `'Add note'` in `initNotesUI`
  - Replace `kInput.placeholder = 'Viết tắt'` → `'Abbreviation'` and `vInput.placeholder = 'Nghĩa'` → `'Meaning'` in `_createAbbrRow`
  - Replace `addBtn.title = 'Thêm từ viết tắt'` → `'Add abbreviation'` in `initAbbrUI`
  - Remove any Dead_Code (commented-out code blocks with no active reference)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 8.3, 8.4, 8.5_

  - [ ]* 5.1 Write property test for English-Only Source Text (Property 4)
    - **Property 4: English-Only Source Text** — for random substrings of `script.js` source, assert no Vietnamese diacritical codepoints (U+1E00–U+1EFF range) are present
    - Use `fc.integer({min: 0, max: src.length - 100})` over 100+ iterations
    - **Validates: Requirements 4.1, 4.3**
    - Tag: `// Feature: frontend-refactor-optimization, Property 4: English-Only Source Text`

  - [ ]* 5.2 Write unit tests for English string replacements
    - Test: `addBtn.title === 'Add note'` in `initNotesUI`
    - Test: `addBtn.title === 'Add abbreviation'` in `initAbbrUI`
    - Test: `kInput.placeholder === 'Abbreviation'` and `vInput.placeholder === 'Meaning'` in `_createAbbrRow`
    - _Requirements: 8.3, 8.4, 8.5_

- [x] 6. Checkpoint — Ensure all script.js tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Clean up index.html
  - Replace `.abbr-header` cell text: `"Viết tắt"` → `"Abbreviation"`, `"Nghĩa"` → `"Meaning"`
  - Normalize all HTML elements to 4-space indentation throughout the file
  - Remove stale HTML comments (e.g., `<!-- Task action menu: shown on left-click checkbox -->`) — retain only comments with active functional value
  - Verify `<meta name="viewport" content="width=device-width, initial-scale=1.0">` is unchanged
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 8.1, 8.2_

  - [ ]* 7.1 Write property test for DOM Attribute Preservation (Property 5)
    - **Property 5: DOM Attribute Preservation** — for each `id` referenced in `script.js` via `getElementById`/`querySelector`, assert `document.getElementById(id)` returns non-null in the loaded document
    - Use `fc.constantFrom(...referencedIds)` over 100+ iterations
    - **Validates: Requirements 5.4**
    - Tag: `// Feature: frontend-refactor-optimization, Property 5: DOM Attribute Preservation`

  - [ ]* 7.2 Write unit tests for HTML cleanup
    - Test: `.abbr-header` first child text is `"Abbreviation"`, second is `"Meaning"`
    - Test: `index.html` contains `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
    - _Requirements: 5.3, 8.1, 8.2_

- [x] 8. Verify DocumentFragment usage and debounce correctness in script.js
  - Confirm `renderDays`, `renderHabits`, `initNotesUI`, `initAbbrUI`, `renderCalendar` each use `document.createDocumentFragment()` before appending to the live DOM — add fragment batching to any function that is missing it
  - Confirm `scheduler.save()` debounces `saveData()` by exactly 400ms — adjust if the timer value has drifted
  - Confirm `scheduler.uiUpdate` uses `requestAnimationFrame` (already present — verify not broken by touch rewrite)
  - Confirm no synchronous `XMLHttpRequest` calls exist in `script.js`
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 8.1 Write property test for DocumentFragment Rendering (Property 6)
    - **Property 6: DocumentFragment Rendering** — for each render function, assert it calls `createDocumentFragment` before appending to the live document
    - Use `fc.constantFrom(...renderFns)` over 100+ iterations
    - **Validates: Requirements 6.2**
    - Tag: `// Feature: frontend-refactor-optimization, Property 6: DocumentFragment Rendering`

  - [ ]* 8.2 Write property test for Debounce Correctness (Property 7)
    - **Property 7: Debounce Correctness** — call `scheduler.save()` N times (1–20) within 399ms, assert `saveData` called exactly once after 400ms timer expires
    - Use `fc.integer({min: 1, max: 20})` over 100+ iterations
    - **Validates: Requirements 6.3**
    - Tag: `// Feature: frontend-refactor-optimization, Property 7: Debounce Correctness`

  - [ ]* 8.3 Write unit tests for DOM performance
    - Test: `script.js` source does not contain `new XMLHttpRequest` or `XMLHttpRequest.open`
    - _Requirements: 6.4_

- [x] 9. Verify IIFE structure and API surface preservation in script.js
  - Confirm the top-level IIFE wrapper is intact after all edits
  - Confirm `store` exposes the same getter/setter API surface (currentUser, appData, state, weekDates, draggedTask, etc.)
  - Confirm `scheduler` exposes `uiUpdate`, `save`, and `globalSave` methods
  - _Requirements: 4.5_

  - [ ]* 9.1 Write property test for IIFE Structure Preservation (Property 8)
    - **Property 8: IIFE Structure Preservation** — assert `store` and `scheduler` expose required API keys after script loads
    - Use `fc.constantFrom(...apiKeys)` over 100+ iterations
    - **Validates: Requirements 4.5**
    - Tag: `// Feature: frontend-refactor-optimization, Property 8: IIFE Structure Preservation`

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Manually verify on 360px-wide viewport (Chrome DevTools mobile emulation — Redmi Note 12 Pro) that layout stacks correctly and no horizontal scroll appears
  - Manually verify drag-and-drop on desktop (mouse) still works after touch handler rewrite
  - _Requirements: 1.1–1.6, 2.1–2.4, 3.1–3.5, 4.1–4.5, 5.1–5.4, 6.1–6.4, 7.1–7.4, 8.1–8.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP pass
- Each task references specific requirements for traceability
- Property tests use [fast-check](https://github.com/dubzzz/fast-check) — runs in Node.js and browser, no dependencies
- Each property test must run a minimum of 100 iterations
- Checkpoints ensure incremental validation after each major file change
- The IIFE module pattern, `store`, and `scheduler` must remain structurally unchanged throughout
