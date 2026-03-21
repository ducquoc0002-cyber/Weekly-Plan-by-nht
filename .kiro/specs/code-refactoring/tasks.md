# Implementation Plan

- [x] 1. CSS Refactoring - Variables and Section Organization
  - Add 4 border variables to :root in style.css: --border-light, --border-medium, --border-heavy, --border-solid
  - Replace all hardcoded rgba(194,139,98,*) values outside :root with the corresponding variables
  - Consolidate repeated selectors: font-family, outline:none, backdrop-filter into shared rules
  - Reorganize style.css into 5 labeled sections: Variables, Reset/Base, Layout Systems, Components, Utilities
  - Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4

- [x] 2. HTML Cleanup - Remove Inline Styles
  - Add new CSS classes to style.css for all inline styles being removed
  - Remove all style="..." attributes from index.html and replace with the new CSS classes
  - Verify 100% of DOM structure, class names, and IDs are preserved
  - Requirements: 4.1, 4.2, 4.3, 4.4, 9.1

- [x] 3. HTML Cleanup - Remove Inline Event Handlers
  - Remove all onclick, onchange, oninput, onkeydown, ondragstart, ondragover, ondrop, onmousemove, onmouseleave, oncontextmenu attributes from index.html
  - Add data-action and data-close attributes to support event delegation
  - Verify all DOM IDs and class names remain intact
  - Requirements: 5.1, 5.2, 5.3, 4.3, 4.4

- [x] 4. JS Event Delegation - Core Setup
  - Created initEventDelegation() function in script.js
  - Registered document-level listeners: click, contextmenu
  - Registered .top-nav, #auth-overlay, #priority-menu, document.body listeners
  - Called initEventDelegation() from continueInit()
  - Requirements: 6.1, 6.2, 6.6, 6.7

- [x] 5. JS Event Delegation - Main Grid and Habits
  - Registered #main-grid listeners: change, contextmenu, dragstart, dragover, drop
  - Implemented handleMainGridChange, handleMainGridDragStart, handleMainGridDragOver, handleMainGridDrop
  - Registered #habit-container listeners: change, input
  - Requirements: 6.3, 6.4, 6.5, 6.6, 6.7

- [x] 6. JS Event Delegation - Modals and Notes
  - Registered document-level change delegation for notes, abbr, monthly modal
  - Implemented handleDocumentClick, handleTopNavClick, handleModalCloseClick
  - Requirements: 6.1, 6.2, 6.3, 6.6, 6.7

- [x] 7. JS DOM Rendering - renderDays with DocumentFragment
  - Rewrote renderDays() to use DocumentFragment with createElement
  - Created createTaskElement(dIdx, tIdx) helper function
  - All IDs set correctly on created elements
  - Requirements: 7.1, 7.2, 8.1, 9.1, 9.2, 9.3, 9.4

- [x] 8. JS DOM Rendering - renderHabits, renderCalendar, initNotesUI, initAbbrUI
  - Rewrote renderHabits() with DocumentFragment
  - Rewrote renderCalendar() with DocumentFragment
  - Rewrote initNotesUI() with DocumentFragment
  - Rewrote initAbbrUI() with DocumentFragment
  - All IDs preserved correctly
  - Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 8.2, 8.3

- [x] 9. JS DOM Rendering - loadMonthlyData week cards
  - Rewrote week cards section of loadMonthlyData() with DocumentFragment
  - Bar chart and pie chart kept as innerHTML (SVG string building)
  - Requirements: 7.1, 7.7, 9.2

- [x] 10. Verification - State System and DOM ID Integrity
  - _syncStateFromDOM() reads from all task IDs correctly after renderDays refactoring
  - loadWeekData() writes to all DOM IDs correctly
  - All habit and note IDs accessible after renderHabits and initNotesUI refactoring
  - Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 10.1, 10.2, 10.3, 10.4

- [x] 11. Verification - Visual and Functional Regression Check
  - Open index.html in Edge browser to verify Bento Grid layout
  - Verify all 4 charts render correctly
  - Verify drag-and-drop, modal open/close, data persistence
  - Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 10.3
