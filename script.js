﻿/// Weekly Plan Dashboard — script.js
// Architecture: IIFE module with centralized state store
(function () {
'use strict';

// 1. SUPABASE CLIENT
let sbClient;
try {
    sbClient = window.supabase.createClient(
        window.APP_CONFIG.supabaseUrl,
        window.APP_CONFIG.supabaseKey
    );
} catch (err) {
    console.error('[APP] Supabase init failed — config.js may not have loaded:', err);
}

// 2. CONSTANTS
const DAYS_DATA = [
    { name: "Monday",    bg: "var(--day-yellow)", stroke: "var(--stroke-yellow)" },
    { name: "Tuesday",   bg: "var(--day-green)",  stroke: "var(--stroke-green)"  },
    { name: "Wednesday", bg: "var(--day-blue)",   stroke: "var(--stroke-blue)"   },
    { name: "Thursday",  bg: "var(--day-yellow)", stroke: "var(--stroke-yellow)" },
    { name: "Friday",    bg: "var(--day-green)",  stroke: "var(--stroke-green)"  },
    { name: "Saturday",  bg: "var(--day-blue)",   stroke: "var(--stroke-blue)"   },
    { name: "Sunday",    bg: "var(--day-orange)", stroke: "var(--stroke-bright-orange)" }
];
const DAY_KEYS      = ["M", "T", "W", "T", "F", "S", "S"];
const TASKS_PER_DAY = 10;
const HABITS_COUNT  = 5;
const SVG_NS        = 'http://www.w3.org/2000/svg';

// 3. CENTRALIZED STATE STORE
const store = (() => {
    let _currentUser      = null;
    let _appData          = { weeks: {}, monthly: {}, abbrs: {} };
    let _state            = { tasks: {}, habits: {}, notes: {} };
    let _currentRealWeekId = '';
    let _viewingWeekId    = '';
    let _viewingMonthId   = '';
    let _currentMonthId   = '';
    let _isViewingNextWeek = false;
    let _weekDates        = [];
    let _dailyPercents    = [0, 0, 0, 0, 0, 0, 0];
    let _dailyStats       = Array(7).fill(null).map(() => ({ done: 0, total: 0 }));
    let _activeModalCount = 0;
    let _currentRightClickDay  = null;
    let _currentRightClickTask = null;
    let _draggedTaskInfo  = null;
    let _moveTaskSource   = null; // { dIdx, tIdx } — task waiting to be moved

    return {
        // currentUser
        get currentUser()      { return _currentUser; },
        set currentUser(v)     { _currentUser = v; },
        // appData
        get appData()          { return _appData; },
        set appData(v)         { _appData = v; },
        // _state (in-memory DOM mirror)
        get state()            { return _state; },
        resetState()           { const prev = _state; _state = { tasks: {}, habits: {}, notes: {}, notesCount: prev?.notesCount || 10 }; },
        // week/month IDs
        get currentRealWeekId()     { return _currentRealWeekId; },
        set currentRealWeekId(v)    { _currentRealWeekId = v; },
        get viewingWeekId()         { return _viewingWeekId; },
        set viewingWeekId(v)        { _viewingWeekId = v; },
        get viewingMonthId()        { return _viewingMonthId; },
        set viewingMonthId(v)       { _viewingMonthId = v; },
        get currentMonthId()        { return _currentMonthId; },
        set currentMonthId(v)       { _currentMonthId = v; },
        get isViewingNextWeek()     { return _isViewingNextWeek; },
        set isViewingNextWeek(v)    { _isViewingNextWeek = v; },
        // weekDates
        get weekDates()        { return _weekDates; },
        set weekDates(v)       { _weekDates = v; },
        // chart data
        get dailyPercents()    { return _dailyPercents; },
        set dailyPercents(v)   { _dailyPercents = v; },
        get dailyStats()       { return _dailyStats; },
        set dailyStats(v)      { _dailyStats = v; },
        // modal counter
        get activeModalCount() { return _activeModalCount; },
        openModal()            { _activeModalCount++; },
        closeModal()           { _activeModalCount = Math.max(0, _activeModalCount - 1); },
        // right-click context
        get rightClickDay()    { return _currentRightClickDay; },
        get rightClickTask()   { return _currentRightClickTask; },
        setRightClick(d, t)    { _currentRightClickDay = d; _currentRightClickTask = t; },
        // drag info
        get draggedTask()      { return _draggedTaskInfo; },
        set draggedTask(v)     { _draggedTaskInfo = v; },
        // move task source
        get moveTaskSource()   { return _moveTaskSource; },
        set moveTaskSource(v)  { _moveTaskSource = v; },
    };
})();

// 4. DEBOUNCE / THROTTLE CENTRE
const scheduler = (() => {
    let _uiTimer  = null;
    let _saveTimer = null;
    let _saveGlobalTimer = null;

    return {
        /** Schedule a single rAF-batched UI update for one day column */
    uiUpdate(dIdx) {
            if (_uiTimer) cancelAnimationFrame(_uiTimer);
            _uiTimer = requestAnimationFrame(() => {
                updateDay(dIdx);
                updateWeeklySummary();
                drawWaveChart();
                _uiTimer = null;
            });
        },
        /** Debounce save: 400 ms after last keystroke */
        save() {
            clearTimeout(_saveTimer);
            _saveTimer = setTimeout(() => saveData(), 400);
        },
        /** Debounce Supabase push: 1500 ms */
        globalSave(fn) {
            clearTimeout(_saveGlobalTimer);
            _saveGlobalTimer = setTimeout(fn, 1500);
        }
    };
})();


// 5. STATE HELPERS
function _stateSetTask(d, t, field, value) {
    store.state.tasks[`t_${field}_${d}_${t}`] = value;
}

/** Capitalize the first letter of an input, preserving cursor position */
function _capitalizeFirstLetter(el) {
    if (!el.value || el.value[0] === el.value[0].toUpperCase()) return;
    const pos = el.selectionStart;
    el.value = el.value.charAt(0).toUpperCase() + el.value.slice(1);
    el.setSelectionRange(pos, pos);
}

function _syncStateFromDOM() {
    store.resetState();
    const s = store.state;
    for (let d = 0; d < 7; d++) {
        for (let t = 0; t < TASKS_PER_DAY; t++) {
            s.tasks[`t_name_${d}_${t}`]    = (document.getElementById(`t_name_${d}_${t}`)    || {}).value   || '';
            s.tasks[`t_h_start_${d}_${t}`] = (document.getElementById(`t_h_start_${d}_${t}`) || {}).value   || '';
            s.tasks[`t_m_start_${d}_${t}`] = (document.getElementById(`t_m_start_${d}_${t}`) || {}).value   || '';
            s.tasks[`t_h_end_${d}_${t}`]   = (document.getElementById(`t_h_end_${d}_${t}`)   || {}).value   || '';
            s.tasks[`t_m_end_${d}_${t}`]   = (document.getElementById(`t_m_end_${d}_${t}`)   || {}).value   || '';
            s.tasks[`t_check_${d}_${t}`]   = (document.getElementById(`t_check_${d}_${t}`)   || {}).checked || false;
            s.tasks[`t_pri_${d}_${t}`]     = (document.getElementById(`task_div_${d}_${t}`)  || { getAttribute: () => '3' }).getAttribute('data-priority') || '3';
            s.tasks[`t_delay_${d}_${t}`]   = (document.getElementById(`task_div_${d}_${t}`)  || { getAttribute: () => '0' }).getAttribute('data-delay')    || '0';
        }
    }
    for (let h = 0; h < HABITS_COUNT; h++) {
        s.habits[`h_name_${h}`] = (document.getElementById(`h_name_${h}`) || {}).value || '';
        for (let d = 0; d < 7; d++) {
            s.habits[`h_check_${h}_${d}`] = (document.getElementById(`h_check_${h}_${d}`) || {}).checked || false;
        }
    }
    for (let i = 1; i <= (store.state.notesCount || 10); i++) {
        const el = document.getElementById(`note_input_${i}`);
        s.notes[`note_${i}`] = el ? el.value : '';
    }
}

// 6. AUTH & DATA PERSISTENCE
async function checkAuth() {
    try {
        const { data: { session } } = await sbClient.auth.getSession();
        if (session) {
            store.currentUser = session.user;
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('sync-loading-screen').style.display = 'flex';
            await loadGlobalDataFromDB();
            document.getElementById('sync-loading-screen').style.display = 'none';
            continueInit();
        } else {
            document.getElementById('auth-overlay').style.display = 'flex';
        }
    } catch (err) {
        hideSyncScreen();
        showNetworkError('Cannot connect. Working offline.');
        const saved = localStorage.getItem('plan_app_data');
        if (saved) { store.appData = JSON.parse(saved); continueInit(); }
        else { document.getElementById('auth-overlay').style.display = 'flex'; }
    }
}

function hideSyncScreen() {
    const el = document.getElementById('sync-loading-screen');
    if (el) el.style.display = 'none';
}

function showNetworkError(msg) {
    if (document.getElementById('network-error-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'network-error-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#D32F2F;color:#fff;text-align:center;padding:10px;font-weight:700;font-size:13px;z-index:99999;';
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'margin-left:12px;background:rgba(255,255,255,0.25);border:none;color:#fff;padding:2px 10px;border-radius:4px;cursor:pointer;font-weight:700;';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => banner.remove();
    banner.textContent = msg + ' ';
    banner.appendChild(closeBtn);
    document.body.prepend(banner);
}

async function handleLogin() {
    const email    = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const msg      = document.getElementById('auth-msg');
    msg.innerText  = 'Checking...';
    const { error } = await sbClient.auth.signInWithPassword({ email, password });
    if (error) { msg.innerText = 'Invalid email or password.'; }
    else { msg.innerText = ''; location.reload(); }
}

async function handleLogout() {
    await sbClient.auth.signOut();
    location.reload();
}

async function loadGlobalDataFromDB() {
    if (!store.currentUser) return;
    let timeout;
    try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 5000);
        const { data } = await sbClient.from('user_plans').select('plan_data').eq('user_id', store.currentUser.id).single();
        clearTimeout(timeout);
        if (data && data.plan_data) {
            store.appData = data.plan_data;
            localStorage.setItem('plan_app_data', JSON.stringify(store.appData));
        } else {
            const saved = localStorage.getItem('plan_app_data');
            if (saved) store.appData = JSON.parse(saved);
        }
    } catch (err) {
        clearTimeout(timeout);
        hideSyncScreen();
        showNetworkError('Network error. Loaded from local cache.');
        const saved = localStorage.getItem('plan_app_data');
        if (saved) store.appData = JSON.parse(saved);
    }
    const d = store.appData;
    if (!d.weeks)   d.weeks   = {};
    if (!d.monthly) d.monthly = {};
    if (!d.abbrs)   d.abbrs   = {};
    if (!d.settings) d.settings = { persistentNotes: false, persistentAbbr: false, persistentHabit: false, language: 'en' };}

function saveGlobalData() {
    localStorage.setItem('plan_app_data', JSON.stringify(store.appData));
    if (!store.currentUser) return;
    scheduler.globalSave(async () => {
        try {
            const { error } = await sbClient.from('user_plans').upsert({
                user_id: store.currentUser.id,
                plan_data: store.appData
            });
            if (!error) {
                const toast = document.getElementById('save-toast');
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2000);
            } else {
                showNetworkError('Save failed. Data kept locally.');
            }
        } catch (err) {
            showNetworkError('Offline. Changes saved locally.');
        }
    });
}

function saveData() {
    _syncStateFromDOM();
    const s = store.state;
    store.appData.weeks[store.viewingWeekId] = {
        tasks:      Object.assign({}, s.tasks),
        habits:     Object.assign({}, s.habits),
        notes:      Object.assign({}, s.notes),
        notesCount: s.notesCount || 10
    };
    saveGlobalData();
}

function loadWeekData() {
    const wData = store.appData.weeks[store.viewingWeekId] || { tasks: {}, habits: {}, notes: {} };
    // Restore all task slots to visible before populating (default: 10 slots shown)
    for (let d = 0; d < 7; d++) {
        for (let t = 0; t < TASKS_PER_DAY; t++) {
            const div = document.getElementById(`task_div_${d}_${t}`);
            if (div) div.classList.remove('task-item--hidden');
        }
    }
    for (let d = 0; d < 7; d++) {
        for (let t = 0; t < TASKS_PER_DAY; t++) {
            const nameEl = document.getElementById(`t_name_${d}_${t}`);
            nameEl.value = wData.tasks[`t_name_${d}_${t}`] || '';
            autoResizeTextarea(nameEl);
            document.getElementById(`t_h_start_${d}_${t}`).value = wData.tasks[`t_h_start_${d}_${t}`] || '';
            document.getElementById(`t_m_start_${d}_${t}`).value = wData.tasks[`t_m_start_${d}_${t}`] || '';
            document.getElementById(`t_h_end_${d}_${t}`).value   = wData.tasks[`t_h_end_${d}_${t}`]   || '';
            document.getElementById(`t_m_end_${d}_${t}`).value   = wData.tasks[`t_m_end_${d}_${t}`]   || '';
            document.getElementById(`t_check_${d}_${t}`).checked = wData.tasks[`t_check_${d}_${t}`]   || false;
            document.getElementById(`task_div_${d}_${t}`).setAttribute('data-priority', wData.tasks[`t_pri_${d}_${t}`]   || '3');
            document.getElementById(`task_div_${d}_${t}`).setAttribute('data-delay',    wData.tasks[`t_delay_${d}_${t}`] || '0');
        }
        sortTasks(d);
    }
    for (let h = 0; h < HABITS_COUNT; h++) {
        const hName = document.getElementById(`h_name_${h}`);
        hName.value = wData.habits[`h_name_${h}`] || '';
        autoResizeTextarea(hName);
        for (let d = 0; d < 7; d++) {
            document.getElementById(`h_check_${h}_${d}`).checked = wData.habits[`h_check_${h}_${d}`] || false;
        }
    }
    // Sync notes count from saved data into state, then populate values
    const targetCount = Math.max(10, wData.notesCount || 10);
    store.state.notesCount = targetCount;
    for (let i = 1; i <= targetCount; i++) {
        const el = document.getElementById(`note_input_${i}`);
        if (el) { el.value = wData.notes?.[`note_${i}`] || ''; autoResizeTextarea(el); }
    }
    _syncStateFromDOM();
    // Defer task resize until after layout is painted so scrollHeight is accurate
    requestAnimationFrame(() => {
        for (let d = 0; d < 7; d++) {
            for (let t = 0; t < TASKS_PER_DAY; t++) {
                const nameEl = document.getElementById(`t_name_${d}_${t}`);
                if (nameEl) autoResizeTextarea(nameEl);
            }
        }
    });
}

function saveMonthly() {
    store.appData.monthly = store.appData.monthly || {};
    const monthId = store.viewingMonthId;
    store.appData.monthly[monthId] = store.appData.monthly[monthId] || {};
    const mMonth = store.appData.monthly[monthId];
    for (let i = 1; i <= 3; i++) {
        mMonth[`mg_${i}`]        = document.getElementById(`mg-${i}`).value;
        mMonth[`gr_name_${i}`]   = document.getElementById(`gr-name-${i}`).value;
        mMonth[`gr_target_${i}`] = document.getElementById(`gr-target-${i}`).value;
        mMonth[`gr_actual_${i}`] = document.getElementById(`gr-actual-${i}`).value;
        mMonth[`gr_status_${i}`] = document.getElementById(`gr-status-${i}`).value;
    }
    saveGlobalData();
}

function saveAbbrData() {
    store.appData.abbrs = store.appData.abbrs || {};
    const count = store.appData.abbrsCount || 10;
    for (let i = 1; i <= count; i++) {
        const kEl = document.getElementById(`abbr_k_${i}`);
        const vEl = document.getElementById(`abbr_v_${i}`);
        if (kEl) store.appData.abbrs[`abbr_k_${i}`] = kEl.value.trim();
        if (vEl) store.appData.abbrs[`abbr_v_${i}`] = vEl.value.trim();
    }
    saveGlobalData();
}


// 7. DATE / WEEK UTILITIES
function getMonday(d) {
    const date = new Date(d);
    const day  = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.getFullYear(), date.getMonth(), diff);
}

function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function calculateWeekIds() {
    const now        = new Date();
    const thisMonday = getMonday(now);
    store.currentRealWeekId = formatDateKey(thisMonday);
    store.currentMonthId    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    store.viewingMonthId    = store.currentMonthId;
}

function generateWeekDates(mondayStr) {
    const parts  = mondayStr.split('-');
    const monday = new Date(parts[0], parts[1] - 1, parts[2]);
    const dates  = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear().toString().slice(-2);
        dates.push(`${d}/${m}/${y}`);
    }
    store.weekDates = dates;
}

function getMonthWeeks() {
    const [y, m] = store.viewingMonthId.split('-').map(Number);
    const firstOfMonth = new Date(y, m - 1, 1);
    const fmt = d => `${d.getDate()}/${d.getMonth() + 1}`;
    const blocks = [];
    let monday = getMonday(firstOfMonth);
    for (let i = 0; i < 5; i++) {
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const wId   = formatDateKey(monday);
        const label = `${fmt(monday)}–${fmt(sunday)}`;
        blocks.push({ wId: store.appData.weeks[wId] ? wId : null, label, mondayDate: new Date(monday) });
        monday = new Date(monday);
        monday.setDate(monday.getDate() + 7);
    }
    return blocks;
}

// 8. INIT & LIFECYCLE
window.onload = () => {
    // Attach auth listener immediately on page load, before login completes
    document.getElementById('auth-overlay').addEventListener('click', handleAuthClick);
    checkAuth();
};

function continueInit() {
    calculateWeekIds();
    store.viewingWeekId = store.currentRealWeekId;
    if (!store.appData.weeks[store.viewingWeekId]) {
        store.appData.weeks[store.viewingWeekId] = { tasks: {}, habits: {}, notes: {} };
        _applyPersistentData(store.viewingWeekId);
    }
    const savedName = localStorage.getItem('dashboard_username') || 'Name';
    document.getElementById('greeting-text').innerText = `Hi ${savedName} !!`;

    initNotesUI();
    initAbbrUI();
    renderCalendar();
    renderHabits();
    renderDays();
    loadWeekData();
    updateAll();
    checkAndFocusToday();
    initSettingsUI();
    initEventDelegation();
}

function initSettingsUI() {
    const s = store.appData.settings || {};
    document.getElementById('setting-persistent-notes').checked = !!s.persistentNotes;
    document.getElementById('setting-persistent-abbr').checked  = !!s.persistentAbbr;
    document.getElementById('setting-persistent-habit').checked = !!s.persistentHabit;
    document.getElementById('setting-language').value           = s.language || 'en';
}

function _getLastActiveWeekId() {
    const weeks = store.appData.weeks;
    const ids = Object.keys(weeks).filter(id => id !== store.viewingWeekId).sort().reverse();
    return ids[0] || null;
}

// Find the most recent week that belongs to a different month than targetWeekId.
// Used for persistent data: copy from the previous month into the new one.
function _getSourceWeekForPersist(targetWeekId) {
    const weeks = store.appData.weeks;
    const tp = targetWeekId.split('-');
    const targetMonth = `${tp[0]}-${tp[1]}`;
    // Get all weeks not in the same month as target, sort descending → take the nearest
    const ids = Object.keys(weeks)
        .filter(id => {
            const p = id.split('-');
            return `${p[0]}-${p[1]}` !== targetMonth;
        })
        .sort()
        .reverse();
    return ids[0] || null;
}

function _applyPersistentData(targetWeekId) {
    try {
        const s = store.appData.settings || {};
        const lastId = _getSourceWeekForPersist(targetWeekId);
        if (!lastId) return;
        const src = store.appData.weeks[lastId];
        const dst = store.appData.weeks[targetWeekId];
        if (s.persistentNotes && src.notes) {
            dst.notes = JSON.parse(JSON.stringify(src.notes));
            dst.notesCount = src.notesCount || 10;
        }
        if (s.persistentAbbr && store.appData.abbrs) {
            // abbrs are global — no per-week copy needed
        }
        if (s.persistentHabit && src.habits) {
            // Copy habit names only, not check states
            const habitNames = {};
            for (let h = 0; h < HABITS_COUNT; h++) {
                habitNames[`h_name_${h}`] = src.habits[`h_name_${h}`] || '';
            }
            dst.habits = Object.assign({}, dst.habits, habitNames);
        }
    } catch (e) {
        console.warn('[Persistent] Copy failed:', e);
    }
}

function rebuildUI() {
    document.getElementById('main-grid').querySelectorAll('.grid-item:nth-child(n+3)').forEach(e => e.remove());
    renderDays();
    // Sync notesCount from new week's data before rebuilding notes UI
    const wData = store.appData.weeks[store.viewingWeekId] || {};
    store.state.notesCount = Math.max(10, wData.notesCount || 10);
    initNotesUI();
    loadWeekData();
    updateAll();
}

function checkAndFocusToday() {
    if (store.viewingWeekId !== store.currentRealWeekId) return;
    if (sessionStorage.getItem('has_seen_focus') === 'true') return;
    const now      = new Date();
    const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const dayDiv   = document.getElementById(`task_div_${todayIdx}_0`);
    if (dayDiv) {
        dayDiv.closest('.grid-item').classList.add('focused-day-card');
        document.getElementById('focus-backdrop').style.display = 'block';
        sessionStorage.setItem('has_seen_focus', 'true');
    }
}

function closeFocus() {
    document.getElementById('focus-backdrop').style.display = 'none';
    const el = document.querySelector('.focused-day-card');
    if (el) el.classList.remove('focused-day-card');
}

function renameUser(e) {
    e.preventDefault();
    const currentName = localStorage.getItem('dashboard_username') || 'Name';
    const newName     = prompt('Enter your name:', currentName);
    if (newName !== null && newName.trim() !== '') {
        localStorage.setItem('dashboard_username', newName.trim());
        document.getElementById('greeting-text').innerText = `Hi ${newName.trim()} !!`;
    }
}

// 9. DOM RENDERING (DocumentFragment)
function _createNoteRow(i) {
    const row   = document.createElement('div');
    row.className = 'note-row';
    const label = document.createElement('label');
    label.textContent = `${i}.`;
    const input = document.createElement('textarea');
    input.id    = `note_input_${i}`;
    input.placeholder = '...';
    input.rows  = 1;
    input.addEventListener('input', () => autoResizeTextarea(input));
    row.appendChild(label);
    row.appendChild(input);
    return row;
}

function initNotesUI() {
    const container = document.getElementById('notes-container');
    container.innerHTML = '';
    const count = store.state.notesCount || 10;
    const fragment = document.createDocumentFragment();
    for (let i = 1; i <= count; i++) {
        fragment.appendChild(_createNoteRow(i));
    }
    // Add "+" button row
    const addRow = document.createElement('div');
    addRow.className = 'note-add-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'note-add-btn';
    addBtn.textContent = '+';
    addBtn.title = 'Add note';
    addBtn.addEventListener('click', addNoteRow);
    addRow.appendChild(addBtn);
    fragment.appendChild(addRow);
    container.appendChild(fragment);
}

function addNoteRow() {
    const container = document.getElementById('notes-container');
    const addRow = container.querySelector('.note-add-row');
    const currentCount = container.querySelectorAll('.note-row').length;
    const newIdx = currentCount + 1;
    store.state.notesCount = newIdx;
    const row = _createNoteRow(newIdx);
    container.insertBefore(row, addRow);
    container.scrollTop = container.scrollHeight;
    document.getElementById(`note_input_${newIdx}`).focus();
    saveData(); // persist notesCount immediately
}

function _createAbbrRow(i) {
    const row    = document.createElement('div');
    row.className = 'abbr-row';
    const kInput = document.createElement('input');
    kInput.type  = 'text';
    kInput.id    = `abbr_k_${i}`;
    kInput.placeholder = 'Abbreviation';
    const vInput = document.createElement('input');
    vInput.type  = 'text';
    vInput.id    = `abbr_v_${i}`;
    vInput.placeholder = 'Meaning';
    row.appendChild(kInput);
    row.appendChild(vInput);
    return row;
}

function initAbbrUI() {
    const container = document.getElementById('abbr-container');
    container.innerHTML = '';
    const count = store.appData.abbrsCount || 10;
    const fragment = document.createDocumentFragment();
    for (let i = 1; i <= count; i++) {
        fragment.appendChild(_createAbbrRow(i));
    }
    // Add "+" button row
    const addRow = document.createElement('div');
    addRow.className = 'abbr-add-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'abbr-add-btn';
    addBtn.textContent = '+';
    addBtn.title = 'Add abbreviation';
    addBtn.addEventListener('click', addAbbrRow);
    addRow.appendChild(addBtn);
    fragment.appendChild(addRow);
    container.appendChild(fragment);
    for (let i = 1; i <= count; i++) {
        document.getElementById(`abbr_k_${i}`).value = store.appData.abbrs?.[`abbr_k_${i}`] || '';
        document.getElementById(`abbr_v_${i}`).value = store.appData.abbrs?.[`abbr_v_${i}`] || '';
    }
}

function addAbbrRow() {
    const container = document.getElementById('abbr-container');
    const addRow = container.querySelector('.abbr-add-row');
    const currentCount = container.querySelectorAll('.abbr-row').length;
    const newIdx = currentCount + 1;
    store.appData.abbrsCount = newIdx;
    const row = _createAbbrRow(newIdx);
    container.insertBefore(row, addRow);
    container.scrollTop = container.scrollHeight;
    document.getElementById(`abbr_k_${newIdx}`).focus();
    saveGlobalData();
}

function renderCalendar() {
    const parts   = store.viewingWeekId.split('-');
    const vDate   = new Date(parts[0], parts[1] - 1, parts[2]);
    generateWeekDates(store.viewingWeekId);
    const year    = vDate.getFullYear();
    const month   = vDate.getMonth();
    const today   = new Date().getDate();
    const isCurrentMonth = (new Date().getMonth() === month && new Date().getFullYear() === year);
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    document.getElementById('cal-month-year').innerText = `${monthNames[month]} ${year}`;
    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay    = firstDay === 0 ? 6 : firstDay - 1;
    const calGrid     = document.getElementById('cal-grid-days');
    calGrid.innerHTML = '';
    const fragment    = document.createDocumentFragment();
    for (let i = 0; i < startDay; i++) {
        const el = document.createElement('div'); el.className = 'cal-date'; fragment.appendChild(el);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        const el = document.createElement('div'); el.className = 'cal-date';
        if (i === today && isCurrentMonth && store.viewingWeekId === store.currentRealWeekId) el.classList.add('today');
        el.textContent = i;
        fragment.appendChild(el);
    }
    calGrid.appendChild(fragment);
}

function renderHabits() {
    const container = document.getElementById('habit-container');
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const hHeader  = document.createElement('div');
    hHeader.className = 'habit-header'; hHeader.textContent = 'Habit';
    fragment.appendChild(hHeader);
    DAY_KEYS.forEach(d => {
        const hd = document.createElement('div'); hd.className = 'habit-header'; hd.textContent = d;
        fragment.appendChild(hd);
    });
    for (let h = 0; h < HABITS_COUNT; h++) {
        const nameCell = document.createElement('div'); nameCell.className = 'h-name';
        const textarea = document.createElement('textarea');
        textarea.className = 'habit-input'; textarea.id = `h_name_${h}`; textarea.placeholder = '...'; textarea.rows = 1;
        nameCell.appendChild(textarea); fragment.appendChild(nameCell);
        for (let d = 0; d < 7; d++) {
            const cell = document.createElement('div');
            const cb   = document.createElement('input'); cb.type = 'checkbox'; cb.id = `h_check_${h}_${d}`;
            cell.appendChild(cb); fragment.appendChild(cell);
        }
    }
    container.appendChild(fragment);
}

function createTaskElement(dIdx, tIdx) {
    const taskDiv = document.createElement('div');
    taskDiv.className = 'task-item';
    taskDiv.id = `task_div_${dIdx}_${tIdx}`;
    taskDiv.setAttribute('data-priority', '3');
    taskDiv.setAttribute('data-delay', '0');

    const dragZone = document.createElement('div');
    dragZone.className = 'task-drag-zone'; dragZone.title = 'Drag to move';
    const starIcon = document.createElement('div'); starIcon.className = 'task-star-icon'; starIcon.textContent = '⭐';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = `t_check_${dIdx}_${tIdx}`;
    checkbox.className = 'task-check-trigger'; checkbox.draggable = true; checkbox.title = 'Drag to move task';
    dragZone.appendChild(starIcon); dragZone.appendChild(checkbox);

    const inputContainer = document.createElement('div'); inputContainer.className = 'task-input-container';
    const nameInput = document.createElement('textarea');
    nameInput.id = `t_name_${dIdx}_${tIdx}`; nameInput.className = 't-name'; nameInput.placeholder = '';
    nameInput.rows = 1;
    nameInput.addEventListener('input', () => { autoResizeTextarea(nameInput); smartExpandTask(dIdx); });

    const timeWrapper = document.createElement('div'); timeWrapper.className = 'time-input-wrapper';
    const mkPart = (field) => {
        const inp = document.createElement('input');
        inp.type = 'text'; inp.id = `t_${field}_${dIdx}_${tIdx}`; inp.className = 't-time-part'; inp.maxLength = 2; inp.placeholder = '--';
        return inp;
    };
    const mkColon = () => { const s = document.createElement('span'); s.className = 'time-colon'; s.textContent = ':'; return s; };
    const mkSep   = () => { const s = document.createElement('span'); s.className = 'time-separator'; s.textContent = '-'; return s; };
    timeWrapper.appendChild(mkPart('h_start')); timeWrapper.appendChild(mkColon());
    timeWrapper.appendChild(mkPart('m_start')); timeWrapper.appendChild(mkSep());
    timeWrapper.appendChild(mkPart('h_end'));   timeWrapper.appendChild(mkColon());
    timeWrapper.appendChild(mkPart('m_end'));
    inputContainer.appendChild(nameInput); inputContainer.appendChild(timeWrapper);

    const badge = document.createElement('span');
    badge.className = 'delay-badge'; badge.id = `delay_badge_${dIdx}_${tIdx}`; badge.style.display = 'none';

    taskDiv.appendChild(dragZone); taskDiv.appendChild(inputContainer); taskDiv.appendChild(badge);
    return taskDiv;
}

function renderDays() {
    const mainContainer = document.getElementById('main-grid');
    const fragment = document.createDocumentFragment();
    DAYS_DATA.forEach((dayObj, dIdx) => {
        const gridItem  = document.createElement('div'); gridItem.className = 'grid-item';
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header'; dayHeader.id = `day_header_${dIdx}`; dayHeader.style.backgroundColor = dayObj.bg;
        const dayContent = document.createElement('div'); dayContent.className = 'day-content';

        // Donut
        const chartSection = document.createElement('div'); chartSection.className = 'chart-section';
        const donut = document.createElement('div'); donut.className = 'daily-donut';
        donut.innerHTML = `<svg width="70" height="70" viewBox="0 0 70 70"><circle class="circle-bg" cx="35" cy="35" r="28"></circle><circle id="circle_${dIdx}" class="circle-progress" cx="35" cy="35" r="28" style="stroke:${dayObj.stroke};"></circle></svg>`;
        const pctText = document.createElement('div'); pctText.className = 'percent-text'; pctText.id = `pct_${dIdx}`; pctText.textContent = '0%';
        donut.appendChild(pctText); chartSection.appendChild(donut);

        // Stats row
        const statsRow = document.createElement('div'); statsRow.className = 'stats-row';
        [['Completed', `done_${dIdx}`], ['In Progress', `prog_${dIdx}`], ['Total', `total_${dIdx}`]].forEach(([label, id]) => {
            const d = document.createElement('div'); d.innerHTML = `${label}<br><span id="${id}">0</span>`; statsRow.appendChild(d);
        });

        // Task list
        const taskList = document.createElement('div'); taskList.className = 'task-list'; taskList.id = `task_list_${dIdx}`;
        const tf = document.createDocumentFragment();
        for (let t = 0; t < TASKS_PER_DAY; t++) tf.appendChild(createTaskElement(dIdx, t));
        taskList.appendChild(tf);

        // Progress bar
        const pbc = document.createElement('div'); pbc.className = 'day-progress-bar-container';
        const pb  = document.createElement('div'); pb.className = 'day-progress-bar'; pb.id = `day_prog_bar_${dIdx}`;
        pbc.appendChild(pb);

        dayContent.appendChild(chartSection); dayContent.appendChild(statsRow);
        dayContent.appendChild(taskList); dayContent.appendChild(pbc);
        gridItem.appendChild(dayHeader); gridItem.appendChild(dayContent);
        fragment.appendChild(gridItem);
    });
    mainContainer.appendChild(fragment);
}


// 10. DRAG & DROP — state-first approach
function dragStartTask(e, dIdx, tIdx) {
    if (document.getElementById(`t_name_${dIdx}_${tIdx}`).value.trim() === '') { e.preventDefault(); return; }
    store.draggedTask = { dIdx, tIdx };
    e.dataTransfer.effectAllowed = 'move';
}

function dragOverTask(e) { e.preventDefault(); }

/** Read one task's data from _state into a plain object */
function _readTaskFromState(d, t) {
    const s = store.state.tasks;
    return {
        name:    s[`t_name_${d}_${t}`]    || '',
        hStart:  s[`t_h_start_${d}_${t}`] || '',
        mStart:  s[`t_m_start_${d}_${t}`] || '',
        hEnd:    s[`t_h_end_${d}_${t}`]   || '',
        mEnd:    s[`t_m_end_${d}_${t}`]   || '',
        checked: s[`t_check_${d}_${t}`]   || false,
        pri:     s[`t_pri_${d}_${t}`]     || '3',
        delay:   s[`t_delay_${d}_${t}`]   || '0',
    };
}

/** Write a task data object into _state */
function _writeTaskToState(d, t, data) {
    const s = store.state.tasks;
    const fields = { name: 'name', hStart: 'h_start', mStart: 'm_start', hEnd: 'h_end', mEnd: 'm_end' };
    for (const [prop, key] of Object.entries(fields)) s[`t_${key}_${d}_${t}`] = data[prop];
    s[`t_check_${d}_${t}`] = data.checked;
    s[`t_pri_${d}_${t}`]   = data.pri;
    s[`t_delay_${d}_${t}`] = data.delay;
}

/** Flush one task from _state to DOM */
function _flushTaskToDOM(d, t) {
    const s = store.state.tasks;
    const fields = { name: 'name', h_start: 'hStart', m_start: 'mStart', h_end: 'hEnd', m_end: 'mEnd' };
    for (const [key, prop] of Object.entries(fields)) {
        document.getElementById(`t_${key}_${d}_${t}`).value = s[`t_${key}_${d}_${t}`] || '';
    }
    document.getElementById(`t_check_${d}_${t}`).checked = s[`t_check_${d}_${t}`] || false;
    const div = document.getElementById(`task_div_${d}_${t}`);
    div.setAttribute('data-priority', s[`t_pri_${d}_${t}`]   || '3');
    div.setAttribute('data-delay',    s[`t_delay_${d}_${t}`] || '0');
}

function dropTask(e, targetDayIdx) {
    e.preventDefault();
    if (!store.draggedTask) return;
    const { dIdx: sourceDay, tIdx: sourceTask } = store.draggedTask;
    if (sourceDay === targetDayIdx) { store.draggedTask = null; return; }

    // Find first empty slot in target day (check _state, not DOM)
    let emptyIdx = -1;
    for (let t = 0; t < TASKS_PER_DAY; t++) {
        if (!(store.state.tasks[`t_name_${targetDayIdx}_${t}`] || '').trim()) { emptyIdx = t; break; }
    }
    if (emptyIdx === -1) { alert('Day is full. Cannot drag more tasks!'); return; }

    store.draggedTask = null; // Only clear after validation passes

    // 1. Swap in _state first
    const srcData = _readTaskFromState(sourceDay, sourceTask);
    const emptyData = { name: '', hStart: '', mStart: '', hEnd: '', mEnd: '', checked: false, pri: '3', delay: '0' };
    _writeTaskToState(targetDayIdx, emptyIdx, srcData);
    _writeTaskToState(sourceDay, sourceTask, emptyData);

    // 2. Flush to DOM
    _flushTaskToDOM(targetDayIdx, emptyIdx);
    _flushTaskToDOM(sourceDay, sourceTask);
    // Ensure the target slot is visible (it may have been hidden by smartExpandTask)
    const targetSlotDiv = document.getElementById(`task_div_${targetDayIdx}_${emptyIdx}`);
    if (targetSlotDiv) targetSlotDiv.classList.remove('task-item--hidden');

    // 3. Save & update UI
    scheduler.save();
    requestAnimationFrame(() => {
        updateDay(sourceDay); updateDay(targetDayIdx); updateWeeklySummary(); drawWaveChart();
    });
    sortTasks(targetDayIdx); sortTasks(sourceDay);
}

function dropOnTaskItem(e, targetDayIdx, targetTaskIdx) {
    e.stopPropagation(); e.preventDefault();
    if (!store.draggedTask) return;
    const { dIdx: sDay, tIdx: sTask } = store.draggedTask;
    if (sDay === targetDayIdx && sTask === targetTaskIdx) { store.draggedTask = null; return; }

    const sPri = store.state.tasks[`t_pri_${sDay}_${sTask}`]               || '3';
    const tPri = store.state.tasks[`t_pri_${targetDayIdx}_${targetTaskIdx}`] || '3';

    if (sPri === tPri) {
        // 1. Swap in _state first
        const srcData = _readTaskFromState(sDay, sTask);
        const tgtData = _readTaskFromState(targetDayIdx, targetTaskIdx);
        _writeTaskToState(targetDayIdx, targetTaskIdx, srcData);
        _writeTaskToState(sDay, sTask, tgtData);

        // 2. Flush to DOM
        _flushTaskToDOM(targetDayIdx, targetTaskIdx);
        _flushTaskToDOM(sDay, sTask);
        // Ensure both slots are visible after swap
        const tDiv2 = document.getElementById(`task_div_${targetDayIdx}_${targetTaskIdx}`);
        const sDiv2 = document.getElementById(`task_div_${sDay}_${sTask}`);
        if (tDiv2) tDiv2.classList.remove('task-item--hidden');
        if (sDiv2) sDiv2.classList.remove('task-item--hidden');

        // 3. Save & update UI
        scheduler.save();
        scheduler.uiUpdate(sDay); scheduler.uiUpdate(targetDayIdx);
        sortTasks(targetDayIdx);
        if (sDay !== targetDayIdx) sortTasks(sDay);
        store.draggedTask = null;
    } else {
        store.draggedTask = { dIdx: sDay, tIdx: sTask };
        dropTask(e, targetDayIdx);
    }
}

// 11. TASK LOGIC
function autoResizeTextarea(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

/**
 * Called on every input event for a task name textarea.
 * If the textarea is wrapping (multi-line), try to reclaim space by hiding
 * the last truly-empty task slot in the same day column.
 * If no empty slot is available, the card grows naturally — CSS grid will
 * stretch all sibling cards in the same row to match.
 * Single-line textareas never trigger slot removal.
 */
function smartExpandTask(dIdx) {
    // Collect all task items for this day
    const items = [];
    for (let t = 0; t < TASKS_PER_DAY; t++) {
        const div  = document.getElementById(`task_div_${dIdx}_${t}`);
        const name = document.getElementById(`t_name_${dIdx}_${t}`);
        const cb   = document.getElementById(`t_check_${dIdx}_${t}`);
        if (div && name && cb) items.push({ div, name, cb, t });
    }

    // Count how many visible slots are currently hidden (already reclaimed)
    const hiddenCount = items.filter(({ div }) => div.classList.contains('task-item--hidden')).length;

    // Check if any visible textarea is actually wrapping (height > single line ~22px)
    const singleLineH = 22; // approximate px height of one line
    const anyWrapping = items.some(({ name, div }) =>
        !div.classList.contains('task-item--hidden') && name.offsetHeight > singleLineH
    );

    if (!anyWrapping) {
        // Nothing is wrapping — restore all hidden slots back to visible
        items.forEach(({ div }) => div.classList.remove('task-item--hidden'));
        return;
    }

    // Find the last visible slot that is completely empty (no text, unchecked, default priority/delay)
    let lastEmptyIdx = -1;
    for (let i = items.length - 1; i >= 0; i--) {
        const { div, name, cb } = items[i];
        if (div.classList.contains('task-item--hidden')) continue; // already hidden
        const isEmpty = name.value.trim() === '' &&
                        !cb.checked &&
                        (div.getAttribute('data-priority') === '3' || div.getAttribute('data-priority') === null) &&
                        (div.getAttribute('data-delay') === '0' || div.getAttribute('data-delay') === null);
        if (isEmpty) { lastEmptyIdx = i; break; }
    }

    if (lastEmptyIdx !== -1) {
        // Hide the last empty slot to reclaim its height
        items[lastEmptyIdx].div.classList.add('task-item--hidden');
    }
    // If no empty slot found: card grows naturally, CSS grid row stretches all siblings
}

function formatTimeInput(el) {
    let val = el.value.trim().replace(/\D/g, '');
    if (val.length === 1) val = '0' + val;
    el.value = val;
}

function focusTimeInput(d, t, idx) {
    const types = ['h_start', 'm_start', 'h_end', 'm_end'];
    const el = document.getElementById(`t_${types[idx]}_${d}_${t}`);
    if (el) { el.focus(); el.select(); }
}

function handleTimeNavigation(e, dIdx, tIdx, currentIdx) {
    const keysRight = ['ArrowRight', 'd', 'D'];
    const keysLeft  = ['ArrowLeft',  'a', 'A'];
    if (keysRight.includes(e.key)) { e.preventDefault(); if (currentIdx < 3) focusTimeInput(dIdx, tIdx, currentIdx + 1); }
    else if (keysLeft.includes(e.key)) { e.preventDefault(); if (currentIdx > 0) focusTimeInput(dIdx, tIdx, currentIdx - 1); }
}

function showContextMenu(e, dIdx, tIdx) {
    // Show task-action-menu (Mark / Move Task)
    const menu = document.getElementById('task-action-menu');
    // Update toggle label based on current checked state
    const cb = document.getElementById(`t_check_${dIdx}_${tIdx}`);
    const toggleItem = menu.querySelector('[data-action="toggle-done"]');
    if (toggleItem && cb) {
        if (cb.checked) {
            toggleItem.innerHTML = '<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;background:#D32F2F;border-radius:2px;color:#fff;font-size:9px;font-weight:900;flex-shrink:0;">✕</span> Incomplete';
        } else {
            toggleItem.innerHTML = '✅ Complete';
        }
    }
    // Position menu relative to the checkbox element
    const rect = cb ? cb.getBoundingClientRect() : null;
    const menuX = rect ? (rect.left + window.scrollX) : (e.clientX + window.scrollX);
    const menuY = rect ? (rect.bottom + window.scrollY + 4) : (e.clientY + window.scrollY);
    menu.style.left = menuX + 'px';
    menu.style.top  = menuY + 'px';
    menu.style.display = 'block';
    store.setRightClick(dIdx, tIdx);
    // Hide priority-menu if currently visible
    document.getElementById('priority-menu').style.display = 'none';
}

function setPriority(level) {
    const d = store.rightClickDay; const t = store.rightClickTask;
    if (d === null || t === null) return;
    const div = document.getElementById(`task_div_${d}_${t}`);
    div.setAttribute('data-priority', level);
    store.state.tasks[`t_pri_${d}_${t}`] = String(level);
    sortTasks(d); scheduler.save();
}

function sortTasks(dIdx) {
    const list  = document.getElementById(`task_list_${dIdx}`);
    const items = Array.from(list.querySelectorAll('.task-item'));
    items.sort((a, b) => {
        const pa = a.getAttribute('data-priority'); const pb = b.getAttribute('data-priority');
        const wa = pa === 'star' ? -1 : parseInt(pa || 3);
        const wb = pb === 'star' ? -1 : parseInt(pb || 3);
        return wa - wb;
    });
    items.forEach(item => list.appendChild(item));
}

function updateDayAndSave(dIdx) { scheduler.save(); scheduler.uiUpdate(dIdx); }

function updateDay(dIdx) {
    let done = 0; let totalActive = 0;
    const now      = new Date();
    const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const isPast   = (!store.isViewingNextWeek && dIdx < todayIdx);

    for (let t = 0; t < TASKS_PER_DAY; t++) {
        const cb    = document.getElementById(`t_check_${dIdx}_${t}`);
        const input = document.getElementById(`t_name_${dIdx}_${t}`);
        const div   = document.getElementById(`task_div_${dIdx}_${t}`);
        const badge = document.getElementById(`delay_badge_${dIdx}_${t}`);
        const hasText = input.value.trim() !== '';
        const delay   = parseInt(div.getAttribute('data-delay')) || 0;

        if (!hasText && cb.checked) cb.checked = false;
        if (hasText) { totalActive++; if (cb.checked) done++; }
        if (cb.checked) div.classList.add('checked'); else div.classList.remove('checked');

        if (delay > 0 && !cb.checked && hasText) {
            if (delay > 3) {
                badge.innerHTML = '⚠️ Evaluate'; badge.className = 'delay-badge delay-warning';
                badge.title = 'Task delayed > 3 days. Evaluate priority or cancel.';
            } else {
                const circled = ['', '❶', '❷', '❸'];
                badge.innerHTML = circled[delay] || `+${delay}`; badge.className = 'delay-badge'; badge.title = '';
            }
            badge.style.display = 'block';
        } else { badge.style.display = 'none'; }
    }

    const percent = totalActive === 0 ? 0 : Math.round((done / totalActive) * 100);
    store.dailyPercents[dIdx] = percent;
    store.dailyStats[dIdx]    = { done, total: totalActive };

    let headerHtml = `${DAYS_DATA[dIdx].name} (${store.weekDates[dIdx]})`;
    if (isPast && done < totalActive && totalActive > 0 && store.activeModalCount === 0) {
        headerHtml += `<span style="position:absolute;top:-16px;right:-5px;z-index:9999;color:#D32F2F;font-size:64px;font-weight:900;transform:rotate(15deg);line-height:1;font-family:'Comic Sans MS',cursive;text-shadow:2px 2px 0px rgba(255,255,255,0.8);">!!</span>`;
    }
    document.getElementById(`day_header_${dIdx}`).innerHTML = headerHtml;
    document.getElementById(`pct_${dIdx}`).innerText  = percent + '%';
    document.getElementById(`done_${dIdx}`).innerText  = done;
    document.getElementById(`prog_${dIdx}`).innerText  = totalActive - done;
    document.getElementById(`total_${dIdx}`).innerText = totalActive;

    const gridItem = document.getElementById(`task_div_${dIdx}_0`).closest('.grid-item');
    if (totalActive > 0 && done === totalActive) gridItem.classList.add('daily-victory');
    else gridItem.classList.remove('daily-victory');

    const circle = document.getElementById(`circle_${dIdx}`);
    const circumference = 2 * Math.PI * 28;
    circle.style.strokeDasharray  = circumference;
    circle.style.strokeDashoffset = circumference - (circumference * percent / 100);

    const progBar = document.getElementById(`day_prog_bar_${dIdx}`);
    progBar.style.width = percent + '%';
    progBar.style.backgroundColor = percent >= 100
        ? 'var(--success-green)'
        : `hsl(122, ${percent}%, ${75 - percent * 0.35}%)`;
}

function updateWeeklySummary() {
    let weekCompleted = 0; let weekInProgress = 0;
    for (let d = 0; d < 7; d++) {
        for (let t = 0; t < TASKS_PER_DAY; t++) {
            const cb    = document.getElementById(`t_check_${d}_${t}`);
            const input = document.getElementById(`t_name_${d}_${t}`);
            if (input && input.value.trim() !== '') {
                if (cb && cb.checked) weekCompleted++; else weekInProgress++;
            }
        }
    }
    document.getElementById('weekly-completed').innerText = weekCompleted;
    document.getElementById('weekly-progress').innerText  = weekInProgress;
}

function updateAll() { for (let d = 0; d < 7; d++) updateDay(d); updateWeeklySummary(); drawWaveChart(); }

function updateRowStatus(id) {
    const row    = document.getElementById(`gr-row-${id}`);
    const select = document.getElementById(`gr-status-${id}`);
    row.classList.remove('status-achieved', 'status-pending');
    if (select.value === 'Achieved') row.classList.add('status-achieved');
    else if (select.value === 'Pending') row.classList.add('status-pending');
}


// 12. SVG CHARTS
function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

function showTooltip(e, dayIndex) {
    const t = document.getElementById('chart-tooltip');
    const s = store.dailyStats[dayIndex];
    t.textContent = `${s.done}/${s.total} tasks completed`;
    t.style.display = 'block';
    t.style.left = (e.clientX + window.scrollX) + 'px';
    t.style.top  = (e.clientY + window.scrollY - 15) + 'px';
}
function hideTooltip() { document.getElementById('chart-tooltip').style.display = 'none'; }

function drawWaveChart() {
    const width = 1000; const height = 90; const paddingX = 40;
    const gap   = (width - paddingX * 2) / 6;
    const points = store.dailyPercents.map((pct, i) => ({
        x: paddingX + i * gap,
        y: height - 15 - pct * 0.5
    }));

    // Build bezier path strings
    const p = points;
    let pathDataCurve = `M ${p[0].x},${p[0].y}`;
    let pathDataPoly  = `M 0,${height} L ${p[0].x},${p[0].y}`;
    for (let i = 1; i < p.length; i++) {
        const k  = 0.15;
        let v1   = i > 1 ? { x: p[i].x - p[i-2].x, y: p[i].y - p[i-2].y } : { x: p[1].x - p[0].x, y: p[1].y - p[0].y };
        let v2   = i < p.length - 1 ? { x: p[i+1].x - p[i-1].x, y: p[i+1].y - p[i-1].y } : { x: p[i].x - p[i-1].x, y: p[i].x - p[i-1].x };
        const c1 = { x: p[i-1].x + v1.x * k, y: p[i-1].y + v1.y * k };
        const c2 = { x: p[i].x   - v2.x * k, y: p[i].y   - v2.y * k };
        const seg = ` C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p[i].x},${p[i].y}`;
        pathDataCurve += seg; pathDataPoly += seg;
    }
    pathDataPoly += ` L ${width},${height} Z`;

    document.getElementById('wave-path').setAttribute('d', pathDataCurve);
    document.getElementById('wave-polygon').setAttribute('d', pathDataPoly);

    // Rebuild wave points using createElementNS
    const wavePoints = document.getElementById('wave-points');
    wavePoints.innerHTML = '';
    points.forEach((pt, i) => {
        const circle = svgEl('circle', { cx: pt.x, cy: pt.y, r: '4.5' });
        circle.addEventListener('mousemove', e => showTooltip(e, i));
        circle.addEventListener('mouseleave', hideTooltip);
        wavePoints.appendChild(circle);
    });
}

function drawBarChart(container, dailyTaskPcts, weekBlocks) {
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: '0 -10 750 180', style: 'width:100%;height:100%;overflow:visible;' });

    // Grid lines
    [[10, '100%'], [80, '50%'], [150, '0%']].forEach(([y, label]) => {
        const isBaseline = y === 150;
        svg.appendChild(svgEl('line', { x1: 40, y1: y, x2: 740, y2: y,
            stroke: isBaseline ? 'rgba(139,94,60,0.5)' : 'rgba(139,94,60,0.2)',
            'stroke-dasharray': isBaseline ? '' : '4', 'stroke-width': '1' }));
        const t = svgEl('text', { x: 30, y: y + 4, 'text-anchor': 'end', 'font-size': '10',
            fill: 'var(--border-darker)', 'font-weight': '600' });
        t.textContent = label; svg.appendChild(t);
    });

    if (dailyTaskPcts.length > 0) {
        const chartWidth = 700; const startX = 40;
        const barWidth   = (chartWidth / dailyTaskPcts.length) - 4;
        dailyTaskPcts.forEach((pct, idx) => {
            const bh = (pct / 100) * 140;
            svg.appendChild(svgEl('rect', {
                x: startX + idx * (chartWidth / dailyTaskPcts.length) + 2,
                y: 150 - bh, width: barWidth, height: bh,
                fill: 'var(--border-color)', rx: '2'
            }));
        });
        const weekWidth = chartWidth / 5;
        weekBlocks.forEach((block, w) => {
            const t = svgEl('text', { x: startX + w * weekWidth + weekWidth / 2, y: 170,
                'text-anchor': 'middle', 'font-size': '9', fill: 'var(--border-darker)', 'font-weight': '700' });
            t.textContent = block.label; svg.appendChild(t);
            if (w > 0) {
                svg.appendChild(svgEl('line', { x1: startX + w * weekWidth, y1: 10,
                    x2: startX + w * weekWidth, y2: 155, stroke: 'rgba(139,94,60,0.2)', 'stroke-width': '1' }));
            }
        });
    }
    container.appendChild(svg);
}

function drawPieChart(container, habitStats) {
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: '-110 -110 220 220', style: 'width:100%;height:100%;overflow:visible;' });
    const totalDones = habitStats.reduce((s, h) => s + h.count, 0);
    if (totalDones === 0) {
        const t = svgEl('text', { x: 0, y: 0, 'text-anchor': 'middle', fill: '#888', 'font-size': '12' });
        t.textContent = 'No Data'; svg.appendChild(t);
    } else {
        const colors = ['#E6C655', '#90B496', '#86A8BC', '#E3A77A', '#FA8C28'];
        let startAngle = 0;
        habitStats.forEach((h, i) => {
            const pct      = h.count / totalDones;
            const angle    = pct * 2 * Math.PI;
            const endAngle = startAngle + angle;
            const x1 = Math.cos(startAngle) * 60; const y1 = Math.sin(startAngle) * 60;
            const x2 = Math.cos(endAngle)   * 60; const y2 = Math.sin(endAngle)   * 60;
            const largeArc = pct > 0.5 ? 1 : 0;
            const d = pct === 1
                ? 'M 60 0 A 60 60 0 1 1 -60 0 A 60 60 0 1 1 60 0'
                : `M 0 0 L ${x1} ${y1} A 60 60 0 ${largeArc} 1 ${x2} ${y2} Z`;
            svg.appendChild(svgEl('path', { d, fill: colors[i % colors.length], stroke: '#fff', 'stroke-width': '1' }));

            const mid = startAngle + angle / 2;
            const lx1 = Math.cos(mid) * 60; const ly1 = Math.sin(mid) * 60;
            const lx2 = Math.cos(mid) * 75; const ly2 = Math.sin(mid) * 75;
            const tx  = Math.cos(mid) * 80; const ty  = Math.sin(mid) * 80;
            svg.appendChild(svgEl('polyline', { points: `${lx1},${ly1} ${lx2},${ly2}`,
                fill: 'none', stroke: colors[i % colors.length], 'stroke-width': '1.5' }));
            const label = svgEl('text', { x: tx, y: ty,
                'text-anchor': Math.cos(mid) > 0 ? 'start' : 'end',
                'alignment-baseline': 'middle', 'font-size': '10', 'font-weight': '700', fill: 'var(--text-main)' });
            label.textContent = `${h.name} (${Math.round(pct * 100)}%)`;
            svg.appendChild(label);
            startAngle = endAngle;
        });
    }
    container.appendChild(svg);
}


// 13. MOVE TASK FEATURE

/** Open Move Task modal with month picker */
function openMoveTaskModal(dIdx, tIdx) {
    store.moveTaskSource = { dIdx, tIdx };
    store.openModal();
    const taskName = store.state.tasks[`t_name_${dIdx}_${tIdx}`] || '(task)';
    document.getElementById('move-task-subtitle').textContent =
        `Moving: "${taskName}" — Select a month, then a week, then a day.`;
    _renderMoveTaskBody(null, null);
    document.getElementById('move-task-modal').style.display = 'flex';
}

function closeMoveTaskModal() {
    store.closeModal();
    store.moveTaskSource = null;
    document.getElementById('move-task-modal').style.display = 'none';
}

/** Render the full body of the move-task modal */
function _renderMoveTaskBody(selectedMonthId, selectedWeekId) {
    const body = document.getElementById('move-task-body');
    body.innerHTML = '';

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIdx = now.getMonth();
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    // --- Section: months ---
    const monthSection = document.createElement('div');
    monthSection.className = 'move-task-section';
    const monthLabel = document.createElement('div');
    monthLabel.className = 'move-task-section-label';
    monthLabel.textContent = 'Select Month';
    monthSection.appendChild(monthLabel);

    const monthGrid = document.createElement('div');
    monthGrid.className = 'move-task-months';

    for (let mIdx = 0; mIdx < 12; mIdx++) {
        const mId = `${currentYear}-${String(mIdx + 1).padStart(2, '0')}`;
        const cell = document.createElement('div');
        let cls = 'move-task-month-cell';
        if (mIdx === currentMonthIdx) cls += ' move-task-month-cell--current';
        if (selectedMonthId === mId) cls += ' move-task-month-cell--active';
        cell.className = cls;
        cell.dataset.monthId = mId;
        cell.innerHTML = `${monthNames[mIdx]}<br><span style="font-size:10px;font-weight:600;opacity:0.7;">${currentYear}</span>`;
        cell.addEventListener('click', () => _renderMoveTaskBody(mId, null));
        monthGrid.appendChild(cell);
    }
    monthSection.appendChild(monthGrid);
    body.appendChild(monthSection);

    if (!selectedMonthId) return;

    // --- Section: weeks ---
    const [y, m] = selectedMonthId.split('-').map(Number);
    const firstOfMonth = new Date(y, m - 1, 1);
    const fullMonthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    const weeksSection = document.createElement('div');
    weeksSection.className = 'move-task-section';
    const weekLabel = document.createElement('div');
    weekLabel.className = 'move-task-section-label';
    weekLabel.textContent = `Weeks in ${fullMonthNames[m - 1]} ${y}`;
    weeksSection.appendChild(weekLabel);

    const weekGrid = document.createElement('div');
    weekGrid.className = 'move-task-weeks';

    const fmt = d => `${d.getDate()}/${d.getMonth() + 1}`;
    let monday = getMonday(firstOfMonth);
    for (let i = 0; i < 5; i++) {
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const wId = formatDateKey(monday);
        const label = `${fmt(monday)}–${fmt(sunday)}`;
        const hasData = !!store.appData.weeks[wId];

        const cell = document.createElement('div');
        let cls = 'move-task-week-cell';
        if (!hasData) cls += ' move-task-week-cell--empty';
        if (selectedWeekId === wId) cls += ' move-task-week-cell--active';
        cell.className = cls;
        cell.dataset.weekId = wId;
        cell.innerHTML = `W${i + 1}<br><span style="font-size:10px;font-weight:600;opacity:0.8;">${label}</span>`;
        cell.addEventListener('click', () => _renderMoveTaskBody(selectedMonthId, wId));
        weekGrid.appendChild(cell);

        monday = new Date(monday);
        monday.setDate(monday.getDate() + 7);
    }
    weeksSection.appendChild(weekGrid);
    body.appendChild(weeksSection);

    if (!selectedWeekId) return;

    // --- Section: days ---
    const daysSection = document.createElement('div');
    daysSection.className = 'move-task-section';
    const daysLabel = document.createElement('div');
    daysLabel.className = 'move-task-section-label';
    daysLabel.textContent = 'Select Day';
    daysSection.appendChild(daysLabel);

    const daysGrid = document.createElement('div');
    daysGrid.className = 'move-task-days';

    const wParts = selectedWeekId.split('-');
    const wMonday = new Date(wParts[0], wParts[1] - 1, wParts[2]);
    const wData = store.appData.weeks[selectedWeekId] || { tasks: {} };

    DAYS_DATA.forEach((dayObj, dIdx) => {
        const date = new Date(wMonday);
        date.setDate(wMonday.getDate() + dIdx);
        const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;

        let emptySlots = 0;
        for (let t = 0; t < TASKS_PER_DAY; t++) {
            if (!(wData.tasks[`t_name_${dIdx}_${t}`] || '').trim()) emptySlots++;
        }
        const isFull = emptySlots === 0;

        const cell = document.createElement('div');
        let cls = 'move-task-day-cell';
        if (isFull) cls += ' move-task-day-cell--full';
        cell.className = cls;
        cell.innerHTML = `<div style="font-size:11px;font-weight:800;">${dayObj.name.slice(0, 3).toUpperCase()}</div><div style="font-size:10px;opacity:0.7;">${dateStr}</div>`;
        if (!isFull) {
            cell.addEventListener('click', () => _executeMoveTask(selectedWeekId, dIdx));
        }
        daysGrid.appendChild(cell);
    });

    daysSection.appendChild(daysGrid);
    body.appendChild(daysSection);
}

function _executeMoveTask(targetWeekId, targetDayIdx) {
    const src = store.moveTaskSource;
    if (!src) return;

    // Ensure the target week exists
    if (!store.appData.weeks[targetWeekId]) {
        store.appData.weeks[targetWeekId] = { tasks: {}, habits: {}, notes: {} };
        _applyPersistentData(targetWeekId);
    }

    const srcWeekId = store.viewingWeekId;
    const srcDay = src.dIdx;
    const srcTask = src.tIdx;

    // Read task data from state (currently viewed week)
    const taskData = _readTaskFromState(srcDay, srcTask);
    if (!taskData.name.trim()) { closeMoveTaskModal(); return; }

    // Find an empty slot in the target day
    const dstWeekData = store.appData.weeks[targetWeekId];
    let emptyIdx = -1;
    for (let t = 0; t < TASKS_PER_DAY; t++) {
        if (!(dstWeekData.tasks[`t_name_${targetDayIdx}_${t}`] || '').trim()) {
            emptyIdx = t; break;
        }
    }
    if (emptyIdx === -1) { alert('Day is full!'); return; }

    // Write task into the target week (directly in appData)
    const dstTasks = dstWeekData.tasks;
    dstTasks[`t_name_${targetDayIdx}_${emptyIdx}`]    = taskData.name;
    dstTasks[`t_h_start_${targetDayIdx}_${emptyIdx}`] = taskData.hStart;
    dstTasks[`t_m_start_${targetDayIdx}_${emptyIdx}`] = taskData.mStart;
    dstTasks[`t_h_end_${targetDayIdx}_${emptyIdx}`]   = taskData.hEnd;
    dstTasks[`t_m_end_${targetDayIdx}_${emptyIdx}`]   = taskData.mEnd;
    dstTasks[`t_check_${targetDayIdx}_${emptyIdx}`]   = taskData.checked;
    dstTasks[`t_pri_${targetDayIdx}_${emptyIdx}`]     = taskData.pri;
    dstTasks[`t_delay_${targetDayIdx}_${emptyIdx}`]   = taskData.delay;

    // Clear task from source week in state and DOM
    const emptyData = { name: '', hStart: '', mStart: '', hEnd: '', mEnd: '', checked: false, pri: '3', delay: '0' };
    _writeTaskToState(srcDay, srcTask, emptyData);
    _flushTaskToDOM(srcDay, srcTask);

    // If moving within the same week, also update DOM immediately
    if (targetWeekId === srcWeekId) {
        _writeTaskToState(targetDayIdx, emptyIdx, taskData);
        _flushTaskToDOM(targetDayIdx, emptyIdx);
        sortTasks(targetDayIdx);
        scheduler.uiUpdate(targetDayIdx);
    }

    // Sync source state and save
    store.appData.weeks[srcWeekId] = store.appData.weeks[srcWeekId] || { tasks: {}, habits: {}, notes: {} };
    _syncStateFromDOM();
    store.appData.weeks[srcWeekId].tasks = Object.assign({}, store.state.tasks);
    sortTasks(srcDay);
    scheduler.uiUpdate(srcDay);
    saveGlobalData();

    closeMoveTaskModal();
}

// 14. MODAL LOGIC
function openNoteModal() {
    store.openModal();
    document.getElementById('note-modal').style.display = 'flex';
    // Re-run resize now that the modal is visible (scrollHeight was 0 while hidden)
    requestAnimationFrame(() => {
        document.querySelectorAll('#notes-container textarea').forEach(autoResizeTextarea);
    });
}
function closeNoteModal()   { store.closeModal(); document.getElementById('note-modal').style.display = 'none'; }
function openAbbrModal()    { store.openModal(); document.getElementById('abbr-modal').style.display = 'flex'; }
function closeAbbrModal()   { store.closeModal(); document.getElementById('abbr-modal').style.display = 'none'; }
function openSettingsModal()  { store.openModal(); document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettingsModal() { store.closeModal(); document.getElementById('settings-modal').style.display = 'none'; }

function openMonthlyModal() {
    store.openModal();
    // Use viewingMonthId directly — do not recalculate from viewingWeekId,
    // because the first week of a month may start on a Monday from the previous month.
    if (!store.viewingMonthId) {
        const parts = store.viewingWeekId.split('-');
        const vDate = new Date(parts[0], parts[1] - 1, parts[2]);
        store.viewingMonthId = `${vDate.getFullYear()}-${String(vDate.getMonth() + 1).padStart(2, '0')}`;
    }
    document.getElementById('monthly-modal').style.display = 'flex';
    loadMonthlyData();
}
function closeMonthlyModal() {
    store.closeModal();
    document.getElementById('monthly-modal').style.display = 'none';
    document.getElementById('monthly-bar-chart').innerHTML = '';
    document.getElementById('monthly-pie-chart').innerHTML = '';
}

function loadMonthlyData() {
    document.getElementById('monthly-bar-chart').innerHTML  = '';
    document.getElementById('monthly-pie-chart').innerHTML  = '';
    document.getElementById('modal-weekly-cols').innerHTML  = '';

    // Load data for the currently viewed month
    store.appData.monthly = store.appData.monthly || {};

    // One-time migration: if old flat keys (mg_1...) still exist, migrate them into the current viewing month.
    // Flat keys indicate data saved before the per-month format was introduced.
    const monthly = store.appData.monthly;
    if (monthly['mg_1'] !== undefined || monthly['gr_name_1'] !== undefined) {
        const currentMonthForMigration = store.viewingMonthId;
        monthly[currentMonthForMigration] = monthly[currentMonthForMigration] || {};
        for (let i = 1; i <= 3; i++) {
            ['mg', 'gr_name', 'gr_target', 'gr_actual', 'gr_status'].forEach(k => {
                const key = `${k}_${i}`;
                if (monthly[key] !== undefined) {
                    monthly[currentMonthForMigration][key] = monthly[key];
                    delete monthly[key];
                }
            });
        }
        saveGlobalData();
    }

    const monthId = store.viewingMonthId;
    const mData = store.appData.monthly[monthId] || {};

    try {
        for (let i = 1; i <= 3; i++) {
            document.getElementById(`mg-${i}`).value        = mData[`mg_${i}`]        || '';
            document.getElementById(`gr-name-${i}`).value   = mData[`gr_name_${i}`]   || '';
            document.getElementById(`gr-target-${i}`).value = mData[`gr_target_${i}`] || '';
            document.getElementById(`gr-actual-${i}`).value = mData[`gr_actual_${i}`] || '';
            document.getElementById(`gr-status-${i}`).value = mData[`gr_status_${i}`] || 'Pending';
            updateRowStatus(i);
        }
    } catch (err) {
        console.warn('[loadMonthlyData] Goals render error:', err);
    }

    const weekBlocks    = getMonthWeeks();
    const colsContainer = document.getElementById('modal-weekly-cols');
    colsContainer.style.gridTemplateColumns = 'repeat(5, 1fr)';
    const colsFragment  = document.createDocumentFragment();
    const dailyTaskPcts = [];

    weekBlocks.forEach(block => {
        const wId       = block.wId;
        const wIdForNav = formatDateKey(block.mondayDate);
        let taskPct = 0; let habPct = 0;
        try {
            if (wId && store.appData.weeks[wId]) {
                const wd = store.appData.weeks[wId];
                let tDone = 0; let tTotal = 0; let hDone = 0; let hTotal = 0;
                for (let d = 0; d < 7; d++) {
                    let dayDone = 0; let dayTotal = 0;
                    for (let t = 0; t < 10; t++) {
                        if (wd.tasks[`t_name_${d}_${t}`]) {
                            dayTotal++; tTotal++;
                            if (wd.tasks[`t_check_${d}_${t}`]) { dayDone++; tDone++; }
                        }
                    }
                    dailyTaskPcts.push(dayTotal > 0 ? (dayDone / dayTotal) * 100 : 0);
                }
                if (tTotal > 0) taskPct = Math.round((tDone / tTotal) * 100);
                for (let h = 0; h < 5; h++) {
                    if (wd.habits[`h_name_${h}`]) {
                        for (let d = 0; d < 7; d++) { hTotal++; if (wd.habits[`h_check_${h}_${d}`]) hDone++; }
                    }
                }
                if (hTotal > 0) habPct = Math.round((hDone / hTotal) * 100);
            } else { for (let d = 0; d < 7; d++) dailyTaskPcts.push(0); }
        } catch (err) { for (let d = 0; d < 7; d++) dailyTaskPcts.push(0); }

        const card  = document.createElement('div'); card.className = 'week-card';
        const h4    = document.createElement('h4');
        h4.style.cssText = 'font-size:11px;margin:0 0 10px;text-transform:none;'; h4.textContent = block.label;
        const stats = document.createElement('div'); stats.className = 'week-card-stats';
        stats.innerHTML = `<div><div class="week-card__pct">${taskPct}%</div><div class="week-card__label">Tasks</div></div>` +
                          `<div><div style="font-size:14px;font-weight:800;color:var(--border-darker);">${habPct}%</div><div class="week-card__label">Habits</div></div>`;
        const btn = document.createElement('button'); btn.className = 'nav-btn detail-btn';
        btn.onclick = () => switchToWeek(wIdForNav); btn.textContent = 'Detail';
        card.appendChild(h4); card.appendChild(stats); card.appendChild(btn);
        colsFragment.appendChild(card);
    });
    colsContainer.appendChild(colsFragment);

    drawBarChart(document.getElementById('monthly-bar-chart'), dailyTaskPcts, weekBlocks);

    // Build habit stats for pie
    const habitStats = [];
    for (let h = 0; h < 5; h++) {
        let totalDones = 0; let hName = '';
        weekBlocks.forEach(block => {
            const wId = block.wId;
            if (wId && store.appData.weeks[wId] && store.appData.weeks[wId].habits[`h_name_${h}`]) {
                hName = store.appData.weeks[wId].habits[`h_name_${h}`];
                for (let d = 0; d < 7; d++) {
                    if (store.appData.weeks[wId].habits[`h_check_${h}_${d}`]) totalDones++;
                }
            }
        });
        if (hName && totalDones > 0) habitStats.push({ name: hName, count: totalDones });
    }
    drawPieChart(document.getElementById('monthly-pie-chart'), habitStats);
}

// 14. WEEK / MONTH NAVIGATION
function switchToWeek(targetWeekId) {
    _syncStateFromDOM(); saveData();
    const p = targetWeekId.split('-');
    store.viewingMonthId    = `${p[0]}-${p[1]}`;
    store.viewingWeekId     = targetWeekId;
    store.isViewingNextWeek = false;
    const title = document.getElementById('board-title');
    if (targetWeekId === store.currentRealWeekId) {
        title.innerText = 'CURRENT WEEK';
    } else {
        const d = new Date(p[0], p[1] - 1, p[2]);
        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        title.innerText = `${monthNames[d.getMonth()].toUpperCase()} ${d.getFullYear()}`;
    }
    if (!store.appData.weeks[store.viewingWeekId]) {
        store.appData.weeks[store.viewingWeekId] = { tasks: {}, habits: {}, notes: {} };
        _applyPersistentData(store.viewingWeekId);
    }
    closeMonthlyModal();
    generateWeekDates(store.viewingWeekId);
    rebuildUI();
}

function openMonthPickerModal() {
    store.openModal();
    // Do not recalculate viewingMonthId from viewingWeekId — the first week of a month
    // may start on a Monday from the previous month.
    // viewingMonthId is set correctly by switchToMonth or calculateWeekIds.
    renderMonthPickerGrid();
    document.getElementById('month-picker-modal').style.display = 'flex';
}
function closeMonthPickerModal() {
    store.closeModal();
    document.getElementById('month-picker-modal').style.display = 'none';
}

function renderMonthPickerGrid() {
    const now           = new Date();
    const currentYear   = now.getFullYear();
    const currentMonthIdx = now.getMonth();
    const monthNames    = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const activeMonthIdx = parseInt(store.viewingMonthId.split('-')[1]) - 1;
    const activeYear    = parseInt(store.viewingMonthId.split('-')[0]);
    const grid          = document.getElementById('month-picker-grid');
    grid.innerHTML      = '';
    const fragment      = document.createDocumentFragment();
    for (let mIdx = 0; mIdx < 12; mIdx++) {
        const isPast   = (currentYear === activeYear && mIdx < currentMonthIdx) || (activeYear < currentYear);
        const isCurrent = mIdx === currentMonthIdx;
        const isActive  = mIdx === activeMonthIdx && currentYear === activeYear;
        const hasData   = Object.keys(store.appData.weeks).some(wId => {
            const p = wId.split('-');
            return parseInt(p[0]) === currentYear && parseInt(p[1]) - 1 === mIdx;
        });
        let cls = 'month-picker__cell';
        if (isPast) cls += ' month-picker__cell--past';
        else if (isActive) cls += ' month-picker__cell--active';
        else if (isCurrent) cls += ' month-picker__cell--current';
        if (hasData && !isPast) cls += ' month-picker__cell--has-data';
        const mId  = `${currentYear}-${String(mIdx + 1).padStart(2, '0')}`;
        const cell = document.createElement('div');
        cell.className = cls; cell.dataset.monthId = mId;
        cell.innerHTML = `${monthNames[mIdx]}<br><span style="font-size:10px;font-weight:600;opacity:0.7;">${currentYear}</span>`;
        fragment.appendChild(cell);
    }
    grid.appendChild(fragment);
    grid.onclick = e => {
        const cell = e.target.closest('.month-picker__cell');
        if (!cell || cell.classList.contains('month-picker__cell--past')) return;
        switchToMonth(cell.dataset.monthId);
    };
}

function switchToMonth(monthId) {
    const parts = monthId.split('-').map(Number);
    const y = parts[0]; const m = parts[1];
    const firstOfMonth    = new Date(y, m - 1, 1);
    const mondayOfFirst   = getMonday(firstOfMonth);
    const targetWeekId    = formatDateKey(mondayOfFirst);
    if (!store.appData.weeks[targetWeekId]) {
        store.appData.weeks[targetWeekId] = { tasks: {}, habits: {}, notes: {} };
        _applyPersistentData(targetWeekId);
    }
    store.viewingMonthId = monthId;
    const now = new Date();
    const isCurrentMonth = (y === now.getFullYear() && m - 1 === now.getMonth());
    const shortMonths = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const title = document.getElementById('board-title');
    if (isCurrentMonth) {
        store.viewingWeekId = store.currentRealWeekId; store.isViewingNextWeek = false;
        title.innerText = 'CURRENT WEEK';
    } else {
        store.viewingWeekId = targetWeekId; store.isViewingNextWeek = false;
        title.innerText = `${shortMonths[m - 1].toUpperCase()} ${y}`;
    }
    closeMonthPickerModal();
    generateWeekDates(store.viewingWeekId);
    rebuildUI();
    // If the Monthly Summary modal is open, reload data for the new month
    const monthlyModal = document.getElementById('monthly-modal');
    if (monthlyModal && monthlyModal.style.display === 'flex') {
        loadMonthlyData();
    }
}


// 15. TOOLTIP (throttled mousemove)
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

let _tooltipThrottle = null;
document.addEventListener('mousemove', e => {
    const tooltip = document.getElementById('abbr-tooltip');
    if (!e.target || !e.target.classList.contains('t-name')) {
        if (tooltip) tooltip.style.display = 'none';
        return;
    }
    if (_tooltipThrottle) return;
    _tooltipThrottle = requestAnimationFrame(() => {
        _tooltipThrottle = null;
        const target = e.target;
        if (!target || !target.classList.contains('t-name')) { tooltip.style.display = 'none'; return; }
        const text = target.value;
        if (!text) { tooltip.style.display = 'none'; return; }
        const foundAbbrs = [];
        const abbrCount = store.appData.abbrsCount || 10;
        for (let i = 1; i <= abbrCount; i++) {
            const k = store.appData.abbrs?.[`abbr_k_${i}`];
            const v = store.appData.abbrs?.[`abbr_v_${i}`];
            const safeK = k ? k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
            if (k && v && new RegExp(`\\b${safeK}\\b`, 'i').test(text)) {
                foundAbbrs.push(`<b>${escapeHtml(k)}</b>: ${escapeHtml(v)}`);
            }
        }
        if (foundAbbrs.length > 0) {
            tooltip.innerHTML = foundAbbrs.join('<br>');
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + window.scrollX) + 'px';
            tooltip.style.top  = (e.clientY + window.scrollY + 20) + 'px';
        } else { tooltip.style.display = 'none'; }
    });
});

// 16. EVENT DELEGATION
function initEventDelegation() {
    document.addEventListener('click',       handleDocumentClick);
    document.addEventListener('contextmenu', handleDocumentContextMenu);
    document.addEventListener('click', (e) => {
        if (e.target.closest('#auth-overlay')) return;
        if (e.target.closest('#task-action-menu')) return;
        if (e.target.closest('[data-action]')) handleTopNavClick(e);
    });
    document.getElementById('priority-menu').addEventListener('click', handlePriorityMenuClick);
    document.body.addEventListener('click', handleModalCloseClick);

    // Task action menu (Mark / Move Task)
    document.getElementById('task-action-menu').addEventListener('click', handleTaskActionMenuClick);
    document.addEventListener('change', handleNotesChange);
    document.addEventListener('change', handleAbbrChange);
    document.addEventListener('change', handleMonthlyModalChange);

    const mainGrid = document.getElementById('main-grid');
    mainGrid.addEventListener('change',      handleMainGridChange);
    mainGrid.addEventListener('click',       handleMainGridClick);
    mainGrid.addEventListener('pointerdown', handleMainGridPointerDown);
    mainGrid.addEventListener('input', (e) => {
        if (!e.target.classList.contains('t-name')) return;
        _capitalizeFirstLetter(e.target);
    });
    mainGrid.addEventListener('contextmenu', handleMainGridContextMenu);
    mainGrid.addEventListener('dragstart',   handleMainGridDragStart);
    mainGrid.addEventListener('dragover',    handleMainGridDragOver);
    mainGrid.addEventListener('drop',        handleMainGridDrop);
    mainGrid.addEventListener('dragend',     () => { store.draggedTask = null; });
    mainGrid.addEventListener('keydown',     handleMainGridKeydown);

    const habitContainer = document.getElementById('habit-container');
    habitContainer.addEventListener('change', handleHabitChange);
    habitContainer.addEventListener('input',  handleHabitInput);

    // Settings toggles & language
    ['setting-persistent-notes', 'setting-persistent-abbr', 'setting-persistent-habit'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            const keyMap = { 'setting-persistent-notes': 'persistentNotes', 'setting-persistent-abbr': 'persistentAbbr', 'setting-persistent-habit': 'persistentHabit' };
            store.appData.settings[keyMap[id]] = e.target.checked;
            saveGlobalData();
        });
    });
    document.getElementById('setting-language').addEventListener('change', (e) => {
        store.appData.settings.language = e.target.value;
        saveGlobalData();
    });

    // Auto-scroll when dragging near screen edges
    // (HTML5 DnD API suppresses wheel events during drag — use dragover instead)
    const SCROLL_ZONE = 80;   // px from edge to activate scroll
    const SCROLL_SPEED = 12;  // px per frame
    let _dragScrollRaf = null;

    function _dragAutoScroll(e) {
        if (!store.draggedTask) { _stopDragScroll(); return; }
        const { clientX, clientY } = e;
        const W = window.innerWidth;
        const H = window.innerHeight;
        let dx = 0, dy = 0;
        if (clientX < SCROLL_ZONE)       dx = -SCROLL_SPEED * (1 - clientX / SCROLL_ZONE);
        else if (clientX > W - SCROLL_ZONE) dx =  SCROLL_SPEED * (1 - (W - clientX) / SCROLL_ZONE);
        if (clientY < SCROLL_ZONE)       dy = -SCROLL_SPEED * (1 - clientY / SCROLL_ZONE);
        else if (clientY > H - SCROLL_ZONE) dy =  SCROLL_SPEED * (1 - (H - clientY) / SCROLL_ZONE);
        if (dx !== 0 || dy !== 0) {
            window.scrollBy(dx, dy);
            _dragScrollRaf = requestAnimationFrame(() => _dragAutoScroll(e));
        } else {
            _stopDragScroll();
        }
    }

    function _stopDragScroll() {
        if (_dragScrollRaf) { cancelAnimationFrame(_dragScrollRaf); _dragScrollRaf = null; }
    }

    document.addEventListener('dragover', (e) => {
        if (!store.draggedTask) return;
        _stopDragScroll();
        _dragAutoScroll(e);
    });

    document.addEventListener('dragend', _stopDragScroll);

    // Touch drag & drop fallback for mobile
    let _touchDragInfo      = null;
    let _touchClone         = null;
    let _touchStartX        = 0;
    let _touchStartY        = 0;
    let _touchDragConfirmed = false;
    let _touchRafHandle     = null;

    mainGrid.addEventListener('touchstart', (e) => {
        const cb = e.target.closest('input[type="checkbox"].task-check-trigger');
        if (!cb) return;
        const taskItem = cb.closest('.task-item');
        if (!taskItem) return;
        const parts = taskItem.id.split('_');
        const dIdx = parseInt(parts[2]); const tIdx = parseInt(parts[3]);
        const nameEl = document.getElementById(`t_name_${dIdx}_${tIdx}`);
        if (!nameEl || !nameEl.value.trim()) return;

        // Record start position and task reference — do NOT create clone yet
        const touch = e.touches[0];
        _touchStartX        = touch.clientX;
        _touchStartY        = touch.clientY;
        _touchDragConfirmed = false;
        _touchDragInfo      = { dIdx, tIdx, taskItem };
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!_touchDragInfo) return;
        const touch = e.touches[0];

        if (!_touchDragConfirmed) {
            // Check if movement exceeds 8px threshold to confirm drag
            const dx = touch.clientX - _touchStartX;
            const dy = touch.clientY - _touchStartY;
            if (Math.sqrt(dx * dx + dy * dy) < 8) return; // allow native scroll

            // Confirm drag — create clone now
            _touchDragConfirmed = true;
            store.draggedTask = { dIdx: _touchDragInfo.dIdx, tIdx: _touchDragInfo.tIdx };
            const taskItem = _touchDragInfo.taskItem;
            const rect = taskItem.getBoundingClientRect();
            _touchClone = taskItem.cloneNode(true);
            _touchClone.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;opacity:0.75;pointer-events:none;z-index:9999;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.2);`;
            document.body.appendChild(_touchClone);
            taskItem.style.opacity = '0.3';
        }

        // Drag is confirmed — suppress scroll and schedule clone position update via rAF
        e.preventDefault();
        const clientX = touch.clientX;
        const clientY = touch.clientY;
        if (_touchRafHandle) cancelAnimationFrame(_touchRafHandle);
        _touchRafHandle = requestAnimationFrame(() => {
            if (!_touchClone) return;
            const W = window.innerWidth; const H = window.innerHeight;
            _touchClone.style.left = (clientX - 40) + 'px';
            _touchClone.style.top  = (clientY - 20) + 'px';
            // Edge scroll
            if (clientY < SCROLL_ZONE) window.scrollBy(0, -SCROLL_SPEED);
            else if (clientY > H - SCROLL_ZONE) window.scrollBy(0, SCROLL_SPEED);
            if (clientX < SCROLL_ZONE) window.scrollBy(-SCROLL_SPEED, 0);
            else if (clientX > W - SCROLL_ZONE) window.scrollBy(SCROLL_SPEED, 0);
            _touchRafHandle = null;
        });
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!_touchDragInfo) return;

        // Clear rAF handle
        if (_touchRafHandle) { cancelAnimationFrame(_touchRafHandle); _touchRafHandle = null; }

        if (_touchDragConfirmed && _touchClone) {
            const touch = e.changedTouches[0];
            _touchClone.remove();
            _touchDragInfo.taskItem.style.opacity = '';

            const dropEl = document.elementFromPoint(touch.clientX, touch.clientY);
            if (dropEl) {
                const targetTaskItem = dropEl.closest('.task-item');
                const targetTaskList = dropEl.closest('.task-list');
                if (targetTaskItem) {
                    const parts = targetTaskItem.id.split('_');
                    dropOnTaskItem(e, parseInt(parts[2]), parseInt(parts[3]));
                } else if (targetTaskList) {
                    dropTask(e, parseInt(targetTaskList.id.replace('task_list_', '')));
                } else {
                    store.draggedTask = null;
                }
            } else {
                store.draggedTask = null;
            }
        } else {
            // Drag was not confirmed (tap or tiny movement) — restore state
            store.draggedTask = null;
        }

        _touchClone         = null;
        _touchDragInfo      = null;
        _touchDragConfirmed = false;
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
        // Reset all drag state to pre-drag values
        if (_touchRafHandle) { cancelAnimationFrame(_touchRafHandle); _touchRafHandle = null; }
        if (_touchClone) { _touchClone.remove(); _touchClone = null; }
        if (_touchDragInfo) { _touchDragInfo.taskItem.style.opacity = ''; }
        _touchDragInfo      = null;
        _touchDragConfirmed = false;
        store.draggedTask   = null;
    });
}

function handleDocumentClick(e) {
    const actionMenu = document.getElementById('task-action-menu');
    const priorityMenu = document.getElementById('priority-menu');
    if (actionMenu && !actionMenu.contains(e.target)) actionMenu.style.display = 'none';
    // Don't hide priority-menu if the click came from inside task-action-menu (Mark button opens it)
    if (priorityMenu && !priorityMenu.contains(e.target) && !actionMenu.contains(e.target)) priorityMenu.style.display = 'none';
    if (e.target && e.target.id === 'focus-backdrop') closeFocus();
}
function handleDocumentContextMenu(e) {
    if (e.target && e.target.id === 'greeting-text') renameUser(e);
}
function handleAuthClick(e) {
    if (e.target.closest('[data-action="login"]')) handleLogin();
}
function handleTopNavClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'open-monthly')           openMonthlyModal();
    else if (a === 'open-month-picker') openMonthPickerModal();
    else if (a === 'logout')            handleLogout();
    else if (a === 'open-notes')        openNoteModal();
    else if (a === 'open-abbr')         openAbbrModal();
    else if (a === 'open-settings')     openSettingsModal();
}
function handleTaskActionMenuClick(e) {
    const item = e.target.closest('[data-action]');
    if (!item) return;
    const action = item.dataset.action;
    document.getElementById('task-action-menu').style.display = 'none';
    if (action === 'toggle-done') {
        const d = store.rightClickDay; const t = store.rightClickTask;
        if (d === null || t === null) return;
        const cb = document.getElementById(`t_check_${d}_${t}`);
        if (cb) { cb.checked = !cb.checked; _stateSetTask(d, t, 'check', cb.checked); updateDayAndSave(d); }
    } else if (action === 'show-mark-submenu') {        // Show priority-menu at the same position as task-action-menu
        const actionMenu = document.getElementById('task-action-menu');
        const menu = document.getElementById('priority-menu');
        menu.style.left = actionMenu.style.left;
        menu.style.top  = actionMenu.style.top;
        menu.style.display = 'block';
    } else if (action === 'show-move-task') {
        const d = store.rightClickDay; const t = store.rightClickTask;
        if (d === null || t === null) return;
        openMoveTaskModal(d, t);
    }
}
function handlePriorityMenuClick(e) {
    const item = e.target.closest('[data-priority]');
    if (!item) return;
    const raw = item.dataset.priority;
    setPriority(['0','1','2','3'].includes(raw) ? parseInt(raw) : raw);
}
function handleModalCloseClick(e) {
    const btn = e.target.closest('[data-close]');
    if (!btn) return;
    const id = btn.dataset.close;
    if (id === 'note-modal')              closeNoteModal();
    else if (id === 'abbr-modal')         closeAbbrModal();
    else if (id === 'monthly-modal')      closeMonthlyModal();
    else if (id === 'month-picker-modal') closeMonthPickerModal();
    else if (id === 'settings-modal')     closeSettingsModal();
    else if (id === 'move-task-modal')    closeMoveTaskModal();
}
function handleMainGridContextMenu(e) {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    e.preventDefault(); // prevent browser context menu
    const taskItem = cb.closest('.task-item');
    if (!taskItem) return;
    const parts = taskItem.id.split('_');
    showContextMenu(e, parseInt(parts[2]), parseInt(parts[3]));
}
function handleMainGridPointerDown(e) {
    // Intercept left-click on checkbox to prevent toggle — but do NOT preventDefault,
    // because preventDefault on pointerdown would also block the dragstart event.
    // Toggle prevention is handled by handleMainGridClick (shows context menu instead).
}
function handleMainGridClick(e) {
    // Left-click on checkbox → toggle done state directly
    const cb = e.target.closest('input[type="checkbox"].task-check-trigger');
    if (!cb) return;
    const taskItem = cb.closest('.task-item');
    if (!taskItem) return;
    const parts = taskItem.id.split('_');
    const dIdx = parseInt(parts[2]); const tIdx = parseInt(parts[3]);
    _stateSetTask(dIdx, tIdx, 'check', cb.checked);
    updateDayAndSave(dIdx);
}
function handleMainGridChange(e) {
    const taskItem = e.target.closest('.task-item');
    if (!taskItem) return;
    const parts = taskItem.id.split('_');
    const d = parseInt(parts[2]); const t = parseInt(parts[3]);
    if (e.target.type === 'checkbox' && e.target.id.startsWith('t_check_')) {
        _stateSetTask(d, t, 'check', e.target.checked); updateDayAndSave(d);
    } else if (e.target.classList.contains('t-name')) {
        _stateSetTask(d, t, 'name', e.target.value); updateDayAndSave(d);
    } else if (e.target.classList.contains('t-time-part')) {
        formatTimeInput(e.target);
        const m = e.target.id.match(/^t_([a-z_]+)_\d+_\d+$/);
        if (m) { _stateSetTask(d, t, m[1], e.target.value); updateDayAndSave(d); }
    }
}
function handleMainGridKeydown(e) {
    if (!e.target.classList.contains('t-time-part')) return;
    const taskItem = e.target.closest('.task-item');
    if (!taskItem) return;
    const parts = taskItem.id.split('_');
    const d = parseInt(parts[2]); const t = parseInt(parts[3]);
    const types = ['h_start', 'm_start', 'h_end', 'm_end'];
    const idx = types.findIndex(tp => e.target.id === `t_${tp}_${d}_${t}`);
    if (idx !== -1) handleTimeNavigation(e, d, t, idx);
}
function handleMainGridDragStart(e) {
    const cb = e.target.closest('input[type="checkbox"].task-check-trigger');
    if (!cb) return;
    const taskItem = cb.closest('.task-item');
    if (!taskItem) return;
    const parts = taskItem.id.split('_');
    dragStartTask(e, parseInt(parts[2]), parseInt(parts[3]));
}
function handleMainGridDragOver(e) { dragOverTask(e); }
function handleMainGridDrop(e) {
    const taskItem = e.target.closest('.task-item');
    if (taskItem) {
        const parts = taskItem.id.split('_');
        dropOnTaskItem(e, parseInt(parts[2]), parseInt(parts[3])); return;
    }
    const taskList = e.target.closest('.task-list');
    if (taskList) dropTask(e, parseInt(taskList.id.replace('task_list_', '')));
}
function handleHabitChange(e) {
    if (e.target.type === 'checkbox' && e.target.id.startsWith('h_check_')) {
        store.state.habits[e.target.id] = e.target.checked; scheduler.save();
    } else if (e.target.tagName === 'TEXTAREA' && e.target.id.startsWith('h_name_')) {
        store.state.habits[e.target.id] = e.target.value; scheduler.save();
    }
}
function handleHabitInput(e) {
    if (e.target.tagName === 'TEXTAREA') {
        autoResizeTextarea(e.target); store.state.habits[e.target.id] = e.target.value;
    }
}
function handleNotesChange(e) {
    if (!e.target.id || !e.target.id.startsWith('note_input_')) return;
    store.state.notes[`note_${e.target.id.replace('note_input_', '')}`] = e.target.value;
    scheduler.save();
}
function handleAbbrChange(e) {
    if (!e.target.id || (!e.target.id.startsWith('abbr_k_') && !e.target.id.startsWith('abbr_v_'))) return;
    saveAbbrData();
}
function handleMonthlyModalChange(e) {
    const modal = document.getElementById('monthly-modal');
    if (!modal || !modal.contains(e.target)) return;
    if (e.target.id && e.target.id.startsWith('gr-status-')) {
        updateRowStatus(parseInt(e.target.id.replace('gr-status-', '')));
    }
    saveMonthly();
}

// TEST HOOKS — expose internals for property-based testing
window.store        = store;
window.escapeHtml   = escapeHtml;
window.showTooltip  = showTooltip;
window.hideTooltip  = hideTooltip;
window.dropTask     = dropTask;
window.sortTasks    = sortTasks;
window.saveData     = saveData;
window.loadWeekData = loadWeekData;
window.calculateWeekIds = calculateWeekIds;
window.openNoteModal    = openNoteModal;
window.addNoteRow       = addNoteRow;
window.addAbbrRow       = addAbbrRow;
window.closeNoteModal   = closeNoteModal;
window.openAbbrModal    = openAbbrModal;
window.closeAbbrModal   = closeAbbrModal;
window.openMonthlyModal    = openMonthlyModal;
window.closeMonthlyModal   = closeMonthlyModal;
window.openMonthPickerModal  = openMonthPickerModal;
window.closeMonthPickerModal = closeMonthPickerModal;

// Legacy aliases for preservation.test.html
Object.defineProperty(window, 'appData', {
    get() { return store.appData; },
    set(v) { store.appData = v; },
    configurable: true
});
Object.defineProperty(window, 'viewingWeekId', {
    get() { return store.viewingWeekId; },
    set(v) { store.viewingWeekId = v; },
    configurable: true
});
Object.defineProperty(window, 'viewingMonthId', {
    get() { return store.viewingMonthId; },
    set(v) { store.viewingMonthId = v; },
    configurable: true
});
Object.defineProperty(window, 'activeModalCount', {
    get() { return store.activeModalCount; },
    set(v) {
        // Adjust internal counter to match desired value
        const diff = v - store.activeModalCount;
        if (diff > 0) { for (let i = 0; i < diff; i++) store.openModal(); }
        else if (diff < 0) { for (let i = 0; i < -diff; i++) store.closeModal(); }
    },
    configurable: true
});

// Close IIFE
})();


