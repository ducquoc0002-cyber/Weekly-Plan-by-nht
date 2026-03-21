# Requirements Document

## Introduction

Tái cấu trúc toàn diện ứng dụng quản lý công việc tuần (Weekly Plan Dashboard) xây dựng bằng Vanilla JS + Supabase. Mục tiêu là cải thiện khả năng bảo trì, hiệu năng render, và tính nhất quán của code mà không thay đổi bất kỳ chức năng hay giao diện người dùng nào. Refactoring bao gồm 4 lĩnh vực: CSS Variables & tổ chức file, HTML cleanup (xóa inline styles/handlers), JS Event Delegation, và JS DOM Rendering tối ưu.

## Glossary

- **CSS_System**: Hệ thống quản lý style trong file `style.css`
- **HTML_Document**: File `index.html` chứa cấu trúc DOM của ứng dụng
- **Event_Manager**: Hệ thống xử lý sự kiện tập trung trong `script.js`
- **DOM_Renderer**: Các hàm render DOM trong `script.js` (`renderDays`, `renderHabits`, `renderCalendar`, `initNotesUI`, `initAbbrUI`, `loadMonthlyData`)
- **State_System**: Hệ thống `_state`, `_syncStateFromDOM`, `scheduleSave`, `scheduleUIUpdate` trong `script.js`
- **Supabase_Layer**: Logic đọc/ghi dữ liệu qua Supabase và LocalStorage
- **Bento_Grid**: Layout lưới chính của dashboard (`#main-grid`, `.grid-container`)
- **Wave_Chart**: Biểu đồ đường xu hướng tuần (`svg.wave-chart`)
- **Donut_Chart**: Biểu đồ tròn tiến độ ngày (`.daily-donut`)
- **Bar_Chart**: Biểu đồ cột hiệu suất tuần trong Monthly Summary (`#monthly-bar-chart`)
- **Pie_Chart**: Biểu đồ tròn thói quen trong Monthly Summary (`#monthly-pie-chart`)
- **DocumentFragment**: API DOM cho phép build cây node trong bộ nhớ trước khi gắn vào DOM thật

---

## Requirements

### Requirement 1: CSS Variables mở rộng

**User Story:** As a developer, I want border color values to be defined as CSS variables, so that I can update border styles across the entire app from a single location.

#### Acceptance Criteria

1. THE CSS_System SHALL định nghĩa biến `--border-light: rgba(194,139,98,0.2)` trong `:root`
2. THE CSS_System SHALL định nghĩa biến `--border-medium: rgba(194,139,98,0.4)` trong `:root`
3. THE CSS_System SHALL định nghĩa biến `--border-heavy: rgba(194,139,98,0.6)` trong `:root`
4. THE CSS_System SHALL định nghĩa biến `--border-solid: rgba(194,139,98,0.8)` trong `:root`
5. WHEN một selector CSS sử dụng giá trị `rgba(194,139,98,*)`, THE CSS_System SHALL thay thế bằng biến tương ứng (`--border-light`, `--border-medium`, `--border-heavy`, hoặc `--border-solid`)
6. THE CSS_System SHALL áp dụng các biến border mới cho tất cả các selector: `.auth-box`, `.auth-input`, `.nav-btn`, `.grid-item`, `.calendar-container`, `.goal-reality-table th`, `.goal-reality-table td`

---

### Requirement 2: Tổ chức file CSS theo phân vùng

**User Story:** As a developer, I want the CSS file to be organized into clearly labeled sections, so that I can quickly locate and modify styles for any component.

#### Acceptance Criteria

1. THE CSS_System SHALL tổ chức `style.css` thành các phân vùng theo thứ tự: `/* === Variables === */`, `/* === Reset/Base === */`, `/* === Layout Systems (Bento Grid) === */`, `/* === Components === */`, `/* === Utilities === */`
2. THE CSS_System SHALL đặt tất cả khai báo `:root { }` trong phân vùng Variables
3. THE CSS_System SHALL đặt các rule `*`, `body`, `::-webkit-scrollbar` trong phân vùng Reset/Base
4. THE CSS_System SHALL đặt `.grid-container`, `.grid-item`, `.dashboard-wrapper`, `.top-nav` trong phân vùng Layout Systems
5. THE CSS_System SHALL đặt `.auth-box`, `.auth-input`, `.auth-btn`, `.nav-btn`, `.modal-overlay`, `.modal-content`, `.habit-table`, `.task-item`, `.context-menu`, `.calendar-container` trong phân vùng Components
6. THE CSS_System SHALL đặt `@media`, `#sync-loading-screen`, `#save-toast`, `#focus-backdrop`, `#abbr-tooltip` trong phân vùng Utilities

---

### Requirement 3: Gộp selector CSS có thuộc tính chung

**User Story:** As a developer, I want repeated CSS properties to be consolidated into shared selectors, so that the stylesheet is DRY and easier to maintain.

#### Acceptance Criteria

1. THE CSS_System SHALL gộp tất cả selector có `font-family: var(--font-main)` hoặc `font-family: inherit` lặp lại thành một selector chung
2. THE CSS_System SHALL gộp tất cả selector có `outline: none` thành một selector chung dạng `input, textarea, select, button { outline: none; }`
3. THE CSS_System SHALL gộp tất cả selector có `backdrop-filter: blur(*)` thành một selector chung
4. WHEN các selector được gộp, THE CSS_System SHALL đảm bảo không có thuộc tính nào bị mất hoặc bị ghi đè sai

---

### Requirement 4: Xóa inline style khỏi HTML

**User Story:** As a developer, I want all inline `style="..."` attributes removed from HTML elements, so that all styling is managed exclusively in the CSS file.

#### Acceptance Criteria

1. THE HTML_Document SHALL không chứa bất kỳ thuộc tính `style="..."` nào trên các thẻ `div`, `input`, `button`, `p`, `h2` trong phần body
2. WHEN một inline style bị xóa, THE CSS_System SHALL có class CSS tương ứng hoặc selector ID để thay thế toàn bộ thuộc tính đó
3. THE HTML_Document SHALL giữ nguyên 100% cấu trúc phân cấp DOM, tên class và ID của tất cả phần tử
4. THE HTML_Document SHALL giữ nguyên tất cả thuộc tính `data-*`, `id`, `class`, `type`, `placeholder`, `maxlength`, `aria-label`, `title`

---

### Requirement 5: Xóa inline event handlers khỏi HTML

**User Story:** As a developer, I want all inline event handlers removed from HTML, so that JavaScript logic is separated from markup and easier to test.

#### Acceptance Criteria

1. THE HTML_Document SHALL không chứa bất kỳ thuộc tính `onclick`, `onchange`, `oninput`, `onkeydown`, `ondragstart`, `ondragover`, `ondrop`, `onmousemove`, `onmouseleave`, `oncontextmenu` nào
2. WHEN một inline handler bị xóa, THE Event_Manager SHALL đăng ký sự kiện tương đương bằng `addEventListener` trong `script.js`
3. THE HTML_Document SHALL giữ nguyên 100% cấu trúc phân cấp DOM, tên class và ID của tất cả phần tử

---

### Requirement 6: Event Delegation tập trung

**User Story:** As a developer, I want a centralized event management system, so that event listeners are minimal and the codebase is easier to maintain.

#### Acceptance Criteria

1. THE Event_Manager SHALL gắn listener `click` trên `document` để xử lý tất cả sự kiện click toàn cục (đóng context menu, focus backdrop)
2. THE Event_Manager SHALL gắn listener `click` trên `#main-grid` để xử lý click trên các task item, context menu trigger
3. THE Event_Manager SHALL gắn listener `change` trên `#main-grid` để xử lý thay đổi checkbox task và input tên task
4. THE Event_Manager SHALL gắn listener `change` trên `#habit-container` để xử lý thay đổi checkbox habit và textarea tên habit
5. THE Event_Manager SHALL gắn listener `dragstart`, `dragover`, `drop` trên `#main-grid` để xử lý toàn bộ drag-and-drop
6. WHEN một sự kiện được bắt bởi Event_Manager, THE Event_Manager SHALL sử dụng `e.target.closest('selector')` hoặc `e.target.dataset.*` để xác định phần tử đích
7. THE Event_Manager SHALL giữ nguyên toàn bộ logic của `_state`, `_syncStateFromDOM`, `scheduleSave`, `scheduleUIUpdate`, `Supabase_Layer`

---

### Requirement 7: DOM Rendering bằng DocumentFragment

**User Story:** As a developer, I want DOM rendering functions to use DocumentFragment, so that batch DOM insertions minimize reflow and repaint cycles.

#### Acceptance Criteria

1. THE DOM_Renderer SHALL thay thế tất cả `innerHTML +=` và `insertAdjacentHTML` trong `renderDays`, `renderHabits`, `renderCalendar`, `initNotesUI`, `initAbbrUI`, `loadMonthlyData` bằng `DocumentFragment`
2. WHEN `renderDays` tạo 7 ngày × 10 task items, THE DOM_Renderer SHALL build toàn bộ cây DOM trong một `DocumentFragment` rồi gọi `appendChild` một lần duy nhất
3. WHEN `renderHabits` tạo 5 habit rows × 8 cells, THE DOM_Renderer SHALL build toàn bộ trong `DocumentFragment` rồi gọi `appendChild` một lần duy nhất
4. WHEN `renderCalendar` tạo các ô ngày trong tháng, THE DOM_Renderer SHALL build trong `DocumentFragment` rồi gọi `appendChild` một lần duy nhất
5. WHEN `initNotesUI` tạo 10 note inputs, THE DOM_Renderer SHALL build trong `DocumentFragment` rồi gọi `appendChild` một lần duy nhất
6. WHEN `initAbbrUI` tạo 10 abbreviation rows, THE DOM_Renderer SHALL build trong `DocumentFragment` rồi gọi `appendChild` một lần duy nhất
7. WHEN `loadMonthlyData` tạo week cards và charts, THE DOM_Renderer SHALL build week cards trong `DocumentFragment` rồi gọi `appendChild` một lần duy nhất

---

### Requirement 8: Bảo toàn State System và ID DOM

**User Story:** As a developer, I want the refactoring to preserve all state management logic and DOM IDs, so that data read/write operations continue to work correctly.

#### Acceptance Criteria

1. THE State_System SHALL tiếp tục trỏ đúng đến các ID: `t_name_${d}_${t}`, `t_h_start_${d}_${t}`, `t_m_start_${d}_${t}`, `t_h_end_${d}_${t}`, `t_m_end_${d}_${t}`, `t_check_${d}_${t}`, `task_div_${d}_${t}`
2. THE State_System SHALL tiếp tục trỏ đúng đến các ID: `h_name_${h}`, `h_check_${h}_${d}`
3. THE State_System SHALL tiếp tục trỏ đúng đến các ID: `note_input_${i}` (i từ 1 đến 10)
4. WHEN `_syncStateFromDOM` được gọi sau khi refactoring, THE State_System SHALL đọc đúng giá trị từ tất cả các input/checkbox/textarea theo ID
5. THE Supabase_Layer SHALL tiếp tục đọc và ghi dữ liệu đúng cấu trúc `{ tasks: {}, habits: {}, notes: {} }` trong `appData.weeks[weekId]`
6. WHEN dữ liệu được load từ Supabase hoặc LocalStorage, THE DOM_Renderer SHALL hiển thị đúng giá trị vào các input/checkbox tương ứng

---

### Requirement 9: Bảo toàn giao diện và biểu đồ

**User Story:** As a developer, I want the refactored app to render identically to the original, so that users experience no visual regression.

#### Acceptance Criteria

1. THE HTML_Document SHALL hiển thị đúng Bento_Grid layout trên trình duyệt Edge với `grid-template-columns: repeat(4, 1fr)`
2. THE DOM_Renderer SHALL render đúng Wave_Chart, Donut_Chart, Bar_Chart, Pie_Chart sau khi refactoring
3. THE DOM_Renderer SHALL render đúng `.day-header` với màu nền `background-color` từ `daysData[dIdx].bg` cho từng ngày
4. THE DOM_Renderer SHALL render đúng `stroke` màu cho `circle-progress` từ `daysData[dIdx].stroke`
5. WHEN tất cả task trong một ngày được hoàn thành, THE DOM_Renderer SHALL thêm class `daily-victory` vào `.grid-item` tương ứng
6. THE DOM_Renderer SHALL render đúng `delay-badge` với nội dung và class tương ứng với giá trị `data-delay`

---

### Requirement 10: Bảo toàn logic tính toán phần trăm

**User Story:** As a developer, I want the completion percentage calculations to remain unchanged after refactoring, so that all stats and charts display accurate data.

#### Acceptance Criteria

1. WHEN `updateDay(dIdx)` được gọi, THE State_System SHALL tính đúng `percent = Math.round((done / totalActive) * 100)` và cập nhật `dailyPercents[dIdx]`
2. WHEN `updateWeeklySummary` được gọi, THE State_System SHALL đếm đúng tổng task hoàn thành và đang thực hiện trên toàn bộ 7 ngày
3. WHEN `loadMonthlyData` tính `taskPct` và `habPct`, THE DOM_Renderer SHALL đọc đúng từ `appData.weeks[wId].tasks` và `appData.weeks[wId].habits`
4. IF `totalActive === 0`, THEN THE State_System SHALL trả về `percent = 0` thay vì NaN hoặc Infinity
