# Requirements Document

## Introduction

This spec covers the refactoring and optimization of the **Weekly Plan Website** — a Vanilla JS single-page application built with HTML, CSS, and plain JavaScript (no frameworks). The project uses a Bento Grid layout, Supabase for cloud sync, and an IIFE/State Store architecture.

The goal is to improve code quality, mobile responsiveness, and runtime performance **without changing any core features**. Target environments are:
- **Desktop**: Asus TUF Gaming A15 — smooth DOM performance, no jank when multiple tabs are open.
- **Mobile**: Redmi Note 12 Pro 5G — 100% responsive UI, comfortable touch targets, smooth drag & drop.

No third-party libraries will be added. The existing Debounce/Throttle scheduler, IIFE module pattern, and State Store architecture must be preserved.

---

## Glossary

- **Dashboard**: The main single-page application rendered in `index.html`.
- **Stylesheet**: The `style.css` file containing all visual styles.
- **Script**: The `script.js` file containing all application logic.
- **Grid_Container**: The `.grid-container` CSS class implementing the Bento Grid layout.
- **Grid_Item**: A `.grid-item` element representing one panel in the Bento Grid.
- **Modal**: Any `.modal-overlay` / `.modal-content` overlay dialog.
- **Touch_Target**: An interactive element (button, input, select) that must be reachable by a finger on a touchscreen.
- **Scheduler**: The `scheduler` IIFE object in `script.js` that manages debounce/throttle for UI updates and saves.
- **State_Store**: The `store` IIFE object in `script.js` that holds all mutable application state.
- **IIFE**: Immediately Invoked Function Expression — the top-level module wrapper in `script.js`.
- **Hover_Effect**: A CSS rule triggered by `:hover` pseudo-class (e.g., `transform: translateY(-2px)`).
- **Breakpoint**: A CSS `@media` query threshold that changes layout at a specific viewport width.
- **CSS_Variable**: A custom property declared in `:root` (e.g., `--border-color`).
- **Comment**: Any inline `//`, block `/* */` (CSS/JS), or `<!-- -->` (HTML) annotation in source code.
- **Dead_Code**: Commented-out code blocks that are no longer active or referenced.
- **Vietnamese_Comment**: A source code comment written in Vietnamese language.

---

## Requirements

### Requirement 1: CSS Responsive Breakpoints

**User Story:** As a mobile user on Redmi Note 12 Pro 5G, I want the Dashboard layout to adapt to my screen size, so that I can read and interact with all content without horizontal scrolling or overlapping elements.

#### Acceptance Criteria

1. WHEN the viewport width is 768px or less, THE Stylesheet SHALL set `.grid-container` to `grid-template-columns: 1fr` so all Grid_Items stack in a single column.
2. WHEN the viewport width is 480px or less, THE Stylesheet SHALL apply a second Breakpoint that further reduces padding and font sizes for compact mobile screens.
3. THE Stylesheet SHALL preserve all existing CSS_Variables and the Bento Grid visual design on viewports wider than 768px.
4. WHEN the viewport width is 768px or less, THE Stylesheet SHALL reduce `.grid-item` padding to a value no greater than 12px on all sides.
5. WHEN the viewport width is 768px or less, THE Stylesheet SHALL set `.modal-content` width to at least 95% of the viewport width.
6. WHEN the viewport width is 768px or less, THE Stylesheet SHALL ensure `.modal-content` has `overflow-y: auto` and a `max-height` that prevents the modal from exceeding the visible screen area.

---

### Requirement 2: Touch Target Sizing

**User Story:** As a mobile user, I want all interactive controls to be large enough to tap accurately, so that I do not accidentally trigger the wrong action.

#### Acceptance Criteria

1. THE Stylesheet SHALL set `min-height: 48px` on `.nav-btn`, `.auth-btn`, `.modal-close`, and all `input` and `select` elements within modals.
2. THE Stylesheet SHALL set `touch-action: manipulation` on `.nav-btn`, `.auth-btn`, and `.modal-close` to eliminate the 300ms tap delay on touch devices.
3. WHERE the device supports hover (`@media (hover: hover)`), THE Stylesheet SHALL apply Hover_Effects such as `transform: translateY(-2px)` and `box-shadow` changes.
4. WHERE the device does not support hover (`@media (hover: none)`), THE Stylesheet SHALL NOT apply any Hover_Effect rules, preventing unintended sticky hover states on touch devices.

---

### Requirement 3: Touch Event Handling in Script

**User Story:** As a mobile user performing drag-and-drop or scrolling, I want touch interactions to feel smooth and not interfere with native scroll, so that the app is comfortable to use on a small touchscreen.

#### Acceptance Criteria

1. WHEN a `touchstart` event fires on a draggable task element, THE Script SHALL record the initial touch position without calling `preventDefault()` unless a drag gesture is confirmed.
2. WHEN a `touchmove` event fires and a drag gesture has been confirmed (movement exceeds a threshold of 8px), THE Script SHALL call `preventDefault()` to suppress native scroll only during active drag.
3. WHEN a `touchend` event fires, THE Script SHALL complete the drop action and release all touch locks within the same event tick.
4. WHILE a touch drag is in progress, THE Script SHALL use `requestAnimationFrame` to throttle DOM position updates to one update per animation frame.
5. IF a `touchcancel` event fires during a drag, THEN THE Script SHALL reset the drag state to its pre-drag values and remove any drag-related CSS classes.

---

### Requirement 4: JavaScript Code Cleanup

**User Story:** As a developer maintaining this codebase, I want all comments to be in English and all dead code to be removed, so that the code is easy to read and understand without language barriers.

#### Acceptance Criteria

1. THE Script SHALL contain zero Vietnamese_Comments after refactoring; every comment must be written in English.
2. THE Script SHALL contain zero Dead_Code blocks (commented-out code that is no longer executed).
3. THE Script SHALL use English-only identifiers for all variable names, function names, and object property names.
4. WHEN a comment is retained, THE Script SHALL express it concisely in no more than one line unless a multi-line block comment is required for section headers.
5. THE Script SHALL preserve the existing IIFE module wrapper, State_Store structure, and Scheduler object without structural changes.

---

### Requirement 5: HTML Document Cleanup

**User Story:** As a developer, I want `index.html` to be consistently indented and free of stale comments, so that the markup is easy to navigate and maintain.

#### Acceptance Criteria

1. THE Dashboard SHALL have all HTML elements indented with 4 spaces per nesting level throughout `index.html`.
2. THE Dashboard SHALL contain zero HTML Comment blocks that describe removed features, old implementations, or temporary notes with no current value.
3. THE Dashboard SHALL retain the `<meta name="viewport" content="width=device-width, initial-scale=1.0">` tag unchanged.
4. THE Dashboard SHALL retain all functional `id` attributes, `data-*` attributes, and `aria-label` attributes that are referenced by `script.js` or `style.css`.

---

### Requirement 6: DOM Performance — Desktop

**User Story:** As a desktop user with multiple browser tabs open, I want the Dashboard to update the UI without causing frame drops, so that interactions feel instant and smooth.

#### Acceptance Criteria

1. THE Script SHALL batch all DOM writes for a single day column into one `requestAnimationFrame` callback via the Scheduler's `uiUpdate` method.
2. THE Script SHALL use `DocumentFragment` for all list rendering operations (task list, habit table, notes, abbreviations) to minimize reflow.
3. WHEN the Scheduler's `save` method is called, THE Script SHALL debounce the actual `saveData` execution by 400ms so that rapid keystrokes do not trigger multiple synchronous DOM reads.
4. THE Script SHALL NOT introduce any synchronous `XMLHttpRequest` calls or blocking loops that iterate over the full DOM on every keystroke.

---

### Requirement 7: CSS Variable and Design System Preservation

**User Story:** As a designer, I want the visual identity (colors, typography, Bento Grid aesthetic) to remain unchanged after refactoring, so that the user experience is consistent.

#### Acceptance Criteria

1. THE Stylesheet SHALL retain all CSS_Variables declared in `:root` with their original names and values.
2. THE Stylesheet SHALL retain the Bento Grid layout (`grid-template-columns: repeat(4, 1fr)`) on viewports wider than 1200px.
3. THE Stylesheet SHALL retain the `zoom: 1.1` rule on `body` for desktop scaling.
4. IF a CSS rule is removed during cleanup, THEN THE Stylesheet SHALL only remove rules that are confirmed to have no matching HTML elements or are exact duplicates.

---

### Requirement 8: Abbreviation UI — Language Neutrality

**User Story:** As a developer reviewing the HTML, I want all visible UI text in the source code to be in English or language-neutral, so that the codebase is consistent with the English-first standard.

#### Acceptance Criteria

1. THE Dashboard SHALL replace the Vietnamese placeholder text `"Viết tắt"` in `.abbr-header` with the English equivalent `"Abbreviation"`.
2. THE Dashboard SHALL replace the Vietnamese placeholder text `"Nghĩa"` in `.abbr-header` with the English equivalent `"Meaning"`.
3. THE Script SHALL replace Vietnamese `placeholder` attribute values in dynamically created abbreviation input elements with their English equivalents (`"Abbreviation"` and `"Meaning"`).
4. THE Script SHALL replace the Vietnamese `title` attribute `"Thêm từ viết tắt"` on the add-abbreviation button with `"Add abbreviation"`.
5. THE Script SHALL replace the Vietnamese `title` attribute `"Thêm dòng ghi chú"` on the add-note button with `"Add note"`.
