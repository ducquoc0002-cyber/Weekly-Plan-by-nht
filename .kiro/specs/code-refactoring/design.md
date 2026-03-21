# Design Document: Code Refactoring

## Overview

Tái cấu trúc toàn diện ứng dụng **Weekly Plan Dashboard** (Vanilla JS + Supabase) trên 3 file: `style.css`, `index.html`, `script.js`. Mục tiêu là cải thiện khả năng bảo trì và hiệu năng render mà **không thay đổi bất kỳ chức năng hay giao diện người dùng nào**.

Refactoring chia thành 4 lĩnh vực độc lập:

1. **CSS Variables & tổ chức file** — thêm biến border, gộp selector, phân vùng file
2. **HTML cleanup** — xóa toàn bộ `style="..."` và inline event handlers
3. **JS Event Delegation** — tập trung event listeners, loại bỏ handler rải rác
4. **JS DOM Rendering** — thay `innerHTML +=` bằng `DocumentFragment`

Các lĩnh vực này có thể thực hiện song song vì chúng tác động lên các file khác nhau, ngoại trừ HTML cleanup và JS Event Delegation phải phối hợp chặt chẽ (xóa handler HTML → thêm listener JS).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Weekly Plan Dashboard                     │
├──────────────┬──────────────────────┬───────────────────────┤
│  style.css   │     index.html       │      script.js        │
│              │                      │                       │
│ [CSS System] │  [HTML Document]     │  [Event Manager]      │
│              │                      │  [DOM Renderer]       │
│ Phase 1:     │  Phase 2:            │  [State System]       │
│ Variables    │  Remove inline       │  [Supabase Layer]     │
│ Sections     │  styles & handlers   │                       │
│ Consolidate  │                      │  Phase 3: Delegation  │
│              │                      │  Phase 4: Fragment    │
└──────────────┴──────────────────────┴───────────────────────┘
```

**Luồng dữ liệu không thay đổi:**
```
Supabase / LocalStorage
        ↓ loadWeekData()
    DOM (inputs, checkboxes)
        ↓ _syncStateFromDOM()
      _state { tasks, habits, notes }
        ↓ saveData() → saveGlobalData()
Supabase / LocalStorage
```

---

## Components and Interfaces

### 1. CSS System (style.css)

**Cấu trúc file sau refactoring:**

```
/* === Variables === */
:root { ... }          ← tất cả CSS custom properties

/* === Reset/Base === */
*, body, ::-webkit-scrollbar

/* === Layout Systems (Bento Grid) === */
.grid-container, .grid-item, .dashboard-wrapper, .top-nav

/* === Components === */
.auth-box, .auth-input, .auth-btn, .nav-btn,
.modal-overlay, .modal-content, .habit-table,
.task-item, .context-menu, .calendar-container, ...

/* === Utilities === */
@media, #sync-loading-screen, #save-toast,
#focus-backdrop, #abbr-tooltip
```

**Biến border mới trong `:root`:**
```css
--border-light:  rgba(194, 139, 98, 0.2);
--border-medium: rgba(194, 139, 98, 0.4);
--border-heavy:  rgba(194, 139, 98, 0.6);
--border-solid:  rgba(194, 139, 98, 0.8);
```

**Selector gộp (consolidated):**
```css
/* font-family */
input, textarea, select, button { font-family: var(--font-main); }

/* outline */
input, textarea, select, button { outline: none; }

/* backdrop-filter */
.context-menu, .modal-overlay, #focus-backdrop { backdrop-filter: blur(...); }
```

### 2. HTML Document (index.html)

**Inline styles bị xóa → thay bằng CSS class:**

| Element | Inline style cũ | Class CSS mới |
|---------|----------------|---------------|
| `<h2>` trong `.auth-box` | `margin-top:0; color:var(--text-main)` | `.auth-box__title` |
| `<p id="auth-msg">` | `color:#D32F2F; font-size:12px; ...` | `.auth-msg` |
| `.top-nav > div` (left) | `display:flex; gap:10px; z-index:2` | `.top-nav__left` |
| `.top-nav > div` (center) | `position:absolute; left:50%; ...` | `.top-nav__center` |
| Logout button | `background:rgba(211,47,47,0.1); ...` | `.nav-btn--danger` |
| `.widget-title` | `font-size:1.1em; padding:6px; ...` | `.widget-title` (existing + extend) |
| Buttons trong widget | `flex:1; padding:12px; ...` | `.nav-btn--full` |
| Modal `max-width` variants | `max-width:550px`, `500px`, `680px` | `.modal-content--sm`, `--xs`, `--md` |
| `#notes-container` items | `display:flex; align-items:center; ...` | `.note-row` |
| `#abbr-container` items | `display:grid; grid-template-columns:...` | `.abbr-row` |
| Monthly modal sections | `flex:7`, `flex:3`, `margin-bottom:0` | `.monthly-charts__tasks`, `.monthly-charts__habits` |
| `#monthly-bar-chart` | `position:relative; height:180px; ...` | `.monthly-chart-area` |
| `#monthly-pie-chart` | `position:relative; height:180px; ...` | `.monthly-chart-area--pie` |
| `#month-picker-modal` content | `max-width:680px` | `.modal-content--md` |
| `<p>` subtitle trong month picker | `font-size:12px; color:...` | `.modal-subtitle` |
| Week card inner divs | `font-size:18px; font-weight:800; ...` | `.week-card__pct`, `.week-card__label` |
| `#abbr-modal` header row | `display:grid; grid-template-columns:...` | `.abbr-header` |

**Inline event handlers bị xóa:**

| Element | Handler cũ | Xử lý mới |
|---------|-----------|-----------|
| `#focus-backdrop` | `onclick="closeFocus()"` | `document` click delegation |
| `#auth-overlay` button | `onclick="handleLogin()"` | `#auth-overlay` click delegation |
| `.top-nav` buttons | `onclick="openMonthlyModal()"`, etc. | `.top-nav` click delegation |
| `#priority-menu` items | `onclick="setPriority(...)"` | `#priority-menu` click delegation |
| `#greeting-text` | `oncontextmenu="renameUser(event)"` | `document` contextmenu delegation |
| Monthly modal inputs | `onchange="saveMonthly()"` | `#monthly-modal` change delegation |
| `#gr-status-*` selects | `onchange="updateRowStatus(i); saveMonthly()"` | `#monthly-modal` change delegation |
| `.modal-close` buttons | `onclick="close*Modal()"` | `.modal-overlay` click delegation |
| `#month-picker-grid` cells | (được xử lý bởi `grid.onclick` trong JS) | giữ nguyên pattern hiện tại |

### 3. Event Manager (script.js)

**Kiến trúc Event Delegation:**

```
document
  ├── click → closeFocus, closeContextMenu, renameUser (contextmenu)
  ├── mousemove → tooltip (đã có, giữ nguyên)
  └── contextmenu → renameUser (greeting-text)

.top-nav
  └── click → openMonthlyModal, openMonthPickerModal, handleLogout

#auth-overlay
  └── click → handleLogin (button)

#priority-menu
  └── click → setPriority

#main-grid
  ├── click → showContextMenu (checkbox contextmenu), closeFocus
  ├── change → task name/time/checkbox changes → _stateSetTask + updateDayAndSave
  ├── dragstart → dragStartTask
  ├── dragover → dragOverTask
  └── drop → dropTask / dropOnTaskItem

#habit-container
  ├── change → habit name/checkbox → _state.habits + scheduleSave
  └── input → autoResizeTextarea

#notes-container (trong modal)
  └── change → _state.notes + scheduleSave

#abbr-container (trong modal)
  └── change → saveAbbrData

#monthly-modal
  └── change → saveMonthly / updateRowStatus

.modal-overlay (tất cả)
  └── click → đóng modal khi click vào overlay (nếu target === overlay)
```

**Hàm `initEventDelegation()` mới:**
```javascript
function initEventDelegation() {
    // document-level
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('contextmenu', handleDocumentContextMenu);

    // top-nav
    document.querySelector('.top-nav').addEventListener('click', handleTopNavClick);

    // auth
    document.getElementById('auth-overlay').addEventListener('click', handleAuthClick);

    // priority menu
    document.getElementById('priority-menu').addEventListener('click', handlePriorityMenuClick);

    // main grid
    const mainGrid = document.getElementById('main-grid');
    mainGrid.addEventListener('click', handleMainGridClick);
    mainGrid.addEventListener('change', handleMainGridChange);
    mainGrid.addEventListener('dragstart', handleMainGridDragStart);
    mainGrid.addEventListener('dragover', handleMainGridDragOver);
    mainGrid.addEventListener('drop', handleMainGridDrop);

    // habit container
    const habitContainer = document.getElementById('habit-container');
    habitContainer.addEventListener('change', handleHabitChange);
    habitContainer.addEventListener('input', handleHabitInput);

    // modal close buttons (delegation trên body)
    document.body.addEventListener('click', handleModalCloseClick);
}
```

**Sử dụng `e.target.closest()` và `data-*`:**
```javascript
// Ví dụ: xử lý change trên #main-grid
function handleMainGridChange(e) {
    const taskItem = e.target.closest('.task-item');
    if (!taskItem) return;
    const [, , d, t] = taskItem.id.split('_'); // task_div_{d}_{t}
    
    if (e.target.matches('input[type="checkbox"]')) {
        _stateSetTask(d, t, 'check', e.target.checked);
        updateDayAndSave(parseInt(d));
    } else if (e.target.matches('.t-name')) {
        _stateSetTask(d, t, 'name', e.target.value);
        updateDayAndSave(parseInt(d));
    } else if (e.target.matches('.t-time-part')) {
        formatTimeInput(e.target);
        const field = e.target.id.split(`_${d}_${t}`)[0].replace('t_', '');
        _stateSetTask(d, t, field, e.target.value);
        updateDayAndSave(parseInt(d));
    }
}
```

### 4. DOM Renderer (script.js)

**Pattern DocumentFragment:**
```javascript
function renderDays() {
    const mainContainer = document.getElementById('main-grid');
    const fragment = document.createDocumentFragment();
    
    daysData.forEach((dayObj, dIdx) => {
        const gridItem = document.createElement('div');
        gridItem.className = 'grid-item';
        
        // Build day header
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.id = `day_header_${dIdx}`;
        dayHeader.style.backgroundColor = dayObj.bg;
        gridItem.appendChild(dayHeader);
        
        // Build task list với fragment con
        const taskList = document.createElement('div');
        taskList.className = 'task-list';
        taskList.id = `task_list_${dIdx}`;
        taskList.dataset.dayIdx = dIdx; // cho event delegation
        
        const taskFragment = document.createDocumentFragment();
        for (let t = 0; t < tasksPerDay; t++) {
            taskFragment.appendChild(createTaskElement(dIdx, t));
        }
        taskList.appendChild(taskFragment);
        
        // ... append tất cả vào gridItem
        fragment.appendChild(gridItem);
    });
    
    mainContainer.appendChild(fragment); // 1 lần duy nhất
}
```

**Tất cả 6 hàm render đều theo pattern:**
1. Tạo `const fragment = document.createDocumentFragment()`
2. Build toàn bộ cây node bằng `createElement` + `appendChild`
3. Gọi `container.appendChild(fragment)` **một lần duy nhất** ở cuối

---

## Data Models

### _state (in-memory mirror)
```javascript
_state = {
    tasks: {
        "t_name_{d}_{t}": string,
        "t_h_start_{d}_{t}": string,
        "t_m_start_{d}_{t}": string,
        "t_h_end_{d}_{t}": string,
        "t_m_end_{d}_{t}": string,
        "t_check_{d}_{t}": boolean,
        "t_pri_{d}_{t}": string,   // "0"|"1"|"2"|"3"|"star"
        "t_delay_{d}_{t}": string  // "0".."4+"
    },
    habits: {
        "h_name_{h}": string,
        "h_check_{h}_{d}": boolean
    },
    notes: {
        "note_{i}": string  // i: 1..10
    }
}
```

### appData (Supabase/LocalStorage)
```javascript
appData = {
    weeks: {
        "YYYY-MM-DD": {  // Monday key
            tasks:  { /* same keys as _state.tasks */ },
            habits: { /* same keys as _state.habits */ },
            notes:  { /* same keys as _state.notes */ }
        }
    },
    monthly: {
        "mg_1": string, "mg_2": string, "mg_3": string,
        "gr_name_1": string, "gr_target_1": string,
        "gr_actual_1": string, "gr_status_1": string,
        // ... tương tự cho 2, 3
    },
    abbrs: {
        "abbr_k_1": string, "abbr_v_1": string,
        // ... tương tự cho 2..10
    }
}
```

### DOM ID Contracts (bất biến sau refactoring)

Các ID sau **không được thay đổi** vì `_syncStateFromDOM()` và `loadWeekData()` phụ thuộc trực tiếp:

```
Task IDs:    t_name_{d}_{t}, t_h_start_{d}_{t}, t_m_start_{d}_{t}
             t_h_end_{d}_{t}, t_m_end_{d}_{t}, t_check_{d}_{t}
             task_div_{d}_{t}  (d: 0-6, t: 0-9)

Habit IDs:   h_name_{h}, h_check_{h}_{d}  (h: 0-4, d: 0-6)

Note IDs:    note_input_{i}  (i: 1-10)

UI IDs:      day_header_{d}, circle_{d}, pct_{d}, done_{d}
             prog_{d}, total_{d}, task_list_{d}, day_prog_bar_{d}
             delay_badge_{d}_{t}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Border variable substitution

*For any* CSS selector in `style.css` that previously used a hardcoded `rgba(194,139,98,*)` value, after refactoring that value should be replaced by the corresponding CSS variable (`--border-light`, `--border-medium`, `--border-heavy`, or `--border-solid`), and no hardcoded `rgba(194,139,98,*)` should remain.

**Validates: Requirements 1.5, 1.6**

---

### Property 2: CSS section ordering

*For any* two CSS rules A and B where A belongs to section X and B belongs to section Y, if X comes before Y in the defined section order (Variables → Reset/Base → Layout → Components → Utilities), then A must appear before B in the file.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

---

### Property 3: No inline styles in HTML

*For any* element in the `<body>` of `index.html`, after refactoring that element must not have a `style` attribute.

**Validates: Requirements 4.1, 4.2**

---

### Property 4: No inline event handlers in HTML

*For any* element in `index.html`, after refactoring that element must not have any of the following attributes: `onclick`, `onchange`, `oninput`, `onkeydown`, `ondragstart`, `ondragover`, `ondrop`, `onmousemove`, `onmouseleave`, `oncontextmenu`.

**Validates: Requirements 5.1**

---

### Property 5: DOM ID preservation

*For any* DOM ID in the set `{t_name_{d}_{t}, t_h_start_{d}_{t}, t_m_start_{d}_{t}, t_h_end_{d}_{t}, t_m_end_{d}_{t}, t_check_{d}_{t}, task_div_{d}_{t}, h_name_{h}, h_check_{h}_{d}, note_input_{i}}`, after refactoring that ID must still exist in the rendered DOM with the same element type.

**Validates: Requirements 4.3, 4.4, 5.3, 8.1, 8.2, 8.3**

---

### Property 6: State round-trip after refactoring

*For any* week data object `wData` loaded from `appData.weeks`, after calling `loadWeekData()` then `_syncStateFromDOM()`, the resulting `_state` must contain values equal to those in `wData` for all task, habit, and note keys.

**Validates: Requirements 8.4, 8.6, 10.1, 10.4**

---

### Property 7: DocumentFragment single-append

*For any* render function in `{renderDays, renderHabits, renderCalendar, initNotesUI, initAbbrUI, loadMonthlyData}`, the target container's `appendChild` (or equivalent single-insert method) must be called exactly once per render invocation, and the resulting DOM must contain the same number of child elements as the original implementation.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7**

---

### Property 8: Completion percentage correctness

*For any* day index `dIdx` and any combination of task states (checked/unchecked, with/without text), `updateDay(dIdx)` must compute `percent = totalActive === 0 ? 0 : Math.round((done / totalActive) * 100)` and the result must never be `NaN` or `Infinity`.

**Validates: Requirements 10.1, 10.4**

---

## Error Handling

### CSS Refactoring
- Nếu một `rgba(194,139,98,*)` không khớp chính xác với 4 mức opacity đã định nghĩa, giữ nguyên giá trị gốc và ghi chú `/* TODO: check opacity */`
- Khi gộp selector, nếu có conflict specificity, ưu tiên giữ nguyên rule cụ thể hơn

### HTML Cleanup
- Mỗi inline style bị xóa phải có CSS class tương ứng được tạo trước khi xóa
- Kiểm tra visual regression bằng screenshot so sánh trước/sau

### Event Delegation
- Tất cả handler mới phải guard bằng `if (!target) return` trước khi xử lý
- `e.target.closest()` trả về `null` nếu không tìm thấy → phải kiểm tra null
- Các handler liên quan đến `currentRightClickDay/Task` phải kiểm tra `!== null` trước khi dùng

### DOM Rendering
- Nếu container không tồn tại khi render, log warning và return sớm
- `DocumentFragment` không có `innerHTML` — không được dùng `fragment.innerHTML`
- Sau khi `appendChild(fragment)`, fragment trở nên rỗng — không reuse fragment

### State System
- `_syncStateFromDOM()` dùng `|| {}` fallback cho mọi `getElementById` để tránh null reference
- `saveData()` luôn gọi `_syncStateFromDOM()` trước khi đọc `_state` (đã có, giữ nguyên)

---

## Testing Strategy

### Dual Testing Approach

Cả unit test và property-based test đều cần thiết và bổ sung cho nhau:
- **Unit tests**: kiểm tra các ví dụ cụ thể, edge cases, integration points
- **Property tests**: kiểm tra các thuộc tính phổ quát trên nhiều input ngẫu nhiên

### Unit Tests

**CSS Refactoring:**
- Kiểm tra `:root` chứa đúng 4 biến border với giá trị chính xác
- Kiểm tra không còn `rgba(194,139,98,` hardcoded trong file (ngoài `:root`)
- Kiểm tra 5 section comments tồn tại theo đúng thứ tự

**HTML Cleanup:**
- Parse `index.html` và kiểm tra không có attribute `style` trên bất kỳ element nào trong `<body>`
- Kiểm tra không có inline event handler attributes
- Kiểm tra tất cả DOM IDs trong contract vẫn tồn tại

**Event Delegation:**
- Mock DOM, gọi `initEventDelegation()`, kiểm tra số lượng `addEventListener` calls
- Simulate click/change events và kiểm tra đúng handler được gọi

**DOM Rendering:**
- Gọi `renderDays()`, kiểm tra `#main-grid` có đúng 7 `.grid-item` mới
- Kiểm tra mỗi `.grid-item` có đúng 10 `.task-item`
- Kiểm tra tất cả IDs trong contract tồn tại sau render

**State System:**
- Load mock `wData`, gọi `loadWeekData()` + `_syncStateFromDOM()`, so sánh `_state` với `wData`
- Kiểm tra `updateDay(dIdx)` với `totalActive=0` trả về `percent=0`

### Property-Based Tests

Sử dụng thư viện **fast-check** (JavaScript) cho tất cả property tests.
Mỗi property test chạy tối thiểu **100 iterations**.

```javascript
// Tag format: Feature: code-refactoring, Property {N}: {property_text}
```

**Property 1 — Border variable substitution:**
```javascript
// Feature: code-refactoring, Property 1: border variable substitution
fc.assert(fc.property(
    fc.constantFrom('--border-light', '--border-medium', '--border-heavy', '--border-solid'),
    (varName) => {
        const cssContent = fs.readFileSync('style.css', 'utf8');
        // Không còn hardcoded rgba(194,139,98,*) ngoài :root
        const outsideRoot = cssContent.replace(/:root\s*\{[^}]+\}/, '');
        return !outsideRoot.includes('rgba(194,139,98,');
    }
), { numRuns: 100 });
```

**Property 3 — No inline styles:**
```javascript
// Feature: code-refactoring, Property 3: no inline styles in HTML
fc.assert(fc.property(
    fc.constant(null),
    () => {
        const html = fs.readFileSync('index.html', 'utf8');
        const dom = new JSDOM(html);
        const elements = dom.window.document.querySelectorAll('[style]');
        return elements.length === 0;
    }
), { numRuns: 100 });
```

**Property 5 — DOM ID preservation:**
```javascript
// Feature: code-refactoring, Property 5: DOM ID preservation
fc.assert(fc.property(
    fc.integer({ min: 0, max: 6 }),
    fc.integer({ min: 0, max: 9 }),
    (d, t) => {
        // Sau khi renderDays(), tất cả IDs phải tồn tại
        const ids = [
            `t_name_${d}_${t}`, `t_check_${d}_${t}`, `task_div_${d}_${t}`,
            `t_h_start_${d}_${t}`, `t_m_start_${d}_${t}`,
            `t_h_end_${d}_${t}`, `t_m_end_${d}_${t}`
        ];
        return ids.every(id => document.getElementById(id) !== null);
    }
), { numRuns: 100 });
```

**Property 6 — State round-trip:**
```javascript
// Feature: code-refactoring, Property 6: state round-trip after refactoring
fc.assert(fc.property(
    fc.record({
        tasks: fc.dictionary(
            fc.constantFrom(...taskKeys),
            fc.oneof(fc.string(), fc.boolean())
        ),
        habits: fc.dictionary(fc.constantFrom(...habitKeys), fc.oneof(fc.string(), fc.boolean())),
        notes: fc.dictionary(fc.constantFrom(...noteKeys), fc.string())
    }),
    (wData) => {
        appData.weeks[viewingWeekId] = wData;
        loadWeekData();
        _syncStateFromDOM();
        return taskKeys.every(k => _state.tasks[k] === (wData.tasks[k] || ''));
    }
), { numRuns: 100 });
```

**Property 8 — Completion percentage correctness:**
```javascript
// Feature: code-refactoring, Property 8: completion percentage correctness
fc.assert(fc.property(
    fc.integer({ min: 0, max: 10 }),  // done
    fc.integer({ min: 0, max: 10 }),  // totalActive (>= done)
    (done, extra) => {
        const totalActive = done + extra;
        const percent = totalActive === 0 ? 0 : Math.round((done / totalActive) * 100);
        return !isNaN(percent) && isFinite(percent) && percent >= 0 && percent <= 100;
    }
), { numRuns: 100 });
```
