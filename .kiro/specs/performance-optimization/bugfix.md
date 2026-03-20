# Bugfix Requirements Document

## Introduction

Ứng dụng quản lý công việc tuần (vanilla JS + Supabase) đang gặp 4 vấn đề hiệu suất nghiêm trọng ảnh hưởng trực tiếp đến trải nghiệm người dùng: trình duyệt bị freeze khi nhập liệu, quạt laptop tăng tốc khi di chuột, giao diện chớp giật khi kéo thả công việc, và màn hình đồng bộ treo cứng trên mạng yếu. Các lỗi này xuất phát từ việc thiếu state management độc lập, lạm dụng CSS nặng, xử lý DOM trực tiếp trong drag & drop, và quản lý vòng đời modal không đúng cách.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 – DOM-Driven State & Save Bottleneck**

1.1 WHEN người dùng gõ ký tự vào bất kỳ ô nhập liệu nào (task name, time, habit) THEN hệ thống quét toàn bộ cây DOM (70 ô task + time inputs + checkboxes + habits + notes) để thu thập dữ liệu trước khi lưu

1.2 WHEN người dùng tích/bỏ tích checkbox THEN hệ thống gọi `saveData()` đồng bộ ngay lập tức, chặn Main Thread để đọc tất cả 70+ DOM elements và ghi vào localStorage + kích hoạt upsert Supabase

1.3 WHEN người dùng gõ nhanh liên tiếp THEN hệ thống tạo nhiều lần gọi `saveData()` chồng chất do `onchange` gắn trực tiếp trên từng input, gây input lag rõ rệt trên Edge

**Bug 2 – Render Blocking & Repaint**

2.1 WHEN người dùng di chuột qua danh sách công việc THEN hệ thống thực thi RegExp scan (`new RegExp(\`\\b${k}\\b\`, 'i')`) cho tất cả 10 từ viết tắt trên mỗi frame animation, ngay cả khi con trỏ không nằm trên `.t-name` input

2.2 WHEN trang đang hiển thị THEN `backdrop-filter: blur(8px)` được áp dụng đồng thời trên `.modal-overlay`, `.nav-btn`, `.context-menu` khiến GPU phải composite nhiều lớp kính mờ liên tục, gây drop FPS khi cuộn và tăng nhiệt thiết bị

2.3 WHEN người dùng di chuột THEN sự kiện `mousemove` gắn vào `document` kích hoạt `requestAnimationFrame` callback trên mỗi frame ngay cả khi không có `.t-name` nào trong viewport

**Bug 3 – Drag & Drop Inconsistency**

3.1 WHEN người dùng thả task sang ngày khác THEN hệ thống gọi `scheduleUIUpdate()` cho cả ngày nguồn lẫn ngày đích đồng thời với `sortTasks()`, tạo ra hai lần re-render DOM liên tiếp trong cùng một animation frame gây chớp giật

3.2 WHEN `dropOnTaskItem()` hoán đổi hai task có cùng priority THEN hệ thống không cập nhật `data-priority` attribute trên DOM element đích, khiến badge ⭐ và màu border-left hiển thị sai vị trí thoáng qua cho đến lần render tiếp theo

3.3 WHEN `dropTask()` di chuyển task sang ngày đích THEN hệ thống reset `data-priority` của task nguồn về `"3"` (Clear) nhưng không gọi lại `updateDay()` ngay lập tức, khiến delay badge và số liệu tổng kết ngày nguồn hiển thị sai trong khoảng thời gian ngắn

**Bug 4 – Modal Leak & Sync Hang**

4.1 WHEN người dùng mở Modal Tổng kết tháng THEN hệ thống ghi toàn bộ SVG bar chart và pie chart vào `innerHTML` của container mà không xóa nội dung cũ trước, tích lũy DOM nodes qua mỗi lần mở

4.2 WHEN người dùng mở/đóng Modal Tổng kết tháng nhiều lần THEN hệ thống không giải phóng SVG elements cũ, khiến độ trễ mở modal tăng dần theo số lần mở do DOM ngày càng phình to

4.3 WHEN kết nối mạng yếu hoặc Supabase phản hồi chậm THEN hệ thống hiển thị màn hình "Syncing data..." treo cứng tối đa 8 giây do `setTimeout(() => controller.abort(), 8000)` cứng nhắc, không có cơ chế fallback sớm hơn

4.4 WHEN `AbortController` timeout kích hoạt sau 8 giây THEN hệ thống không `clearTimeout(timeout)` trong nhánh lỗi của `catch`, có thể gây double-execution của cleanup logic

---

### Expected Behavior (Correct)

**Bug 1 – DOM-Driven State & Save Bottleneck**

2.1 WHEN người dùng gõ ký tự vào ô nhập liệu THEN hệ thống SHALL cập nhật in-memory state object trực tiếp thay vì quét DOM, và chỉ đọc DOM khi cần thiết

2.2 WHEN người dùng tích/bỏ tích checkbox THEN hệ thống SHALL debounce việc lưu dữ liệu (tối thiểu 400ms) để gộp nhiều thay đổi liên tiếp thành một lần ghi duy nhất

2.3 WHEN `saveData()` được gọi THEN hệ thống SHALL đọc từ in-memory state thay vì quét lại toàn bộ DOM, giảm thời gian thực thi xuống dưới 16ms để không chặn Main Thread

**Bug 2 – Render Blocking & Repaint**

2.4 WHEN người dùng di chuột THEN hệ thống SHALL chỉ thực thi RegExp scan khi `e.target` là một `.t-name` element, bỏ qua hoàn toàn khi con trỏ ở vùng khác

2.5 WHEN trang hiển thị bình thường (không có modal mở) THEN hệ thống SHALL giới hạn `backdrop-filter` chỉ áp dụng trên các element thực sự cần hiệu ứng kính mờ, không áp dụng toàn diện trên `.nav-btn`

2.6 WHEN không có `.t-name` nào đang được hover THEN hệ thống SHALL thoát sớm khỏi `mousemove` handler trước khi tạo `requestAnimationFrame`, tránh lãng phí chu kỳ GPU

**Bug 3 – Drag & Drop Inconsistency**

2.7 WHEN người dùng thả task sang ngày khác THEN hệ thống SHALL cập nhật in-memory state trước, sau đó thực hiện một lần re-render duy nhất cho cả hai ngày trong cùng một `requestAnimationFrame`

2.8 WHEN `dropOnTaskItem()` hoán đổi hai task THEN hệ thống SHALL đồng bộ đầy đủ tất cả attributes (`data-priority`, `data-delay`) trên cả hai DOM elements trước khi gọi `scheduleUIUpdate()`

2.9 WHEN drag & drop hoàn tất THEN hệ thống SHALL đảm bảo badge, màu border-left, và biểu tượng ⭐ phản ánh đúng state ngay sau lần render đầu tiên, không có trạng thái trung gian sai

**Bug 4 – Modal Leak & Sync Hang**

2.10 WHEN người dùng mở Modal Tổng kết tháng THEN hệ thống SHALL xóa sạch nội dung SVG cũ (`innerHTML = ''`) trước khi vẽ lại, đảm bảo không tích lũy DOM nodes

2.11 WHEN Modal Tổng kết tháng được đóng THEN hệ thống SHALL giải phóng SVG content để giữ memory footprint ổn định qua nhiều lần mở/đóng

2.12 WHEN kết nối mạng yếu THEN hệ thống SHALL hiển thị màn hình loading tối đa 5 giây (thay vì 8 giây) trước khi fallback sang dữ liệu local cache, tránh treo UI quá lâu

2.13 WHEN `AbortController` timeout kích hoạt hoặc request thành công THEN hệ thống SHALL luôn gọi `clearTimeout(timeout)` trong cả nhánh thành công lẫn nhánh lỗi để tránh memory leak

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN người dùng nhập task name và thay đổi checkbox THEN hệ thống SHALL CONTINUE TO lưu đầy đủ dữ liệu vào localStorage và đồng bộ lên Supabase sau khi debounce

3.2 WHEN `saveData()` hoàn tất THEN hệ thống SHALL CONTINUE TO hiển thị toast "✅ Saved" sau khi upsert Supabase thành công

3.3 WHEN người dùng di chuột qua `.t-name` có chứa từ viết tắt THEN hệ thống SHALL CONTINUE TO hiển thị tooltip với đầy đủ nội dung giải thích từ viết tắt

3.4 WHEN người dùng kéo thả task sang ngày khác THEN hệ thống SHALL CONTINUE TO thực hiện Priority Sorting đúng thứ tự (star → 0 → 1 → 2 → 3) trên cả ngày nguồn và ngày đích

3.5 WHEN drag & drop hoàn tất THEN hệ thống SHALL CONTINUE TO hiển thị đúng màu border-left, badge delay, và biểu tượng ⭐ theo priority của từng task

3.6 WHEN người dùng mở Modal Tổng kết tháng THEN hệ thống SHALL CONTINUE TO hiển thị đúng bar chart, pie chart, và 5 week cards với số liệu chính xác

3.7 WHEN CSS Bento Grid hiển thị THEN hệ thống SHALL CONTINUE TO duy trì hiệu ứng kính mờ trên các element được thiết kế có `backdrop-filter` (modal overlay, context menu)

3.8 WHEN mạng yếu và fallback sang local cache THEN hệ thống SHALL CONTINUE TO không ghi đè dữ liệu cloud bằng dữ liệu local cũ hơn

3.9 WHEN người dùng mở/đóng modal nhiều lần THEN hệ thống SHALL CONTINUE TO duy trì `activeModalCount` chính xác để ẩn/hiện `!!` indicator trên day header đúng cách

3.10 WHEN Wave Chart được vẽ lại THEN hệ thống SHALL CONTINUE TO hiển thị đúng đường cong Bezier và tooltip số liệu khi hover vào các điểm dữ liệu
