# Performance Optimization Bugfix Design

## Overview

Ứng dụng Weekly Plan Dashboard (vanilla JS + Supabase) đang gặp 4 nhóm lỗi hiệu suất nghiêm trọng:

1. **DOM-Driven State & Save Bottleneck**: `saveData()` quét toàn bộ 70+ DOM elements mỗi lần lưu, không có in-memory state, không có debounce đủ mạnh.
2. **Render Blocking & Repaint**: `mousemove` handler chạy RegExp scan và tạo `requestAnimationFrame` trên mọi frame kể cả khi không cần thiết; `backdrop-filter` áp dụng thừa trên `.nav-btn`.
3. **Drag & Drop Inconsistency**: `scheduleUIUpdate()` gọi hai lần riêng biệt trong cùng animation frame; `data-priority` không được swap đầy đủ; reset priority không trigger `updateDay()` ngay.
4. **Modal Leak & Sync Hang**: SVG innerHTML tích lũy qua mỗi lần mở modal; timeout cứng 8 giây; `clearTimeout()` thiếu trong nhánh `catch`.

Chiến lược fix: tối thiểu hóa DOM access bằng in-memory state, early-exit trong event handlers, gộp re-render vào một RAF duy nhất, và quản lý vòng đời timeout đúng cách.

---

## Glossary

- **Bug_Condition (C)**: Tập hợp các điều kiện kích hoạt lỗi hiệu suất.
- **Property (P)**: Hành vi đúng mong muốn sau khi fix.
- **Preservation**: Toàn bộ chức năng hiện tại phải tiếp tục hoạt động đúng sau khi fix.
- **`saveData()`**: Hàm trong `script.js` thu thập dữ liệu và ghi vào `appData` + localStorage + Supabase.
- **`scheduleUIUpdate(dIdx)`**: Hàm debounce UI update dùng `requestAnimationFrame`.
- **`loadMonthlyData()`**: Hàm render SVG bar chart và pie chart vào Monthly Summary modal.
- **`loadGlobalDataFromDB()`**: Hàm async fetch dữ liệu từ Supabase với `AbortController` timeout.
- **`appData`**: Global in-memory object lưu toàn bộ state của app (`weeks`, `monthly`, `abbrs`).
- **`_taskState`**: Object in-memory mới sẽ được thêm vào để cache task data, tránh DOM scan.

---

## Bug Details

### Bug Condition

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input là UserInputEvent | MouseMoveEvent | DragDropEvent | ModalOpenEvent | NetworkRequest
  OUTPUT: boolean

  IF input.type IN ['keypress', 'change', 'checkbox'] THEN
    RETURN saveData_reads_from_DOM_instead_of_memory(input)

  IF input.type = 'mousemove' THEN
    RETURN requestAnimationFrame_created_even_when_target_is_not_t_name(input)

  IF input.type IN ['drop', 'dropOnTaskItem'] THEN
    RETURN scheduleUIUpdate_called_twice_in_same_frame(input)
           OR data_priority_not_fully_swapped(input)

  IF input.type = 'openModal' THEN
    RETURN svg_innerHTML_not_cleared_before_redraw(input)

  IF input.type = 'networkRequest' THEN
    RETURN clearTimeout_not_called_in_catch_branch(input)
           OR timeout_hardcoded_at_8000ms(input)

  RETURN false
END FUNCTION
```

### Examples

- **Bug 1**: Gõ "Meeting" vào `t_name_0_0` → `saveData()` gọi 560+ `getElementById()` → input lag ~50ms
- **Bug 2**: Di chuột qua calendar → RAF tạo và RegExp scan 10 lần dù target không phải `.t-name`
- **Bug 3**: Kéo task Monday → Tuesday → `scheduleUIUpdate(0)` bị cancel bởi `scheduleUIUpdate(1)` → ngày nguồn không update
- **Bug 3b**: `dropOnTaskItem()` swap task "star" ↔ "1" → `data-priority` của target không được set → badge sai thoáng qua
- **Bug 4**: Mở Monthly Summary 5 lần → `monthly-bar-chart` chứa 5 lớp SVG chồng nhau
- **Bug 4b**: Network error → `catch` block chạy nhưng `clearTimeout(timeout)` không được gọi

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Dữ liệu task (name, time, checkbox, priority, delay) phải được lưu đầy đủ vào localStorage và Supabase sau debounce
- Toast "✅ Saved" phải hiển thị sau khi upsert Supabase thành công
- Tooltip từ viết tắt phải hiển thị đúng khi hover vào `.t-name` có chứa từ viết tắt
- Priority sorting (star → 0 → 1 → 2 → 3) phải đúng trên cả ngày nguồn và ngày đích sau drag-drop
- Màu border-left, badge delay, biểu tượng ⭐ phải đúng ngay sau lần render đầu tiên
- Bar chart, pie chart, 5 week cards trong Monthly Summary phải hiển thị số liệu chính xác
- `backdrop-filter` vẫn áp dụng trên `.modal-overlay` và `.context-menu`
- `activeModalCount` phải chính xác để ẩn/hiện `!!` indicator
- Wave chart Bezier curve và tooltip hover phải hoạt động đúng

**Scope:**
Tất cả inputs không thuộc bug condition (đọc dữ liệu, render ban đầu, navigation, auth) phải hoàn toàn không bị ảnh hưởng.

---

## Hypothesized Root Cause

1. **Không có in-memory task state**: `saveData()` gọi `document.getElementById()` cho mỗi field của mỗi task (8 fields × 70 tasks = 560 DOM reads mỗi lần lưu).

2. **Early-exit thiếu trong mousemove**: RAF được tạo trước khi kiểm tra `target.classList.contains('t-name')` → lãng phí một RAF frame cho mọi mousemove event.

3. **`backdrop-filter` trên `.nav-btn`**: Tạo stacking context mới, buộc GPU composite 3 elements liên tục dù không cần thiết.

4. **Hai lần `scheduleUIUpdate()`**: `scheduleUIUpdate` cancel RAF cũ và tạo RAF mới → lần gọi thứ hai cancel lần thứ nhất → chỉ ngày đích được update trong frame đó.

5. **`data-priority` không swap**: `dropOnTaskItem()` swap text/time/checkbox nhưng không swap `data-priority` attribute giữa source và target div.

6. **`innerHTML +=` tích lũy**: `loadMonthlyData()` không clear container trước khi set innerHTML → mỗi lần mở modal thêm một lớp SVG mới.

7. **`clearTimeout` thiếu trong `catch`**: `loadGlobalDataFromDB()` set timeout nhưng không clear trong catch block → potential double-execution.

---

## Correctness Properties

Property 1: Bug Condition – saveData() đọc từ in-memory state

_For any_ chuỗi thay đổi input (gõ text, tích checkbox, thay đổi time) nơi bug condition giữ, hàm `saveData()` đã fix SHALL đọc dữ liệu từ `_taskState` in-memory object thay vì gọi `document.getElementById()` cho từng field, và số lần DOM read trong `saveData()` SHALL bằng 0.

**Validates: Requirements 2.1, 2.3**

Property 2: Bug Condition – mousemove early-exit trước RAF

_For any_ `mousemove` event nơi `e.target` không phải là element có class `.t-name`, hàm handler SHALL thoát sớm mà không tạo `requestAnimationFrame`, đảm bảo RAF callback count bằng 0 cho các event đó.

**Validates: Requirements 2.4, 2.6**

Property 3: Bug Condition – single RAF cho drag-drop

_For any_ thao tác drag-drop (cả `dropTask` và `dropOnTaskItem`), hệ thống SHALL chỉ tạo đúng một `requestAnimationFrame` callback để update cả ngày nguồn lẫn ngày đích, không tạo hai RAF riêng biệt.

**Validates: Requirements 2.7**

Property 4: Bug Condition – data-priority swap đầy đủ

_For any_ thao tác `dropOnTaskItem()` hoán đổi hai task, cả hai DOM elements SHALL có `data-priority` và `data-delay` attributes phản ánh đúng state sau swap ngay sau lần render đầu tiên, không có trạng thái trung gian sai.

**Validates: Requirements 2.8, 2.9**

Property 5: Bug Condition – SVG clear trước khi vẽ lại

_For any_ lần mở Monthly Summary modal (lần thứ N, N ≥ 2), số SVG child elements trong `#monthly-bar-chart` và `#monthly-pie-chart` SHALL bằng số elements sau lần mở đầu tiên, không tích lũy theo N.

**Validates: Requirements 2.10, 2.11**

Property 6: Bug Condition – clearTimeout trong mọi nhánh

_For any_ lần gọi `loadGlobalDataFromDB()`, `clearTimeout(timeout)` SHALL được gọi trong cả nhánh thành công lẫn nhánh `catch`, đảm bảo không có timeout callback nào bị leak.

**Validates: Requirements 2.13**

Property 7: Preservation – dữ liệu lưu đầy đủ sau fix

_For any_ input nơi bug condition KHÔNG giữ, hàm `saveData()` đã fix SHALL produce cùng kết quả với hàm gốc — `appData.weeks[viewingWeekId]` chứa đầy đủ task name, time, checkbox, priority, delay cho tất cả 70 tasks.

**Validates: Requirements 3.1, 3.2**

Property 8: Preservation – tooltip, sorting, chart không thay đổi

_For any_ input không liên quan đến bug condition (hover `.t-name`, drag-drop hoàn tất, mở Monthly modal), hệ thống đã fix SHALL produce cùng output với hệ thống gốc: tooltip hiển thị đúng, priority sort đúng thứ tự, chart render đúng số liệu.

**Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.10**

---

## Fix Implementation

### Changes Required

**File**: `script.js` và `style.css`

#### Change 1 – In-memory state cho tasks (Bug 1)

Thêm object `_taskState` được cập nhật trực tiếp khi user input. Sửa `saveData()` để đọc từ `_taskState`:

```javascript
// Thêm global state cache
let _taskState = {}; // key: `${dIdx}_${tIdx}`, value: { name, hStart, mStart, hEnd, mEnd, checked, priority, delay }

// Cập nhật khi input thay đổi (thêm vào các event handlers)
function updateTaskState(dIdx, tIdx) {
    _taskState[`${dIdx}_${tIdx}`] = {
        name: document.getElementById(`t_name_${dIdx}_${tIdx}`).value,
        hStart: document.getElementById(`t_h_start_${dIdx}_${tIdx}`).value,
        // ... các fields khác
        priority: document.getElementById(`task_div_${dIdx}_${tIdx}`).getAttribute('data-priority'),
        delay: document.getElementById(`task_div_${dIdx}_${tIdx}`).getAttribute('data-delay')
    };
}

// Trong saveData(): đọc từ _taskState thay vì DOM
for (let d = 0; d < 7; d++) {
    for (let t = 0; t < tasksPerDay; t++) {
        const s = _taskState[`${d}_${t}`] || {};
        wData.tasks[`t_name_${d}_${t}`] = s.name || '';
        // ...
    }
}
```

#### Change 2 – Early-exit mousemove trước RAF (Bug 2)

```javascript
document.addEventListener('mousemove', (e) => {
    // Early-exit TRƯỚC khi tạo RAF
    if (!e.target || !e.target.classList.contains('t-name')) {
        const tooltip = document.getElementById('abbr-tooltip');
        if (tooltip) tooltip.style.display = 'none';
        return;
    }
    if (_tooltipThrottle) return;
    _tooltipThrottle = requestAnimationFrame(() => {
        _tooltipThrottle = null;
        // RegExp scan chỉ chạy ở đây khi target là .t-name
    });
});
```

#### Change 3 – Xóa backdrop-filter khỏi .nav-btn (Bug 2)

Trong `style.css`, xóa `backdrop-filter: blur(8px)` khỏi `.nav-btn` rule. Giữ nguyên trên `.modal-overlay` và `.context-menu`.

#### Change 4 – Single RAF cho drag-drop (Bug 3)

```javascript
function _scheduleDualUIUpdate(dIdx1, dIdx2) {
    if (_uiUpdateTimer) cancelAnimationFrame(_uiUpdateTimer);
    _uiUpdateTimer = requestAnimationFrame(() => {
        updateDay(dIdx1);
        if (dIdx1 !== dIdx2) updateDay(dIdx2);
        updateWeeklySummary();
        drawWaveChart();
        _uiUpdateTimer = null;
    });
}
// Thay thế scheduleUIUpdate(sDay); scheduleUIUpdate(targetDayIdx); bằng _scheduleDualUIUpdate(sDay, targetDayIdx);
```

#### Change 5 – Swap data-priority đầy đủ trong dropOnTaskItem() (Bug 3)

```javascript
// Thêm vào phần swap attributes trong dropOnTaskItem():
tDiv.setAttribute('data-priority', sPri);
sDiv.setAttribute('data-priority', tPri);
```

#### Change 6 – Clear SVG trước khi vẽ lại (Bug 4)

```javascript
// Trong loadMonthlyData():
colsContainer.innerHTML = ''; // Clear trước khi append
// Thay innerHTML += bằng tạo element và appendChild

document.getElementById('monthly-bar-chart').innerHTML = barHtml; // Đã ghi đè, không +=
document.getElementById('monthly-pie-chart').innerHTML = pieHtml; // Đã ghi đè, không +=
```

Lưu ý: `monthly-bar-chart` và `monthly-pie-chart` đã dùng `= barHtml` (không phải `+=`), chỉ cần fix `colsContainer.innerHTML +=`.

#### Change 7 – clearTimeout trong catch + giảm timeout xuống 5s (Bug 4)

```javascript
async function loadGlobalDataFromDB() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s thay vì 8s
    try {
        const { data, error } = await sbClient.from('user_plans')...;
        clearTimeout(timeout); // Luôn clear trong success branch
        // ...
    } catch (err) {
        clearTimeout(timeout); // Thêm vào catch branch
        // ...
    }
}
```

---

## Testing Strategy

### Validation Approach

Chiến lược hai giai đoạn: (1) exploratory tests trên code CHƯA fix để xác nhận root cause, (2) fix + preservation tests sau khi fix.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples trên code chưa fix để xác nhận root cause analysis. Nếu refute, cần re-hypothesize.

**Test Plan**: Mock `document.getElementById` và `requestAnimationFrame`, đếm số lần gọi, verify chúng xảy ra khi không nên.

**Test Cases**:
1. **DOM Read Count Test**: Gọi `saveData()` một lần, đếm số lần `getElementById` được gọi → expect > 100 calls (sẽ pass trên unfixed code, fail sau fix)
2. **RAF on Non-t-name Test**: Dispatch `mousemove` với target là `div.calendar`, verify `requestAnimationFrame` được gọi → expect true (sẽ pass trên unfixed code)
3. **Double RAF Test**: Gọi `dropTask()` với source day 0 và target day 1, verify `requestAnimationFrame` được gọi 2 lần → expect true (sẽ pass trên unfixed code)
4. **Priority Swap Test**: Gọi `dropOnTaskItem()` swap task "star" ↔ "1", verify `tDiv.getAttribute('data-priority')` vẫn là "1" → expect true (sẽ pass trên unfixed code)
5. **SVG Accumulation Test**: Gọi `loadMonthlyData()` 3 lần, đếm child nodes trong `#modal-weekly-cols` → expect tăng dần (sẽ pass trên unfixed code)
6. **clearTimeout Missing Test**: Mock `clearTimeout`, simulate network error trong `loadGlobalDataFromDB()`, verify `clearTimeout` KHÔNG được gọi trong catch → expect true (sẽ pass trên unfixed code)

**Expected Counterexamples**:
- `saveData()` gọi `getElementById` 560+ lần mỗi lần lưu
- RAF được tạo cho mọi `mousemove` event bất kể target
- `data-priority` không được swap trong `dropOnTaskItem()`
- SVG nodes tích lũy theo số lần mở modal

### Fix Checking

**Goal**: Verify rằng với mọi input thuộc bug condition, hàm đã fix produce đúng behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

**Test Cases**:
1. Sau fix, `saveData()` gọi `getElementById` 0 lần (đọc từ `_taskState`)
2. Sau fix, `mousemove` với non-`.t-name` target không tạo RAF
3. Sau fix, `dropTask()` chỉ tạo 1 RAF cho cả hai ngày
4. Sau fix, `dropOnTaskItem()` swap đầy đủ `data-priority` trên cả hai elements
5. Sau fix, `loadMonthlyData()` gọi 3 lần → child count trong `#modal-weekly-cols` ổn định
6. Sau fix, `clearTimeout` được gọi trong cả success và catch branch của `loadGlobalDataFromDB()`
7. Sau fix, timeout value là 5000ms

### Preservation Checking

**Goal**: Verify rằng với mọi input KHÔNG thuộc bug condition, hàm đã fix produce cùng kết quả với hàm gốc.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing được khuyến nghị vì tự động sinh nhiều test cases, bắt edge cases, và đảm bảo behavior không thay đổi cho mọi non-buggy input.

**Test Cases**:
1. **Save Completeness**: Sau fix, `appData.weeks[viewingWeekId].tasks` chứa đầy đủ 8 fields × 70 tasks với giá trị đúng
2. **Toast Preservation**: Sau upsert thành công, toast "✅ Saved" vẫn hiển thị
3. **Tooltip Preservation**: Hover `.t-name` có từ viết tắt → tooltip vẫn hiển thị đúng nội dung
4. **Sort Preservation**: Sau drag-drop, `sortTasks()` vẫn sắp xếp đúng thứ tự star → 0 → 1 → 2 → 3
5. **Chart Preservation**: `loadMonthlyData()` sau fix vẫn render đúng số liệu taskPct và habPct
6. **backdrop-filter Preservation**: `.modal-overlay` và `.context-menu` vẫn có `backdrop-filter`

### Unit Tests

- Test `saveData()` đọc từ `_taskState` thay vì DOM (mock getElementById, verify 0 calls)
- Test `mousemove` handler: early-exit khi target không phải `.t-name`
- Test `dropOnTaskItem()`: verify cả `data-priority` và `data-delay` được swap đúng
- Test `loadMonthlyData()`: verify `colsContainer.innerHTML` được clear trước khi append
- Test `loadGlobalDataFromDB()`: verify `clearTimeout` gọi trong cả success và catch
- Test timeout value: verify `setTimeout` được gọi với 5000ms

### Property-Based Tests

- Sinh ngẫu nhiên chuỗi task data (name, time, priority), verify `saveData()` → `loadWeekData()` round-trip không mất dữ liệu
- Sinh ngẫu nhiên mousemove events với target ngẫu nhiên, verify RAF chỉ tạo khi target là `.t-name`
- Sinh ngẫu nhiên cặp (sourceDay, targetDay, sourceTask, targetTask), verify sau `dropOnTaskItem()` cả hai elements có đúng priority/delay
- Sinh ngẫu nhiên số lần mở modal (1–20 lần), verify child count trong chart containers không tăng

### Integration Tests

- Test full flow: nhập task → save → reload → verify dữ liệu đúng
- Test drag-drop cross-day: kéo task từ Monday sang Friday → verify cả hai ngày hiển thị đúng ngay lập tức
- Test Monthly Summary: mở/đóng 5 lần → verify DOM không phình to, số liệu vẫn đúng
- Test network fallback: simulate timeout → verify loading screen tắt sau ≤5s, dữ liệu local được load
