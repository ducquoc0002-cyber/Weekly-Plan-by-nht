# Tooltip Drift, XSS & Drag-Drop Bugfix — Design

## Overview

Ba lỗi cần sửa trong `script.js` của ứng dụng Weekly Plan Dashboard:

1. **Tooltip Drift** — `showTooltip()` và handler `mousemove` của `abbr-tooltip` dùng `e.pageX / 1.1` để bù CSS `zoom: 1.1` trên `body`. Cách tính này sai vì `pageX` đã được trình duyệt scale theo zoom, dẫn đến tooltip bị lệch vị trí trên Edge/Chrome với màn hình laptop.

2. **XSS / Rendering ký tự đặc biệt** — Handler `mousemove` gán `tooltip.innerHTML = foundAbbrs.join('<br>')` với nội dung lấy trực tiếp từ `appData.abbrs` mà không escape. Nếu người dùng nhập `<script>` hoặc `<img onerror=...>` vào ô viết tắt, mã JavaScript tùy ý sẽ được thực thi.

3. **Drag & Drop ghi đè dữ liệu sai** — `dropTask()` gọi `store.draggedTask = null` ở dòng đầu tiên, trước khi kiểm tra tính hợp lệ của vùng thả. Khi drop vào vùng không hợp lệ (ngoài `.task-list`) hoặc ngày đích đã đầy, `store.draggedTask` đã bị xóa nhưng dữ liệu nguồn vẫn bị xóa khỏi state.

Chiến lược sửa: thay đổi tối thiểu, không refactor kiến trúc, chỉ sửa đúng dòng gây lỗi.

---

## Glossary

- **Bug_Condition (C)**: Điều kiện kích hoạt lỗi — tập hợp input/trạng thái khiến hàm cho kết quả sai
- **Property (P)**: Hành vi đúng mong đợi khi bug condition xảy ra
- **Preservation**: Hành vi hiện tại đúng phải giữ nguyên sau khi sửa
- **F**: Hàm gốc (chưa sửa)
- **F'**: Hàm đã sửa
- **`showTooltip(e, dayIndex)`**: Hàm trong `script.js` hiển thị `chart-tooltip` khi hover điểm trên wave chart
- **`mousemove` abbr handler**: Event listener ẩn danh trong `script.js` hiển thị `abbr-tooltip` khi hover `.t-name`
- **`dropTask(e, targetDayIdx)`**: Hàm xử lý drop task vào `.task-list` (không phải vào task item cụ thể)
- **`store.draggedTask`**: State lưu thông tin task đang được kéo `{ dIdx, tIdx }`
- **CSS zoom**: `body { zoom: 1.1 }` trong `style.css` — scale toàn bộ trang 110%

---

## Bug Details

### Bug 1 — Tooltip Drift

Tooltip bị lệch vì `e.pageX` trên trình duyệt có CSS zoom đã bao gồm offset của zoom, nhưng `position: absolute` của tooltip lại được tính trong coordinate space đã bị scale. Chia cho `1.1` là hardcode hệ số zoom — sai khi zoom thay đổi hoặc trên các trình duyệt xử lý khác nhau.

**Formal Specification:**
```
FUNCTION isBugCondition_TooltipDrift(X)
  INPUT: X = { cssZoom: number, eventType: string, target: string }
  OUTPUT: boolean

  RETURN X.cssZoom != 1.0
         AND X.eventType = "mousemove"
         AND (X.target = "wave circle" OR X.target = ".t-name")
END FUNCTION
```

**Ví dụ cụ thể:**
- Hover vào điểm wave chart trên Edge với `zoom: 1.1` → tooltip hiện cách con trỏ ~15–20px về phía trên-trái
- Hover vào `.t-name` có từ viết tắt → `abbr-tooltip` hiện lệch xuống dưới so với con trỏ
- Hover trên Chrome với `zoom: 1.0` → tooltip hiện đúng vị trí (không phải bug condition)

---

### Bug 2 — XSS / Rendering ký tự đặc biệt

`tooltip.innerHTML = foundAbbrs.join('<br>')` với `foundAbbrs` chứa `<b>${k}</b>: ${v}` — cả `k` và `v` đều lấy từ input người dùng mà không escape.

**Formal Specification:**
```
FUNCTION isBugCondition_XSS(X)
  INPUT: X = { abbrKey: string, abbrValue: string }
  OUTPUT: boolean

  RETURN X.abbrKey CONTAINS_ANY_OF ['<', '>', '"', "'", '&']
         OR X.abbrValue CONTAINS_ANY_OF ['<', '>', '"', "'", '&']
END FUNCTION
```

**Ví dụ cụ thể:**
- `abbrValue = "<script>alert(1)</script>"` → JS được thực thi khi tooltip hiển thị
- `abbrValue = "<img src=x onerror=alert(2)>"` → JS được thực thi
- `abbrKey = "A&B"` → render thành `<b>A&B</b>` — `&` không được escape, có thể gây lỗi HTML
- `abbrValue = "bình thường"` → không phải bug condition, render đúng

---

### Bug 3 — Drag & Drop ghi đè dữ liệu sai

`dropTask()` set `store.draggedTask = null` ở dòng 695, trước khi kiểm tra `emptyIdx === -1`. Khi ngày đích đầy, hàm `alert()` rồi `return` — nhưng `store.draggedTask` đã bị xóa, khiến drag tiếp theo không hoạt động. Tệ hơn, khi drop vào vùng ngoài `.task-list` (handler `handleMainGridDrop` không match `taskItem` lẫn `taskList`), `dropTask()` không được gọi nhưng `dragend` event cũng không khôi phục state.

**Formal Specification:**
```
FUNCTION isBugCondition_DragDrop(X)
  INPUT: X = { dropTarget: Element, targetDayIdx: number, sourceDayIdx: number }
  OUTPUT: boolean

  targetIsFull ← COUNT(non-empty tasks in targetDayIdx) >= TASKS_PER_DAY
  dropIsOutsideTaskList ← X.dropTarget IS NOT INSIDE any ".task-list"

  RETURN dropIsOutsideTaskList
         OR (dropIsInsideTaskList AND targetIsFull)
END FUNCTION
```

**Ví dụ cụ thể:**
- Kéo task từ Monday, thả vào `.day-header` của Tuesday → `store.draggedTask` bị xóa, task biến mất khỏi Monday
- Kéo task vào ngày đích đã có 10 tasks → alert hiển thị nhưng drag tiếp theo không hoạt động
- Kéo task vào `.stats-row` → tương tự trường hợp đầu

---

## Expected Behavior

### Preservation Requirements

**Hành vi không được thay đổi:**
- Mouse click vào button, checkbox, input vẫn hoạt động bình thường
- Tooltip viết tắt với nội dung bình thường (chữ cái, số, khoảng trắng) vẫn hiển thị đúng định dạng `key: value`
- Drag & drop hợp lệ (ngày đích còn chỗ, drop đúng vào `.task-list`) vẫn di chuyển task thành công
- Swap task trong cùng ngày (`dropOnTaskItem`) không bị ảnh hưởng
- Wave chart tooltip vẫn hiển thị đúng nội dung `done/total tasks`
- Ẩn tooltip khi rời khỏi `.t-name` vẫn hoạt động ngay lập tức

**Scope:**
Tất cả input không thuộc bug condition (zoom = 1.0, nội dung viết tắt không có ký tự đặc biệt, drop vào vùng hợp lệ còn chỗ) phải cho kết quả giống hệt F.

---

## Hypothesized Root Cause

### Bug 1 — Tooltip Drift

1. **Sai coordinate space**: `position: absolute` trên tooltip được tính trong layout coordinate space của document. Khi `body` có `zoom: 1.1`, `e.pageX` trả về giá trị trong visual viewport (đã scale), nhưng `left/top` của element absolute lại được tính trong layout viewport (chưa scale). Cần dùng `e.clientX + window.scrollX` để lấy tọa độ trong layout space.

2. **Hardcode hệ số zoom**: Chia cho `1.1` chỉ đúng khi zoom chính xác là 1.1. Nếu người dùng thay đổi CSS hoặc dùng browser zoom thêm, tooltip sẽ lệch.

### Bug 2 — XSS

3. **Dùng `innerHTML` với dữ liệu người dùng**: `foundAbbrs.push(`<b>${k}</b>: ${v}`)` nhúng `k` và `v` trực tiếp vào HTML string. Cần escape trước khi nhúng, hoặc dùng DOM API thay vì string concatenation.

4. **Không escape key trong RegExp**: `new RegExp(`\\b${k}\\b`, 'i')` — nếu `k` chứa ký tự regex đặc biệt như `.`, `*`, `(`, `)`, regex sẽ bị lỗi hoặc match sai.

### Bug 3 — Drag & Drop

5. **Xóa state quá sớm**: `store.draggedTask = null` ở dòng đầu `dropTask()` trước khi validate. Cần validate trước, chỉ xóa sau khi xác nhận thao tác hợp lệ.

6. **Không có `dragend` fallback**: Khi drop vào vùng không có handler (ngoài `.task-list`), `store.draggedTask` không bao giờ được reset, gây memory leak nhỏ và state không nhất quán.

---

## Correctness Properties

Property 1: Bug Condition — Tooltip hiển thị đúng vị trí bất kể CSS zoom

_For any_ `mousemove` event trên `wave circle` hoặc `.t-name` khi `body` có `zoom != 1.0`, hàm `showTooltip'` và abbr handler đã sửa SHALL hiển thị tooltip với `left/top` sai số < 5px so với vị trí con trỏ thực tế, bằng cách tính tọa độ từ `e.clientX + window.scrollX` thay vì `e.pageX / 1.1`.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Nội dung viết tắt được render an toàn

_For any_ cặp `(abbrKey, abbrValue)` trong `appData.abbrs` có chứa ký tự HTML đặc biệt (`<`, `>`, `"`, `'`, `&`), hàm abbr handler đã sửa SHALL hiển thị đúng ký tự gốc trong tooltip mà không thực thi HTML/JS, bằng cách escape nội dung trước khi gán vào `innerHTML` hoặc dùng `textContent`.

**Validates: Requirements 2.3, 2.4, 2.5**

Property 3: Bug Condition — Drag & Drop không làm mất dữ liệu nguồn khi drop không hợp lệ

_For any_ thao tác drop mà `isBugCondition_DragDrop(X)` trả về `true` (drop ngoài vùng hợp lệ hoặc ngày đích đầy), hàm `dropTask'` đã sửa SHALL bảo toàn toàn bộ dữ liệu tại `sourceDayIdx` và giữ `store.draggedTask` ở trạng thái hợp lệ cho thao tác tiếp theo.

**Validates: Requirements 2.6, 2.7**

Property 4: Preservation — Drag & Drop hợp lệ vẫn hoạt động đúng

_For any_ thao tác drop mà `isBugCondition_DragDrop(X)` trả về `false` (drop vào `.task-list` còn chỗ), hàm `dropTask'` SHALL cho kết quả giống hệt `dropTask` gốc: task được di chuyển sang ngày đích, xóa khỏi ngày nguồn, UI cập nhật đúng.

**Validates: Requirements 3.3, 3.4, 3.5**

Property 5: Preservation — Tooltip viết tắt bình thường vẫn hiển thị đúng

_For any_ cặp `(abbrKey, abbrValue)` không chứa ký tự HTML đặc biệt, abbr handler đã sửa SHALL hiển thị tooltip với định dạng `key: value` giống hệt hành vi gốc.

**Validates: Requirements 3.2, 3.6**

---

## Fix Implementation

### Changes Required

**File**: `script.js`

#### Fix 1 — Tooltip Drift

**Function**: `showTooltip(e, dayIndex)` (dòng ~911)

**Thay đổi**:
```javascript
// TRƯỚC (sai):
t.style.left = (e.pageX / 1.1) + 'px';
t.style.top  = ((e.pageY / 1.1) - 15) + 'px';

// SAU (đúng):
t.style.left = (e.clientX + window.scrollX) + 'px';
t.style.top  = (e.clientY + window.scrollY - 15) + 'px';
```

**Function**: `mousemove` abbr handler (dòng ~1266)

**Thay đổi**:
```javascript
// TRƯỚC (sai):
tooltip.style.left = (e.pageX / 1.1) + 'px';
tooltip.style.top  = ((e.pageY / 1.1) + 20) + 'px';

// SAU (đúng):
tooltip.style.left = (e.clientX + window.scrollX) + 'px';
tooltip.style.top  = (e.clientY + window.scrollY + 20) + 'px';
```

#### Fix 2 — XSS

**Function**: `mousemove` abbr handler (dòng ~1258–1268)

Thêm helper `escapeHtml` và sửa cách build tooltip content:

```javascript
// Helper (thêm một lần, dùng chung):
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Trong abbr handler — escape key trước khi dùng trong RegExp:
const safeK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
if (k && v && new RegExp(`\\b${safeK}\\b`, 'i').test(text)) {
    foundAbbrs.push(`<b>${escapeHtml(k)}</b>: ${escapeHtml(v)}`);
}
```

#### Fix 3 — Drag & Drop

**Function**: `dropTask(e, targetDayIdx)` (dòng ~691)

**Thay đổi**: Di chuyển `store.draggedTask = null` xuống sau khi validate thành công:

```javascript
function dropTask(e, targetDayIdx) {
    e.preventDefault();
    if (!store.draggedTask) return;
    const { dIdx: sourceDay, tIdx: sourceTask } = store.draggedTask;
    // KHÔNG xóa store.draggedTask ở đây nữa

    if (sourceDay === targetDayIdx) { store.draggedTask = null; return; }

    let emptyIdx = -1;
    for (let t = 0; t < TASKS_PER_DAY; t++) {
        if (!(store.state.tasks[`t_name_${targetDayIdx}_${t}`] || '').trim()) { emptyIdx = t; break; }
    }
    if (emptyIdx === -1) {
        alert('Day is full. Cannot drag more tasks!');
        // store.draggedTask vẫn còn — drag tiếp theo hoạt động bình thường
        return;
    }

    store.draggedTask = null; // Chỉ xóa sau khi xác nhận hợp lệ
    // ... phần còn lại giữ nguyên
}
```

Thêm `dragend` fallback để cleanup khi drop ra ngoài mọi handler:

```javascript
// Trong initEventDelegation():
mainGrid.addEventListener('dragend', () => { store.draggedTask = null; });
```

---

## Testing Strategy

### Validation Approach

Hai giai đoạn: (1) chạy test trên code **chưa sửa** để xác nhận bug và root cause, (2) chạy lại sau khi sửa để verify fix và preservation.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexample chứng minh bug tồn tại trên code gốc. Xác nhận hoặc bác bỏ root cause hypothesis.

**Test Plan**: Simulate mousemove event với `pageX/clientX` khác nhau, kiểm tra `tooltip.style.left`. Inject XSS payload vào `appData.abbrs`, kiểm tra DOM. Simulate drag & drop vào vùng không hợp lệ, kiểm tra state.

**Test Cases**:
1. **Tooltip Drift Test**: Tạo mousemove event với `clientX=100, pageX=110` (giả lập zoom 1.1), gọi `showTooltip()`, assert `tooltip.style.left` ≈ `"110px"` (pageX/1.1 = 100) vs `"110px"` (clientX+scrollX) — sẽ fail trên code gốc nếu scroll > 0
2. **XSS Injection Test**: Set `appData.abbrs.abbr_v_1 = "<img src=x onerror=window.__xss=1>"`, trigger mousemove trên `.t-name` có từ khớp, assert `window.__xss` không được set (sẽ fail trên code gốc)
3. **Drag Drop Invalid Target Test**: Drag task, drop vào `.day-header`, assert `appData.weeks[sourceDay]` vẫn còn task (sẽ fail trên code gốc)
4. **Drag Drop Full Day Test**: Drag task vào ngày đích đã đầy, assert `store.draggedTask` vẫn còn sau khi alert (sẽ fail trên code gốc)

**Expected Counterexamples**:
- `tooltip.style.left` bị lệch khi `window.scrollX > 0` hoặc zoom != 1.0
- `window.__xss === 1` sau khi inject payload
- Task biến mất khỏi ngày nguồn sau drop không hợp lệ

### Fix Checking

**Goal**: Verify rằng với mọi input thuộc bug condition, F' cho kết quả đúng.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition_TooltipDrift(X) DO
  result ← showTooltip'(X)
  ASSERT ABS(tooltip.getBoundingClientRect().left - X.clientX) < 5
END FOR

FOR ALL X WHERE isBugCondition_XSS(X) DO
  result ← abbrHandler'(X)
  ASSERT tooltip.textContent CONTAINS escapeHtml(X.abbrValue)
  ASSERT window.__xss IS UNDEFINED
END FOR

FOR ALL X WHERE isBugCondition_DragDrop(X) DO
  stateBefore ← snapshot(appData.weeks[X.sourceDayIdx])
  dropTask'(X)
  stateAfter ← snapshot(appData.weeks[X.sourceDayIdx])
  ASSERT stateBefore = stateAfter
END FOR
```

### Preservation Checking

**Goal**: Verify rằng với mọi input không thuộc bug condition, F'(X) = F(X).

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition_TooltipDrift(X) DO
  ASSERT showTooltip_original(X) = showTooltip_fixed(X)
END FOR

FOR ALL X WHERE NOT isBugCondition_XSS(X) DO
  ASSERT abbrHandler_original(X) = abbrHandler_fixed(X)
END FOR

FOR ALL X WHERE NOT isBugCondition_DragDrop(X) DO
  ASSERT dropTask_original(X) = dropTask_fixed(X)
END FOR
```

**Testing Approach**: Property-based testing phù hợp cho preservation vì:
- Tự sinh nhiều test case với input ngẫu nhiên
- Bắt được edge case mà unit test thủ công bỏ sót
- Đảm bảo mạnh hơn rằng hành vi không thay đổi trên toàn bộ input domain

**Test Cases**:
1. **Tooltip bình thường**: Verify tooltip hiển thị đúng nội dung `done/total` sau fix
2. **Abbr bình thường**: Verify tooltip viết tắt với nội dung không có ký tự đặc biệt vẫn render đúng `<b>key</b>: value`
3. **Drag hợp lệ**: Verify drag task sang ngày còn chỗ vẫn di chuyển đúng
4. **Swap trong ngày**: Verify `dropOnTaskItem` (swap cùng ngày) không bị ảnh hưởng

### Unit Tests

- Test `showTooltip()` với nhiều giá trị `clientX/clientY` và `scrollX/scrollY`
- Test `escapeHtml()` với tất cả ký tự đặc biệt HTML
- Test `dropTask()` với ngày đích đầy — assert state nguồn không thay đổi
- Test `dropTask()` với drop hợp lệ — assert task được di chuyển đúng
- Test RegExp escape với key chứa `.`, `*`, `(`, `)`

### Property-Based Tests

- Sinh ngẫu nhiên `(clientX, clientY, scrollX, scrollY)` — verify tooltip position luôn trong 5px của cursor
- Sinh ngẫu nhiên chuỗi Unicode — verify `escapeHtml` không làm mất ký tự bình thường
- Sinh ngẫu nhiên trạng thái ngày (0–10 tasks) — verify drag hợp lệ luôn thành công, drag không hợp lệ luôn bảo toàn state nguồn

### Integration Tests

- Mở dashboard với `zoom: 1.1`, hover wave chart — verify tooltip bám sát cursor
- Nhập `<script>alert(1)</script>` vào ô viết tắt, hover task có từ khớp — verify không có alert
- Drag task sang ngày đầy, kiểm tra UI — verify task vẫn còn ở ngày nguồn
- Drag task sang ngày hợp lệ — verify cả hai ngày cập nhật đúng trên UI
