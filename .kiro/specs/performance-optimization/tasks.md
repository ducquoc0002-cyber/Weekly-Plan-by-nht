# Implementation Plan

- [ ] 1. Write bug condition exploration test
  - Property 1: Bug Condition - DOM-Driven Save Bottleneck & Render Blocking
  - CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - DO NOT attempt to fix the test or the code when it fails
  - NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - GOAL: Surface counterexamples that demonstrate the bugs exist
  - Bug 1 - DOM scan: call saveData() and measure time; assert execution < 16ms (currently scans 70+ DOM nodes synchronously, will exceed 16ms)
  - Bug 2 - mousemove rAF: simulate mousemove on a non-.t-name element; assert requestAnimationFrame is NOT called (currently always fires rAF)
  - Bug 3 - drag/drop double render: call dropTask() between two days; assert scheduleUIUpdate is called at most once per day per animation frame (currently called twice in same frame)
  - Bug 4 - modal innerHTML leak: open Monthly Summary modal 3 times; assert #monthly-bar-chart child node count stays constant (currently accumulates nodes)
  - Run tests on UNFIXED code
  - EXPECTED OUTCOME: Tests FAIL (this is correct - it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failures are documented
  - Requirements: 1.1, 1.2, 1.3, 2.1, 2.3, 3.1, 3.2, 4.1, 4.2

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - Property 2: Preservation - Save Integrity, Tooltip, Drag Sort, Modal Charts
  - Follow observation-first methodology
  - Observe: after saveData(), appData.weeks[viewingWeekId].tasks contains correct values for all 70 task fields on unfixed code
  - Observe: mousemove on a .t-name input containing an abbreviation key shows tooltip with correct content
  - Observe: after dropTask(), sortTasks() produces correct priority order (star, 0, 1, 2, 3) on target day
  - Observe: loadMonthlyData() renders bar chart and pie chart with correct data when appData.weeks has entries
  - Write property-based tests: for all valid week data objects, saveData() then loadWeekData() round-trip preserves all task/habit/note values
  - Write property-based tests: for all .t-name inputs with abbreviation text, tooltip displays matching abbreviation entries
  - Write property-based tests: for all drag operations, resulting task order satisfies priority sort invariant
  - Write property-based tests: for all modal open/close cycles, activeModalCount returns to its pre-open value
  - Verify tests pass on UNFIXED code
  - EXPECTED OUTCOME: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10

- [ ] 3. Fix Bug 1 - DOM-Driven State and Save Bottleneck

  - [ ] 3.1 Introduce in-memory state mirror and debounced save
    - Add _state object mirroring all task/habit/note fields, updated on every input event instead of reading DOM
    - Replace saveData() DOM scan loop with a read from _state object
    - Replace direct saveData() calls on onchange with scheduleSave() (already exists, ensure all handlers use it)
    - Ensure loadWeekData() populates _state after loading from appData
    - Bug_Condition: any onchange handler calls saveData() directly, causing synchronous DOM scan of 70+ elements
    - Expected_Behavior: saveData() reads from _state object; execution time < 16ms; debounce 400ms groups rapid changes
    - Preservation: task/habit/note data round-trip through save/load unchanged (3.1, 3.2)
    - Requirements: 2.1, 2.2, 2.3

  - [ ] 3.2 Verify bug condition exploration test now passes
    - Property 1: Expected Behavior - Save executes under 16ms from in-memory state
    - IMPORTANT: Re-run the SAME test from task 1 - do NOT write a new test
    - Run saveData() timing assertion from step 1
    - EXPECTED OUTCOME: Test PASSES (confirms bug is fixed)
    - Requirements: 2.1, 2.2, 2.3

  - [ ] 3.3 Verify preservation tests still pass
    - Property 2: Preservation - Save/load round-trip integrity
    - IMPORTANT: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run save/load round-trip property tests from step 2
    - EXPECTED OUTCOME: Tests PASS (confirms no regressions)

- [ ] 4. Fix Bug 2 - Render Blocking and Repaint

  - [ ] 4.1 Add early-exit guard in mousemove handler and remove backdrop-filter from .nav-btn
    - In document.addEventListener('mousemove'): add early return if e.target is not .t-name BEFORE creating requestAnimationFrame
    - Remove backdrop-filter: blur(8px) from .nav-btn rule in style.css (keep only on .modal-overlay and .context-menu)
    - Bug_Condition: e.target is not a .t-name element but rAF is still scheduled
    - Expected_Behavior: rAF not created when target is not .t-name; GPU compositing reduced to modal/context-menu only
    - Preservation: tooltip still shows for .t-name inputs with abbreviation matches (3.3); CSS Bento Grid keeps blur on modal-overlay and context-menu (3.7)
    - Requirements: 2.4, 2.5, 2.6

  - [ ] 4.2 Verify bug condition exploration test now passes
    - Property 1: Expected Behavior - mousemove on non-.t-name does not schedule rAF
    - IMPORTANT: Re-run the SAME test from task 1 - do NOT write a new test
    - Run rAF guard assertion from step 1
    - EXPECTED OUTCOME: Test PASSES (confirms bug is fixed)
    - Requirements: 2.4, 2.6

  - [ ] 4.3 Verify preservation tests still pass
    - Property 2: Preservation - Tooltip behavior and CSS blur on modal/context-menu
    - IMPORTANT: Re-run the SAME tests from task 2 - do NOT write new tests
    - EXPECTED OUTCOME: Tests PASS (confirms no regressions)

- [ ] 5. Fix Bug 3 - Drag and Drop Inconsistency

  - [ ] 5.1 Batch re-render into single rAF and sync data-priority on swap
    - In dropTask(): replace two separate scheduleUIUpdate calls with a single requestAnimationFrame that calls updateDay(sourceDay), updateDay(targetDayIdx), updateWeeklySummary(), drawWaveChart()
    - In dropOnTaskItem() same-priority swap: sync data-priority attributes on both elements before calling scheduleUIUpdate
    - In dropTask(): after resetting source task, call scheduleUIUpdate(sourceDay) immediately so badge and stats update in same frame
    - Bug_Condition: two scheduleUIUpdate calls fire for same animation frame, or data-priority not synced on same-priority swap
    - Expected_Behavior: single rAF renders both days; data-priority attributes correct immediately after swap
    - Preservation: priority sort order star,0,1,2,3 maintained (3.4); border-left color and star badge correct after first render (3.5)
    - Requirements: 2.7, 2.8, 2.9

  - [ ] 5.2 Verify bug condition exploration test now passes
    - Property 1: Expected Behavior - Single rAF per drop, data-priority synced immediately
    - IMPORTANT: Re-run the SAME test from task 1 - do NOT write a new test
    - Run double-render and data-priority assertions from step 1
    - EXPECTED OUTCOME: Test PASSES (confirms bug is fixed)
    - Requirements: 2.7, 2.8, 2.9

  - [ ] 5.3 Verify preservation tests still pass
    - Property 2: Preservation - Drag sort order and visual state
    - IMPORTANT: Re-run the SAME tests from task 2 - do NOT write new tests
    - EXPECTED OUTCOME: Tests PASS (confirms no regressions)

- [ ] 6. Fix Bug 4 - Modal Leak and Sync Hang

  - [ ] 6.1 Clear innerHTML before redraw and fix AbortController timeout
    - In loadMonthlyData(): clear innerHTML of monthly-bar-chart, monthly-pie-chart, and modal-weekly-cols at the very start before any computation
    - In closeMonthlyModal(): clear innerHTML of monthly-bar-chart and monthly-pie-chart to release SVG nodes on close
    - In loadGlobalDataFromDB(): change setTimeout abort from 8000ms to 5000ms
    - In loadGlobalDataFromDB() catch block: add clearTimeout(timeout) as first statement to prevent double-execution
    - Bug_Condition: innerHTML is appended without clearing, or timeout is 8000ms without clearTimeout in catch
    - Expected_Behavior: innerHTML cleared before redraw; modal close releases SVG nodes; timeout 5s; clearTimeout in both success and catch paths
    - Preservation: bar chart, pie chart, and 5 week cards render correctly with accurate data (3.6); activeModalCount stays accurate (3.9); wave chart Bezier curve unaffected (3.10)
    - Requirements: 2.10, 2.11, 2.12, 2.13

  - [ ] 6.2 Verify bug condition exploration test now passes
    - Property 1: Expected Behavior - Modal DOM node count stays constant across multiple opens
    - IMPORTANT: Re-run the SAME test from task 1 - do NOT write a new test
    - Run modal innerHTML leak assertion from step 1
    - EXPECTED OUTCOME: Test PASSES (confirms bug is fixed)
    - Requirements: 2.10, 2.11

  - [ ] 6.3 Verify preservation tests still pass
    - Property 2: Preservation - Monthly modal charts render correctly, activeModalCount accurate
    - IMPORTANT: Re-run the SAME tests from task 2 - do NOT write new tests
    - EXPECTED OUTCOME: Tests PASS (confirms no regressions)

- [ ] 7. Checkpoint - Ensure all tests pass
  - Re-run all property tests from tasks 1 and 2
  - Verify Property 1 (Bug Condition) passes for all 4 bug groups
  - Verify Property 2 (Preservation) passes for all regression scenarios
  - Manually verify: type quickly in task inputs, no input lag; move mouse over non-task areas, fan stays quiet; drag task between days, no flicker; open Monthly Summary 5 times, no slowdown
  - Ensure all tests pass, ask the user if questions arise
