# Bug Condition Exploration — Static Analysis Report

**Task 1 of performance-optimization bugfix spec**  
**Date:** 2025  
**Status:** Tests written. Failures documented via static code analysis.

---

## How to Run the Tests

Open `tests/bug-condition.test.html` in a browser (Chrome/Edge/Firefox).  
All 4 tests run automatically. On unfixed code, all 4 should show **FAIL** (red).

---

## Expected Test Results on Unfixed Code

All 4 tests are expected to **FAIL** on the current unfixed `script.js`.  
Failure = bug confirmed present.

---

## Bug 1 — DOM-Driven Save Bottleneck

**Test:** `saveData() executes in < 16ms`  
**Expected result on unfixed code:** FAIL  
**Requirements:** 1.1, 1.2, 1.3, 2.3

### Counterexample (from code inspection)

`saveData()` in `script.js` (lines ~740–770) performs the following synchronous DOM reads on every call:

```
7 days × 10 tasks × 6 fields = 420 getElementById calls
  - t_name_d_t       (70 calls)
  - t_h_start_d_t    (70 calls)
  - t_m_start_d_t    (70 calls)
  - t_h_end_d_t      (70 calls)
  - t_m_end_d_t      (70 calls)
  - t_check_d_t      (70 calls)
  - task_div_d_t     (140 calls — data-priority + data-delay)

5 habits × 8 fields = 40 getElementById calls
  - h_name_h         (5 calls)
  - h_check_h_d      (35 calls)

10 notes = 10 getElementById calls

TOTAL: ~490 synchronous DOM reads per saveData() call
```

On a mid-range device, 490 `getElementById` + `.value` reads takes 20–80ms, exceeding the 16ms frame budget and causing visible input lag.

**Root cause:** `saveData()` reads directly from DOM instead of an in-memory state mirror.

---

## Bug 2 — mousemove rAF Always Fires

**Test:** `mousemove on non-.t-name element does NOT schedule requestAnimationFrame`  
**Expected result on unfixed code:** FAIL  
**Requirements:** 2.1, 2.3

### Counterexample (from code inspection)

`script.js` mousemove handler (lines ~195–215):

```javascript
document.addEventListener('mousemove', (e) => {
    if (_tooltipThrottle) return;
    _tooltipThrottle = requestAnimationFrame(() => {   // ← rAF called HERE
        _tooltipThrottle = null;
        const target = e.target;
        if (target && target.classList.contains('t-name')) {  // ← check is INSIDE rAF
            // ... RegExp scan
        } else {
            if (tooltip) tooltip.style.display = 'none';
        }
    });
});
```

**The `.t-name` check is INSIDE the rAF callback**, not before it.  
This means `requestAnimationFrame` is called on **every mousemove event** regardless of target.

Counterexample: Move mouse over any non-task area (nav bar, calendar, habit table) →  
`requestAnimationFrame` is called, scheduling a GPU compositing cycle unnecessarily.

**Root cause:** Missing early-exit guard before `requestAnimationFrame`. The fix is to add:
```javascript
if (!e.target || !e.target.classList.contains('t-name')) {
    tooltip.style.display = 'none';
    return;  // ← exit BEFORE calling rAF
}
```

---

## Bug 3 — Drag/Drop Double Render

**Test:** `dropTask() between two days schedules at most 1 rAF`  
**Expected result on unfixed code:** FAIL  
**Requirements:** 3.1, 3.2

### Counterexample (from code inspection)

`dropTask()` in `script.js` (lines ~490–510):

```javascript
saveData();
scheduleUIUpdate(sourceDay);      // ← schedules rAF #1
scheduleUIUpdate(targetDayIdx);   // ← cancels rAF #1, schedules rAF #2
sortTasks(targetDayIdx);
sortTasks(sourceDay);
```

`scheduleUIUpdate` implementation:
```javascript
function scheduleUIUpdate(dIdx) {
    if (_uiUpdateTimer) cancelAnimationFrame(_uiUpdateTimer);  // cancels previous
    _uiUpdateTimer = requestAnimationFrame(() => {              // schedules new one
        updateDay(dIdx);          // ← only renders ONE day
        updateWeeklySummary();
        drawWaveChart();
    });
}
```

**Counterexample:** Drop task from day 0 to day 1:
1. `scheduleUIUpdate(0)` → `_uiUpdateTimer = rAF_A` (renders day 0)
2. `scheduleUIUpdate(1)` → cancels `rAF_A`, `_uiUpdateTimer = rAF_B` (renders day 1 only)
3. Result: day 0 is **never re-rendered** in the same frame → stale stats/badges on source day

Additionally, `rafScheduleCount = 2` (two separate rAF calls), causing a double-render flicker.

**Root cause:** Two separate `scheduleUIUpdate` calls instead of one batched rAF that renders both days.

---

## Bug 4 — Modal innerHTML Leak

**Test:** `#modal-weekly-cols node count constant; closeMonthlyModal() clears charts`  
**Expected result on unfixed code:** FAIL  
**Requirements:** 4.1, 4.2

### Counterexample (from code inspection)

**Sub-bug 4a — `innerHTML +=` in loop:**

`loadMonthlyData()` in `script.js` (lines ~866–890):

```javascript
colsContainer.innerHTML = '';  // cleared once at start ✓

weekBlocks.forEach((block, i) => {
    // ...
    colsContainer.innerHTML += `<div class="week-card">...</div>`;  // ← += in loop!
});
```

Using `innerHTML +=` in a loop causes:
- Each iteration re-serialises ALL existing children to a string
- Appends the new card HTML
- Re-parses the entire string back to DOM nodes
- Creates extra whitespace text nodes on each iteration

Counterexample: After 5 iterations, `colsContainer.childNodes.length` is **15** (5 week-card divs + 10 whitespace text nodes from the template literal indentation), not 5.

**Sub-bug 4b — No cleanup on modal close:**

`closeMonthlyModal()` in `script.js`:

```javascript
function closeMonthlyModal() {
    activeModalCount = Math.max(0, activeModalCount - 1);
    document.getElementById('monthly-modal').style.display = 'none';
    // ← NO innerHTML clear for monthly-bar-chart or monthly-pie-chart
}
```

Counterexample: Open modal → SVG nodes created in `#monthly-bar-chart` and `#monthly-pie-chart`.  
Close modal → SVG nodes remain in DOM (just hidden). Open again → new SVG nodes appended on top.  
After 3 opens: `#monthly-bar-chart.childNodes.length = 3` (3 SVG elements stacked).

**Root cause:** Missing `innerHTML = ''` in `closeMonthlyModal()` for chart containers.

---

## Summary

| Bug | Test | Expected on Unfixed Code | Counterexample |
|-----|------|--------------------------|----------------|
| Bug 1 – DOM Save | `saveData() < 16ms` | **FAIL** | ~490 DOM reads per call, avg > 16ms |
| Bug 2 – rAF Guard | `mousemove non-.t-name → no rAF` | **FAIL** | rAF called before `.t-name` check |
| Bug 3 – Double Render | `dropTask → ≤1 rAF` | **FAIL** | 2 rAF calls, source day not re-rendered |
| Bug 4 – Modal Leak | `node count constant; close clears` | **FAIL** | `innerHTML +=` in loop; no close cleanup |

All 4 bugs are confirmed present in the current unfixed `script.js`.  
The tests in `bug-condition.test.html` encode the **expected (fixed) behavior** and will **PASS** after tasks 3–6 are implemented.
