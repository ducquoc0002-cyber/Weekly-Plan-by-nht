# Bugfix Requirements Document

## Introduction

Tài liệu này mô tả 3 lỗi cần sửa trong ứng dụng web Weekly Plan Dashboard (`script.js`, `index.html`, `style.css`):

1. **Tooltip Drift** — Tooltip bị lệch vị trí trên màn hình laptop dùng Microsoft Edge do tính toán tọa độ sai khi trang có `zoom: 1.1` trong CSS.
2. **XSS/Rendering ký tự đặc biệt trong Viết tắt** — Tooltip dùng `innerHTML` để render nội dung viết tắt mà không escape HTML, gây vỡ giao diện hoặc lỗ hổng XSS khi người dùng nhập ký tự đặc biệt (`<`, `>`, `"`, `/`).
3. **Drag & Drop ghi đè dữ liệu sai** — Khi thả thẻ công việc vào vùng trống ngoài `task-list` hợp lệ (khe hở giữa các ô, vùng ngoài danh sách), sự kiện `drop` vẫn được xử lý và ghi đè dữ liệu sai vị trí.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 — Tooltip Drift:**

1.1 WHEN người dùng di chuyển chuột vào điểm dữ liệu trên biểu đồ sóng (`wave-points circle`) THEN hệ thống hiển thị `chart-tooltip` bị lệch xuống dưới hoặc lệch góc so với con trỏ chuột trên trình duyệt Edge với màn hình laptop có `zoom: 1.1`

1.2 WHEN người dùng di chuyển chuột vào ô nhập tên công việc (`.t-name`) có chứa từ viết tắt THEN hệ thống hiển thị `abbr-tooltip` bị lệch vị trí do tọa độ `e.pageX / 1.1` và `e.pageY / 1.1` không bù đúng cho CSS zoom trên Edge

**Bug 2 — XSS/Rendering ký tự đặc biệt:**

2.1 WHEN người dùng nhập ký tự `<` hoặc `>` vào ô giá trị viết tắt (`abbr_v_i`) THEN hệ thống render `abbr-tooltip` bị vỡ giao diện do `tooltip.innerHTML` diễn giải ký tự đó như thẻ HTML

2.2 WHEN người dùng nhập ký tự `"` hoặc `/` vào ô khóa viết tắt (`abbr_k_i`) THEN hệ thống có thể tạo ra regex không hợp lệ hoặc render sai nội dung tooltip

2.3 WHEN người dùng nhập chuỗi dạng `<script>` hoặc `<img onerror=...>` vào ô viết tắt THEN hệ thống thực thi mã JavaScript tùy ý thông qua `tooltip.innerHTML`

**Bug 3 — Drag & Drop ghi đè dữ liệu sai:**

3.1 WHEN người dùng kéo thẻ công việc và thả vào khe hở giữa các ô task (vùng padding/gap của `.task-list`) THEN hệ thống gọi `dropTask()` với `targetDayIdx` đúng nhưng ghi đè vào slot trống đầu tiên mà không kiểm tra xem vị trí thả có hợp lệ không, khiến thẻ biến mất khỏi ngày nguồn

3.2 WHEN người dùng kéo thẻ công việc và thả ra ngoài vùng `.task-list` (ví dụ: vào `.day-header`, `.stats-row`, hoặc vùng trống ngoài lưới) THEN hệ thống không chặn thao tác, `store.draggedTask` bị xóa nhưng dữ liệu nguồn đã bị xóa khỏi state trước khi kiểm tra tính hợp lệ

3.3 WHEN người dùng kéo thẻ công việc từ ngày này sang ngày khác và ngày đích đã đầy (10 tasks) THEN hệ thống hiển thị `alert()` nhưng đã xóa `store.draggedTask = null` trước khi kiểm tra, khiến thao tác drag tiếp theo không hoạt động đúng

---

### Expected Behavior (Correct)

**Bug 1 — Tooltip Drift:**

2.1 WHEN người dùng di chuyển chuột vào điểm dữ liệu trên biểu đồ sóng THEN hệ thống SHALL hiển thị `chart-tooltip` bám sát vị trí con trỏ chuột chính xác trên mọi trình duyệt và mọi mức zoom màn hình bằng cách dùng `e.clientX`/`e.clientY` kết hợp `window.scrollX`/`window.scrollY` thay vì chia cho hệ số zoom cứng

2.2 WHEN người dùng di chuyển chuột vào ô `.t-name` có chứa từ viết tắt THEN hệ thống SHALL hiển thị `abbr-tooltip` tại vị trí đúng ngay cạnh con trỏ chuột, không bị lệch, bằng cách tính tọa độ không phụ thuộc vào giá trị zoom CSS

**Bug 2 — XSS/Rendering ký tự đặc biệt:**

2.3 WHEN người dùng nhập bất kỳ ký tự đặc biệt HTML nào (`<`, `>`, `"`, `'`, `&`) vào ô viết tắt THEN hệ thống SHALL hiển thị đúng ký tự đó trong tooltip mà không diễn giải như HTML, bằng cách escape nội dung trước khi gán vào `innerHTML` hoặc dùng `textContent`

2.4 WHEN người dùng nhập ký tự đặc biệt vào ô khóa viết tắt (`abbr_k_i`) THEN hệ thống SHALL escape ký tự đó trước khi dùng làm pattern trong `new RegExp()` để tránh lỗi regex

2.5 WHEN tooltip hiển thị nội dung viết tắt có ký tự đặc biệt THEN hệ thống SHALL render đúng văn bản gốc người dùng nhập, không bị mất ký tự hoặc vỡ layout

**Bug 3 — Drag & Drop ghi đè dữ liệu sai:**

2.6 WHEN người dùng thả thẻ công việc vào vùng không phải `.task-list` hợp lệ THEN hệ thống SHALL hủy thao tác drop và khôi phục `store.draggedTask` về trạng thái ban đầu, giữ nguyên dữ liệu tại vị trí nguồn

2.7 WHEN người dùng thả thẻ công việc vào `.task-list` của ngày đích đã đầy THEN hệ thống SHALL thông báo lỗi và bảo toàn dữ liệu tại vị trí nguồn (không xóa task khỏi ngày nguồn)

2.8 WHEN người dùng thả thẻ công việc vào đúng vị trí hợp lệ (`.task-list` còn chỗ trống) THEN hệ thống SHALL di chuyển task sang ngày đích và xóa khỏi ngày nguồn đúng như thiết kế ban đầu

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN người dùng di chuyển chuột qua vùng không phải `.t-name` THEN hệ thống SHALL CONTINUE TO ẩn `abbr-tooltip` ngay lập tức mà không schedule `requestAnimationFrame`

3.2 WHEN người dùng nhập tên công việc bình thường (không có ký tự đặc biệt) vào `.t-name` THEN hệ thống SHALL CONTINUE TO hiển thị tooltip viết tắt đúng với nội dung khớp từ trong `appData.abbrs`

3.3 WHEN người dùng kéo thả thẻ công việc giữa hai ngày hợp lệ (ngày đích còn chỗ trống) THEN hệ thống SHALL CONTINUE TO di chuyển task thành công, cập nhật UI cả ngày nguồn và ngày đích, và lưu dữ liệu

3.4 WHEN người dùng kéo thả thẻ công việc trong cùng một ngày (swap vị trí) THEN hệ thống SHALL CONTINUE TO hoán đổi đúng hai task và giữ nguyên thứ tự ưu tiên sau khi `sortTasks()` chạy

3.5 WHEN người dùng lưu dữ liệu sau khi drag & drop THEN hệ thống SHALL CONTINUE TO lưu đúng trạng thái mới vào `appData.weeks` và đồng bộ lên Supabase

3.6 WHEN người dùng nhập nội dung viết tắt bình thường (chữ cái, số, khoảng trắng) THEN hệ thống SHALL CONTINUE TO hiển thị tooltip với định dạng `<b>key</b>: value` đúng như hiện tại

3.7 WHEN biểu đồ sóng được vẽ lại sau khi cập nhật dữ liệu THEN hệ thống SHALL CONTINUE TO gắn đúng event listener `mousemove` và `mouseleave` cho từng điểm dữ liệu trên biểu đồ

---

## Bug Condition Pseudocode

### Bug 1 — Tooltip Drift

```pascal
FUNCTION isBugCondition_TooltipDrift(X)
  INPUT: X = { browser: string, cssZoom: number, eventType: string }
  OUTPUT: boolean
  RETURN X.cssZoom != 1.0 AND (X.browser = "Edge" OR X.browser = "Chrome")
         AND (X.eventType = "mousemove" ON ".t-name" OR X.eventType = "mousemove" ON "wave circle")
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition_TooltipDrift(X) DO
  result ← showTooltip'(X) hoặc abbrTooltip'(X)
  ASSERT tooltip.getBoundingClientRect() gần với cursor position (sai số < 5px)
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_TooltipDrift(X) DO
  ASSERT F(X) = F'(X)  // tooltip vẫn hiển thị đúng ở zoom = 1.0
END FOR
```

### Bug 2 — XSS/Rendering ký tự đặc biệt

```pascal
FUNCTION isBugCondition_XSS(X)
  INPUT: X = { abbrKey: string, abbrValue: string }
  OUTPUT: boolean
  RETURN X.abbrKey CONTAINS_ANY ['<', '>', '"', "'", '&', '/']
         OR X.abbrValue CONTAINS_ANY ['<', '>', '"', "'", '&']
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition_XSS(X) DO
  result ← renderTooltip'(X)
  ASSERT tooltip.textContent = escapeHTML(X.abbrValue)
  ASSERT NO script execution occurred
END FOR
```

### Bug 3 — Drag & Drop ghi đè dữ liệu sai

```pascal
FUNCTION isBugCondition_DragDrop(X)
  INPUT: X = { dropTarget: Element, sourceDayIdx: number, sourceTaskIdx: number }
  OUTPUT: boolean
  RETURN X.dropTarget IS NOT INSIDE valid ".task-list"
         OR (X.dropTarget IS INSIDE ".task-list" AND targetDay IS FULL)
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition_DragDrop(X) DO
  stateBefore ← snapshot(appData.weeks[sourceDayIdx])
  dropTask'(X)
  stateAfter ← snapshot(appData.weeks[sourceDayIdx])
  ASSERT stateBefore = stateAfter  // dữ liệu nguồn không bị thay đổi
END FOR
```
