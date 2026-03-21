# Implementation Plan

- [x] 1. Viết bug condition exploration test (TRƯỚC khi sửa)
  - **Property 1: Bug Condition** - Tooltip Drift, XSS Injection, Drag & Drop Data Loss
  - **CRITICAL**: Test này PHẢI FAIL trên code chưa sửa — failure xác nhận bug tồn tại
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: Test encode expected behavior — sẽ PASS sau khi fix được áp dụng
  - **GOAL**: Surface counterexample chứng minh 3 bug tồn tại
  - **Scoped PBT Approach**: Scope từng property vào concrete failing case để đảm bảo reproducibility
  - Mở `tests/bug-condition.test.html` trong trình duyệt (Chrome/Edge với zoom 1.1)
  - **Bug 1 — Tooltip Drift**: Tạo mousemove event với `clientX=200, pageX=220` (giả lập zoom 1.1 + scroll), gọi `showTooltip()`, assert `tooltip.style.left` = `"220px"` (clientX + scrollX) chứ không phải `"200px"` (pageX/1.1). Trên code gốc: `pageX/1.1 = 200` → tooltip lệch khi `scrollX > 0`
  - **Bug 2 — XSS**: Set `appData.abbrs.abbr_v_1 = "<img src=x onerror=window.__xss=1>"`, trigger mousemove trên `.t-name` có từ khớp, assert `window.__xss` không được set. Trên code gốc: `innerHTML` thực thi payload → `window.__xss === 1`
  - **Bug 3 — Drag Drop**: Set `store.draggedTask = { dIdx: 0, tIdx: 0 }` với task có data, gọi `dropTask(e, targetDayIdx)` với ngày đích đầy (10 tasks), assert `store.draggedTask` vẫn còn (không bị null) và data ngày nguồn không thay đổi. Trên code gốc: `store.draggedTask = null` ở dòng đầu → drag tiếp theo bị broken
  - Chạy test trên code CHƯA SỬA
  - **EXPECTED OUTCOME**: Tất cả test FAIL (xác nhận 3 bug tồn tại)
  - Ghi lại counterexample tìm được để hiểu root cause
  - Đánh dấu task hoàn thành khi test đã viết, chạy, và failure được ghi lại
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

- [x] 2. Viết preservation property test (TRƯỚC khi sửa)
  - **Property 2: Preservation** - Tooltip bình thường, Abbr không có ký tự đặc biệt, Drag hợp lệ
  - **IMPORTANT**: Theo observation-first methodology — quan sát behavior trên code CHƯA SỬA trước
  - Mở `tests/preservation.test.html` trong trình duyệt
  - **Observe trên code gốc**:
    - `showTooltip()` với zoom=1.0 (scrollX=0, scrollY=0): `tooltip.style.left = clientX + "px"` → đúng
    - Abbr với `k="abc", v="normal text"`: tooltip hiển thị `<b>abc</b>: normal text` → đúng
    - `dropTask()` với ngày đích còn chỗ: task di chuyển thành công, data nguồn bị xóa → đúng
    - `dropOnTaskItem()` swap cùng ngày: hai task hoán đổi đúng → đúng
  - Viết property-based test: for all `(clientX, scrollX)` với scrollX=0 (không phải bug condition), `showTooltip()` cho `left = clientX + "px"` (từ Preservation Requirements trong design)
  - Viết property-based test: for all `(k, v)` không chứa `<>'"&`, tooltip render đúng `<b>k</b>: v`
  - Viết property-based test: for all drag hợp lệ (ngày đích còn chỗ), task di chuyển đúng và state nhất quán
  - Chạy test trên code CHƯA SỬA
  - **EXPECTED OUTCOME**: Tất cả test PASS (xác nhận baseline behavior)
  - Đánh dấu task hoàn thành khi test đã viết, chạy, và passing trên code chưa sửa
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Sửa Bug 1 — Tooltip Drift

  - [x] 3.1 Sửa `showTooltip()` — thay `e.pageX / 1.1` bằng `e.clientX + window.scrollX`
    - Trong `script.js` tại hàm `showTooltip(e, dayIndex)` (dòng ~911)
    - Thay `t.style.left = (e.pageX / 1.1) + 'px'` → `t.style.left = (e.clientX + window.scrollX) + 'px'`
    - Thay `t.style.top  = ((e.pageY / 1.1) - 15) + 'px'` → `t.style.top = (e.clientY + window.scrollY - 15) + 'px'`
    - _Bug_Condition: isBugCondition_TooltipDrift(X) where X.cssZoom != 1.0 AND X.eventType = "mousemove" ON "wave circle"_
    - _Expected_Behavior: tooltip.style.left = (e.clientX + window.scrollX) + "px" — sai số < 5px so với cursor_
    - _Preservation: zoom=1.0 với scrollX=0 → kết quả giống hệt code gốc (clientX + 0 = pageX / 1.0)_
    - _Requirements: 2.1, 2.2, 3.7_

  - [x] 3.2 Sửa `mousemove` abbr handler — thay `e.pageX / 1.1` bằng `e.clientX + window.scrollX`
    - Trong `script.js` tại mousemove abbr handler (dòng ~1266)
    - Thay `tooltip.style.left = (e.pageX / 1.1) + 'px'` → `tooltip.style.left = (e.clientX + window.scrollX) + 'px'`
    - Thay `tooltip.style.top  = ((e.pageY / 1.1) + 20) + 'px'` → `tooltip.style.top = (e.clientY + window.scrollY + 20) + 'px'`
    - _Bug_Condition: isBugCondition_TooltipDrift(X) where X.cssZoom != 1.0 AND X.eventType = "mousemove" ON ".t-name"_
    - _Expected_Behavior: abbr-tooltip bám sát cursor, sai số < 5px_
    - _Preservation: tooltip ẩn khi rời .t-name vẫn hoạt động ngay lập tức_
    - _Requirements: 2.2, 3.1, 3.6_

- [x] 4. Sửa Bug 2 — XSS / Rendering ký tự đặc biệt

  - [x] 4.1 Thêm helper `escapeHtml` vào `script.js`
    - Thêm function trước mousemove handler (dòng ~1240):
    ```javascript
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    ```
    - _Bug_Condition: isBugCondition_XSS(X) where X.abbrValue CONTAINS_ANY ['<', '>', '"', "'", '&']_
    - _Expected_Behavior: tooltip.textContent = escapeHtml(abbrValue) — không thực thi HTML/JS_
    - _Requirements: 2.3, 2.4, 2.5_

  - [x] 4.2 Escape key trước khi dùng trong RegExp và escape nội dung trước khi gán innerHTML
    - Trong mousemove abbr handler, sửa vòng lặp build `foundAbbrs`:
    ```javascript
    // Escape key để dùng an toàn trong RegExp
    const safeK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (k && v && new RegExp(`\\b${safeK}\\b`, 'i').test(text)) {
        foundAbbrs.push(`<b>${escapeHtml(k)}</b>: ${escapeHtml(v)}`);
    }
    ```
    - Thay `new RegExp(\`\\\\b${k}\\\\b\`, 'i')` → dùng `safeK` đã escape
    - Thay `foundAbbrs.push(\`<b>${k}</b>: ${v}\`)` → dùng `escapeHtml(k)` và `escapeHtml(v)`
    - _Bug_Condition: abbrKey chứa ký tự regex đặc biệt như `.`, `*`, `(`, `)` → regex lỗi hoặc match sai_
    - _Expected_Behavior: RegExp không throw, tooltip hiển thị đúng ký tự gốc_
    - _Preservation: abbr bình thường (chữ cái, số) vẫn render đúng `<b>key</b>: value`_
    - _Requirements: 2.3, 2.4, 2.5, 3.2, 3.6_

- [x] 5. Sửa Bug 3 — Drag & Drop ghi đè dữ liệu sai

  - [x] 5.1 Di chuyển `store.draggedTask = null` xuống sau khi validate thành công trong `dropTask()`
    - Trong `script.js` tại `dropTask(e, targetDayIdx)` (dòng ~691–722)
    - Xóa dòng `store.draggedTask = null;` ở đầu hàm (dòng 695)
    - Thêm `store.draggedTask = null;` ngay trước block "1. Swap in _state first" (sau khi `emptyIdx !== -1`)
    - Kết quả: khi `emptyIdx === -1` (ngày đích đầy), `store.draggedTask` vẫn còn → drag tiếp theo hoạt động
    - _Bug_Condition: isBugCondition_DragDrop(X) where targetDay IS FULL → store.draggedTask bị null trước validate_
    - _Expected_Behavior: stateBefore = stateAfter khi drop không hợp lệ; store.draggedTask còn nguyên_
    - _Preservation: drop hợp lệ (ngày đích còn chỗ) vẫn di chuyển task đúng_
    - _Requirements: 2.6, 2.7, 2.8, 3.3, 3.4, 3.5_

  - [x] 5.2 Thêm `dragend` fallback để cleanup `store.draggedTask` khi drop ra ngoài mọi handler
    - Trong `initEventDelegation()`, sau dòng `mainGrid.addEventListener('drop', handleMainGridDrop)`
    - Thêm: `mainGrid.addEventListener('dragend', () => { store.draggedTask = null; });`
    - Đảm bảo khi user drop vào `.day-header`, `.stats-row`, hoặc vùng ngoài grid, state được reset
    - _Bug_Condition: dropTarget IS NOT INSIDE any ".task-list" → dragend không reset store.draggedTask_
    - _Expected_Behavior: store.draggedTask = null sau mọi drag operation kết thúc_
    - _Preservation: drag hợp lệ vẫn hoạt động (dragend chạy sau drop, draggedTask đã null từ dropTask)_
    - _Requirements: 2.6, 3.3_

- [x] 6. Verify bug condition exploration test đã pass sau fix

  - [x] 6.1 Chạy lại test từ task 1 — xác nhận 3 bug đã được sửa
    - **Property 1: Expected Behavior** - Tooltip Drift, XSS, Drag & Drop
    - **IMPORTANT**: Chạy lại ĐÚNG test từ task 1 — KHÔNG viết test mới
    - Mở `tests/bug-condition.test.html` trong trình duyệt
    - **EXPECTED OUTCOME**: Tất cả test PASS (xác nhận 3 bug đã được sửa)
    - Nếu có test vẫn FAIL: đọc counterexample, quay lại task 3/4/5 để sửa tiếp
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 6.2 Verify preservation test vẫn pass — không có regression
    - **Property 2: Preservation** - Baseline behavior không thay đổi
    - **IMPORTANT**: Chạy lại ĐÚNG test từ task 2 — KHÔNG viết test mới
    - Mở `tests/preservation.test.html` trong trình duyệt
    - **EXPECTED OUTCOME**: Tất cả test PASS (xác nhận không có regression)
    - Nếu có test FAIL: fix đã gây regression — review lại thay đổi trong task 3/4/5
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 7. Checkpoint — Đảm bảo tất cả test pass
  - Chạy lại cả `tests/bug-condition.test.html` và `tests/preservation.test.html`
  - Xác nhận tất cả test PASS trên code đã sửa
  - Kiểm tra thủ công trên trình duyệt: hover wave chart, hover `.t-name` có viết tắt, drag & drop task
  - Nếu có vấn đề phát sinh, hỏi người dùng trước khi tiếp tục
