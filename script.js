const sUrl = 'https://bqrscbyuzqvdqvrvhlzn.supabase.co';
const sKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcnNjYnl1enF2ZHF2cnZobHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODc0MzQsImV4cCI6MjA4ODY2MzQzNH0.UpRpCxKWGtWzvqndTSnjQEShXa8f54T1KqLM8jWhumE';
const sbClient = window.supabase.createClient(sUrl, sKey);
let currentUser = null;

const daysData = [
    { name: "Monday", bg: "var(--day-yellow)", stroke: "var(--stroke-yellow)" },
    { name: "Tuesday", bg: "var(--day-green)", stroke: "var(--stroke-green)" },
    { name: "Wednesday", bg: "var(--day-blue)", stroke: "var(--stroke-blue)" },
    { name: "Thursday", bg: "var(--day-yellow)", stroke: "var(--stroke-yellow)" },
    { name: "Friday", bg: "var(--day-green)", stroke: "var(--stroke-green)" },
    { name: "Saturday", bg: "var(--day-blue)", stroke: "var(--stroke-blue)" },
    { name: "Sunday", bg: "var(--day-orange)", stroke: "var(--stroke-bright-orange)" }
];

const dayKeys = ["M", "T", "W", "T", "F", "S", "S"];
const tasksPerDay = 10;
const habitsCount = 5;
let dailyPercents = [0, 0, 0, 0, 0, 0, 0];
let dailyStats = Array(7).fill({done: 0, total: 0});
let weekDates = [];

let currentRealWeekId = "";
let viewingWeekId = "";
let isViewingNextWeek = false;

let appData = { weeks: {}, monthly: {}, abbrs: {} };
let saveTimeout;

let currentRightClickDay = null;
let currentRightClickTask = null;
let draggedTaskInfo = null;
let activeModalCount = 0;

async function checkAuth() {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('sync-loading-screen').style.display = 'flex';
        await loadGlobalDataFromDB();
        document.getElementById('sync-loading-screen').style.display = 'none';
        continueInit();
    } else {
        document.getElementById('auth-overlay').style.display = 'flex';
    }
}

async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const msg = document.getElementById('auth-msg');
    msg.innerText = "Checking...";
    
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
    if (error) {
        msg.innerText = "Invalid email or password.";
    } else {
        msg.innerText = "";
        location.reload(); 
    }
}

async function handleLogout() {
    await sbClient.auth.signOut();
    location.reload();
}

async function loadGlobalDataFromDB() {
    if (!currentUser) return;
    const { data, error } = await sbClient.from('user_plans').select('plan_data').eq('user_id', currentUser.id).single();
    if (data && data.plan_data) {
        appData = data.plan_data;
        localStorage.setItem('plan_app_data', JSON.stringify(appData));
    } else {
        const saved = localStorage.getItem('plan_app_data');
        if (saved) appData = JSON.parse(saved);
    }
    if (!appData.weeks) appData.weeks = {};
    if (!appData.monthly) appData.monthly = {};
    if (!appData.abbrs) appData.abbrs = {};
}

function saveGlobalData() {
    localStorage.setItem('plan_app_data', JSON.stringify(appData));
    if (currentUser) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            const { error } = await sbClient.from('user_plans').upsert({ user_id: currentUser.id, plan_data: appData });
            if (!error) {
                const toast = document.getElementById('save-toast');
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2000);
            }
        }, 1500); 
    }
}

window.onload = checkAuth;

function renameUser(e) {
    e.preventDefault();
    let currentName = localStorage.getItem('dashboard_username') || "Name";
    let newName = prompt("Enter your name:", currentName);
    if (newName !== null && newName.trim() !== "") {
        localStorage.setItem('dashboard_username', newName.trim());
        document.getElementById('greeting-text').innerText = `Hi ${newName.trim()} !!`;
    }
}

function initNotesUI() {
    let html = '';
    for(let i=1; i<=10; i++) {
        html += `<div style="display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700;">
                    <label style="width:25px; text-align:right;">${i}.</label>
                    <input type="text" id="note_input_${i}" onchange="saveData()" placeholder="..." 
                        style="flex-grow: 1; padding: 8px; border: 2px solid rgba(194, 139, 98, 0.4); border-radius: 6px; font-family: inherit; font-size: 13px; outline: none; background: rgba(255, 255, 255, 0.9);">
                 </div>`;
    }
    document.getElementById('notes-container').innerHTML = html;
}

function initAbbrUI() {
    let html = '';
    for(let i=1; i<=10; i++) {
        html += `<div style="display: grid; grid-template-columns: 1fr 2fr; gap: 10px;">
                    <input type="text" id="abbr_k_${i}" onchange="saveAbbrData()" placeholder="" style="padding: 6px; border: 2px solid rgba(194, 139, 98, 0.4); border-radius: 6px; font-family: inherit; font-size: 12px; outline: none; background: rgba(255, 255, 255, 0.9);">
                    <input type="text" id="abbr_v_${i}" onchange="saveAbbrData()" placeholder="" style="padding: 6px; border: 2px solid rgba(194, 139, 98, 0.4); border-radius: 6px; font-family: inherit; font-size: 12px; outline: none; background: rgba(255, 255, 255, 0.9);">
                 </div>`;
    }
    document.getElementById('abbr-container').innerHTML = html;
    
    for(let i=1; i<=10; i++) {
        document.getElementById(`abbr_k_${i}`).value = appData.abbrs?.[`abbr_k_${i}`] || "";
        document.getElementById(`abbr_v_${i}`).value = appData.abbrs?.[`abbr_v_${i}`] || "";
    }
}

function saveAbbrData() {
    appData.abbrs = appData.abbrs || {};
    for(let i=1; i<=10; i++) {
        appData.abbrs[`abbr_k_${i}`] = document.getElementById(`abbr_k_${i}`).value.trim();
        appData.abbrs[`abbr_v_${i}`] = document.getElementById(`abbr_v_${i}`).value.trim();
    }
    saveGlobalData();
}

document.addEventListener('mousemove', (e) => {
    const tooltip = document.getElementById('abbr-tooltip');
    if (e.target && e.target.classList.contains('t-name')) {
        const text = e.target.value;
        if (!text) { tooltip.style.display = 'none'; return; }
        
        let foundAbbrs = [];
        for(let i=1; i<=10; i++) {
            const k = appData.abbrs?.[`abbr_k_${i}`];
            const v = appData.abbrs?.[`abbr_v_${i}`];
            if(k && v) {
                const regex = new RegExp(`\\b${k}\\b`, 'i');
                if (regex.test(text)) foundAbbrs.push(`<b>${k}</b>: ${v}`);
            }
        }
        
        if (foundAbbrs.length > 0) {
            tooltip.innerHTML = foundAbbrs.join('<br>');
            tooltip.style.display = 'block';
            tooltip.style.left = (e.pageX / 1.1) + 'px';
            tooltip.style.top = ((e.pageY / 1.1) + 20) + 'px';
        } else {
            tooltip.style.display = 'none';
        }
    } else {
        if (tooltip) tooltip.style.display = 'none';
    }
});

function continueInit() {
    calculateWeekIds();
    viewingWeekId = currentRealWeekId;
    
    if(!appData.weeks[viewingWeekId]) {
        appData.weeks[viewingWeekId] = { tasks: {}, habits: {}, notes: {} };
    }

    let savedName = localStorage.getItem('dashboard_username') || "Name";
    document.getElementById('greeting-text').innerText = `Hi ${savedName} !!`;

    initNotesUI();
    initAbbrUI();
    renderCalendar();
    renderHabits();
    renderDays();
    loadWeekData();
    updateAll();
    checkAndFocusToday();

    document.addEventListener('click', () => {
        document.getElementById('priority-menu').style.display = 'none';
    });
}

function checkAndFocusToday() {
    if (viewingWeekId !== currentRealWeekId) return;
    if (sessionStorage.getItem('has_seen_focus') === 'true') return;
    
    const now = new Date();
    const todayDay = now.getDay();
    const todayIdx = todayDay === 0 ? 6 : todayDay - 1;
    
    const dayDiv = document.getElementById(`task_div_${todayIdx}_0`);
    if (dayDiv) {
        const dayGridItem = dayDiv.closest('.grid-item');
        const backdrop = document.getElementById('focus-backdrop');
        dayGridItem.classList.add('focused-day-card');
        backdrop.style.display = 'block';
        sessionStorage.setItem('has_seen_focus', 'true');
    }
}

function closeFocus() {
    document.getElementById('focus-backdrop').style.display = 'none';
    const focusedEl = document.querySelector('.focused-day-card');
    if (focusedEl) {
        focusedEl.classList.remove('focused-day-card');
    }
}

function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
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
    const now = new Date();
    const thisMonday = getMonday(now);
    currentRealWeekId = formatDateKey(thisMonday);
}

function generateWeekDates(mondayStr) {
    weekDates = [];
    const parts = mondayStr.split('-');
    const monday = new Date(parts[0], parts[1] - 1, parts[2]);
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear().toString().slice(-2);
        weekDates.push(`${d}/${m}/${y}`);
    }
}

function toggleWeekView() {
    saveData(); 
    isViewingNextWeek = !isViewingNextWeek;
    
    const btn = document.getElementById('nav-btn-schedule');
    const title = document.getElementById('board-title');
    
    const parts = currentRealWeekId.split('-');
    const thisMonday = new Date(parts[0], parts[1] - 1, parts[2]);
    
    if (isViewingNextWeek) {
        const nextMonday = new Date(thisMonday);
        nextMonday.setDate(thisMonday.getDate() + 7);
        viewingWeekId = formatDateKey(nextMonday);
        btn.classList.add('active-btn'); btn.innerText = "⬅ Back to Current"; title.innerText = "NEXT WEEK PLAN";
    } else {
        viewingWeekId = currentRealWeekId;
        btn.classList.remove('active-btn'); btn.innerText = "📅 Plan Next Week"; title.innerText = "CURRENT WEEK";
    }
    
    if(!appData.weeks[viewingWeekId]) { appData.weeks[viewingWeekId] = { tasks: {}, habits: {}, notes: {} }; }
    
    generateWeekDates(viewingWeekId);
    rebuildUI();
}

function rebuildUI() {
    renderCalendar();
    document.getElementById('main-grid').querySelectorAll('.grid-item:nth-child(n+3)').forEach(e => e.remove());
    renderDays();
    loadWeekData();
    updateAll();
}

function renderCalendar() {
    const parts = viewingWeekId.split('-');
    const vDate = new Date(parts[0], parts[1] - 1, parts[2]);
    generateWeekDates(viewingWeekId);
    
    const year = vDate.getFullYear(); const month = vDate.getMonth(); const today = new Date().getDate();
    const isCurrentMonth = (new Date().getMonth() === month && new Date().getFullYear() === year);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('cal-month-year').innerText = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startDay = firstDay === 0 ? 6 : firstDay - 1;

    const calGrid = document.getElementById('cal-grid-days'); let html = '';
    for(let i=0; i<startDay; i++) { html += `<div class="cal-date"></div>`; }
    for(let i=1; i<=daysInMonth; i++) {
        if(i === today && isCurrentMonth && !isViewingNextWeek) { html += `<div class="cal-date today">${i}</div>`; } 
        else { html += `<div class="cal-date">${i}</div>`; }
    }
    calGrid.innerHTML = html;
}

function autoResizeTextarea(el) { el.style.height = '18px'; el.style.height = el.scrollHeight + 'px'; }

function renderHabits() {
    const container = document.getElementById('habit-container');
    let html = `<div class="habit-header">Habit</div>`;
    dayKeys.forEach(d => html += `<div class="habit-header">${d}</div>`);
    
    for(let h = 0; h < habitsCount; h++) {
        html += `<div class="h-name"><textarea class="habit-input" id="h_name_${h}" placeholder="..." oninput="autoResizeTextarea(this); saveData()" rows="1"></textarea></div>`;
        for(let d = 0; d < 7; d++) { html += `<div><input type="checkbox" id="h_check_${h}_${d}" onchange="saveData()"></div>`; }
    }
    container.innerHTML = html;
}

function formatTimeInput(el) {
    let val = el.value.trim().replace(/\D/g, '');
    if (val.length === 1) val = '0' + val;
    el.value = val;
}

function focusTimeInput(d, t, idx) {
    const types = ['h_start', 'm_start', 'h_end', 'm_end'];
    const el = document.getElementById(`t_${types[idx]}_${d}_${t}`);
    if (el) {
        el.focus();
        el.select();
    }
}

function handleTimeNavigation(e, dIdx, tIdx, currentIdx) {
    const keysRight = ['ArrowRight', 'd', 'D'];
    const keysLeft = ['ArrowLeft', 'a', 'A'];
    
    if (keysRight.includes(e.key)) {
        e.preventDefault();
        let nextIdx = currentIdx + 1;
        if (nextIdx <= 3) focusTimeInput(dIdx, tIdx, nextIdx);
    } else if (keysLeft.includes(e.key)) {
        e.preventDefault();
        let prevIdx = currentIdx - 1;
        if (prevIdx >= 0) focusTimeInput(dIdx, tIdx, prevIdx);
    }
}

function renderDays() {
    const mainContainer = document.getElementById('main-grid');
    let allDaysHtml = '';
    
    daysData.forEach((dayObj, dIdx) => {
        let tasksHtml = '';
        for(let t = 0; t < tasksPerDay; t++) {
            tasksHtml += `
                <div class="task-item" id="task_div_${dIdx}_${t}" data-priority="3" data-delay="0" 
                     ondrop="dropOnTaskItem(event, ${dIdx}, ${t})" ondragover="dragOverTask(event)">
                    <div class="task-drag-zone" draggable="true" ondragstart="dragStartTask(event, ${dIdx}, ${t})" title="Drag to move">
                        <div class="task-star-icon">⭐</div>
                        <input type="checkbox" id="t_check_${dIdx}_${t}" onchange="updateDayAndSave(${dIdx})" oncontextmenu="showContextMenu(event, ${dIdx}, ${t})">
                    </div>
                    <div class="task-input-container">
                        <input type="text" id="t_name_${dIdx}_${t}" class="t-name" placeholder="" onchange="updateDayAndSave(${dIdx})">
                        <div class="time-input-wrapper">
                            <input type="text" id="t_h_start_${dIdx}_${t}" class="t-time-part" maxlength="2" placeholder="--" onchange="formatTimeInput(this); updateDayAndSave(${dIdx})" onkeydown="handleTimeNavigation(event, ${dIdx}, ${t}, 0)">
                            <span class="time-colon">:</span>
                            <input type="text" id="t_m_start_${dIdx}_${t}" class="t-time-part" maxlength="2" placeholder="--" onchange="formatTimeInput(this); updateDayAndSave(${dIdx})" onkeydown="handleTimeNavigation(event, ${dIdx}, ${t}, 1)">
                            <span class="time-separator">-</span>
                            <input type="text" id="t_h_end_${dIdx}_${t}" class="t-time-part" maxlength="2" placeholder="--" onchange="formatTimeInput(this); updateDayAndSave(${dIdx})" onkeydown="handleTimeNavigation(event, ${dIdx}, ${t}, 2)">
                            <span class="time-colon">:</span>
                            <input type="text" id="t_m_end_${dIdx}_${t}" class="t-time-part" maxlength="2" placeholder="--" onchange="formatTimeInput(this); updateDayAndSave(${dIdx})" onkeydown="handleTimeNavigation(event, ${dIdx}, ${t}, 3)">
                        </div>
                    </div>
                    <span class="delay-badge" id="delay_badge_${dIdx}_${t}" style="display:none;" title=""></span>
                </div>
            `;
        }

        allDaysHtml += `
            <div class="grid-item">
                <div class="day-header" id="day_header_${dIdx}" style="background-color: ${dayObj.bg};"></div>
                <div class="day-content">
                    <div class="chart-section">
                        <div class="daily-donut">
                            <svg width="70" height="70" viewBox="0 0 70 70">
                                <circle class="circle-bg" cx="35" cy="35" r="28"></circle>
                                <circle id="circle_${dIdx}" class="circle-progress" cx="35" cy="35" r="28" style="stroke: ${dayObj.stroke};"></circle>
                            </svg>
                            <div class="percent-text" id="pct_${dIdx}">0%</div>
                        </div>
                    </div>
                    <div class="stats-row">
                        <div>Completed<br><span id="done_${dIdx}">0</span></div>
                        <div>In Progress<br><span id="prog_${dIdx}">0</span></div>
                        <div>Total<br><span id="total_${dIdx}">0</span></div>
                    </div>
                    <div class="task-list" id="task_list_${dIdx}" ondragover="dragOverTask(event)" ondrop="dropTask(event, ${dIdx})">
                        ${tasksHtml}
                    </div>
                    <div class="day-progress-bar-container">
                        <div class="day-progress-bar" id="day_prog_bar_${dIdx}"></div>
                    </div>
                </div>
            </div>
        `;
    });
    mainContainer.insertAdjacentHTML('beforeend', allDaysHtml);
}

function dragStartTask(e, dIdx, tIdx) {
    if (document.getElementById(`t_name_${dIdx}_${tIdx}`).value.trim() === "") { e.preventDefault(); return; }
    draggedTaskInfo = { dIdx, tIdx };
    e.dataTransfer.effectAllowed = "move";
}

function dragOverTask(e) { e.preventDefault(); }

function dropTask(e, targetDayIdx) {
    e.preventDefault();
    if (!draggedTaskInfo) return;
    const sourceDay = draggedTaskInfo.dIdx; const sourceTask = draggedTaskInfo.tIdx;
    if (sourceDay === targetDayIdx) { draggedTaskInfo = null; return; }

    const sInp = document.getElementById(`t_name_${sourceDay}_${sourceTask}`);
    const sHStart = document.getElementById(`t_h_start_${sourceDay}_${sourceTask}`);
    const sMStart = document.getElementById(`t_m_start_${sourceDay}_${sourceTask}`);
    const sHEnd = document.getElementById(`t_h_end_${sourceDay}_${sourceTask}`);
    const sMEnd = document.getElementById(`t_m_end_${sourceDay}_${sourceTask}`);
    const sCb = document.getElementById(`t_check_${sourceDay}_${sourceTask}`);
    const sDiv = document.getElementById(`task_div_${sourceDay}_${sourceTask}`);
    const priority = sDiv.getAttribute('data-priority');
    const delay = sDiv.getAttribute('data-delay');

    let emptyTargetTaskIdx = -1;
    for (let t = 0; t < tasksPerDay; t++) {
        if (document.getElementById(`t_name_${targetDayIdx}_${t}`).value.trim() === "") { emptyTargetTaskIdx = t; break; }
    }

    if (emptyTargetTaskIdx !== -1) {
        document.getElementById(`t_name_${targetDayIdx}_${emptyTargetTaskIdx}`).value = sInp.value;
        document.getElementById(`t_h_start_${targetDayIdx}_${emptyTargetTaskIdx}`).value = sHStart.value;
        document.getElementById(`t_m_start_${targetDayIdx}_${emptyTargetTaskIdx}`).value = sMStart.value;
        document.getElementById(`t_h_end_${targetDayIdx}_${emptyTargetTaskIdx}`).value = sHEnd.value;
        document.getElementById(`t_m_end_${targetDayIdx}_${emptyTargetTaskIdx}`).value = sMEnd.value;
        document.getElementById(`t_check_${targetDayIdx}_${emptyTargetTaskIdx}`).checked = sCb.checked;
        document.getElementById(`task_div_${targetDayIdx}_${emptyTargetTaskIdx}`).setAttribute('data-priority', priority);
        document.getElementById(`task_div_${targetDayIdx}_${emptyTargetTaskIdx}`).setAttribute('data-delay', delay);

        sInp.value = ""; sHStart.value = ""; sMStart.value = ""; sHEnd.value = ""; sMEnd.value = ""; 
        sCb.checked = false; sDiv.setAttribute('data-priority', "3"); sDiv.setAttribute('data-delay', "0");

        saveData(); updateDay(sourceDay); updateDay(targetDayIdx); updateWeeklySummary(); drawWaveChart();
        sortTasks(targetDayIdx); sortTasks(sourceDay);
    } else { alert("Day is full. Cannot drag more tasks!"); }
    draggedTaskInfo = null;
}

function dropOnTaskItem(e, targetDayIdx, targetTaskIdx) {
    e.stopPropagation(); 
    e.preventDefault();
    if (!draggedTaskInfo) return;

    const sDay = draggedTaskInfo.dIdx;
    const sTask = draggedTaskInfo.tIdx;
    if (sDay === targetDayIdx && sTask === targetTaskIdx) { draggedTaskInfo = null; return; }

    const sDiv = document.getElementById(`task_div_${sDay}_${sTask}`);
    const tDiv = document.getElementById(`task_div_${targetDayIdx}_${targetTaskIdx}`);

    const sPri = sDiv.getAttribute('data-priority') || "3";
    const tPri = tDiv.getAttribute('data-priority') || "3";

    if (sPri === tPri) {
        const sInp = document.getElementById(`t_name_${sDay}_${sTask}`);
        const sHStart = document.getElementById(`t_h_start_${sDay}_${sTask}`);
        const sMStart = document.getElementById(`t_m_start_${sDay}_${sTask}`);
        const sHEnd = document.getElementById(`t_h_end_${sDay}_${sTask}`);
        const sMEnd = document.getElementById(`t_m_end_${sDay}_${sTask}`);
        const sCb = document.getElementById(`t_check_${sDay}_${sTask}`);
        const sDelay = sDiv.getAttribute('data-delay');

        const tInp = document.getElementById(`t_name_${targetDayIdx}_${targetTaskIdx}`);
        const tHStart = document.getElementById(`t_h_start_${targetDayIdx}_${targetTaskIdx}`);
        const tMStart = document.getElementById(`t_m_start_${targetDayIdx}_${targetTaskIdx}`);
        const tHEnd = document.getElementById(`t_h_end_${targetDayIdx}_${targetTaskIdx}`);
        const tMEnd = document.getElementById(`t_m_end_${targetDayIdx}_${targetTaskIdx}`);
        const tCb = document.getElementById(`t_check_${targetDayIdx}_${targetTaskIdx}`);
        const tDelay = tDiv.getAttribute('data-delay');

        const tempText = tInp.value;
        const tempHStart = tHStart.value;
        const tempMStart = tMStart.value;
        const tempHEnd = tHEnd.value;
        const tempMEnd = tMEnd.value;
        const tempCb = tCb.checked;
        const tempDelay = tDelay;

        tInp.value = sInp.value;
        tHStart.value = sHStart.value;
        tMStart.value = sMStart.value;
        tHEnd.value = sHEnd.value;
        tMEnd.value = sMEnd.value;
        tCb.checked = sCb.checked;
        tDiv.setAttribute('data-delay', sDelay);

        sInp.value = tempText;
        sHStart.value = tempHStart;
        sMStart.value = tempMStart;
        sHEnd.value = tempHEnd;
        sMEnd.value = tempMEnd;
        sCb.checked = tempCb;
        sDiv.setAttribute('data-delay', tempDelay);

        saveData(); updateDay(sDay); updateDay(targetDayIdx); updateWeeklySummary(); drawWaveChart();
        sortTasks(targetDayIdx); 
        if(sDay !== targetDayIdx) sortTasks(sDay);
        
        draggedTaskInfo = null;
    } else {
        dropTask(e, targetDayIdx);
    }
}

function showContextMenu(e, dIdx, tIdx) {
    e.preventDefault();
    const menu = document.getElementById('priority-menu');
    menu.style.display = 'block'; menu.style.left = (e.pageX / 1.1) + 'px'; menu.style.top = (e.pageY / 1.1) + 'px';
    currentRightClickDay = dIdx; currentRightClickTask = tIdx;
}

function setPriority(level) {
    if(currentRightClickDay !== null && currentRightClickTask !== null) {
        document.getElementById(`task_div_${currentRightClickDay}_${currentRightClickTask}`).setAttribute('data-priority', level);
        sortTasks(currentRightClickDay); saveData();
    }
}

function sortTasks(dIdx) {
    const list = document.getElementById(`task_list_${dIdx}`);
    const items = Array.from(list.querySelectorAll('.task-item'));
    items.sort((a, b) => {
        let pa = a.getAttribute('data-priority'); let pb = b.getAttribute('data-priority');
        let wa = pa === 'star' ? -1 : parseInt(pa || 3); let wb = pb === 'star' ? -1 : parseInt(pb || 3);
        return wa - wb;
    });
    items.forEach(item => list.appendChild(item));
}

function updateWeeklySummary() {
    let weekCompleted = 0; let weekInProgress = 0;
    
    for(let d = 0; d < 7; d++) {
        for(let t = 0; t < tasksPerDay; t++) {
            const cb = document.getElementById(`t_check_${d}_${t}`);
            const input = document.getElementById(`t_name_${d}_${t}`);
            if (input && input.value.trim() !== "") {
                if (cb && cb.checked) { weekCompleted++; } else { weekInProgress++; }
            }
        }
    }
    
    document.getElementById('weekly-completed').innerText = weekCompleted;
    document.getElementById('weekly-progress').innerText = weekInProgress;
}

function updateDayAndSave(dIdx) { saveData(); updateDay(dIdx); updateWeeklySummary(); drawWaveChart(); }

function updateDay(dIdx) {
    let done = 0; let totalActive = 0;
    
    const now = new Date();
    const todayDay = now.getDay();
    const todayIdx = todayDay === 0 ? 6 : todayDay - 1;
    const isPast = (!isViewingNextWeek && dIdx < todayIdx);
    
    for(let t = 0; t < tasksPerDay; t++) {
        const cb = document.getElementById(`t_check_${dIdx}_${t}`);
        const input = document.getElementById(`t_name_${dIdx}_${t}`);
        const div = document.getElementById(`task_div_${dIdx}_${t}`);
        const badge = document.getElementById(`delay_badge_${dIdx}_${t}`);
        const hasText = input.value.trim() !== "";
        const delay = parseInt(div.getAttribute('data-delay')) || 0;

        if (!hasText && cb.checked) cb.checked = false;
        if (hasText) { totalActive++; if (cb.checked) done++; }
        if (cb.checked) div.classList.add('checked'); else div.classList.remove('checked');

        if (delay > 0 && !cb.checked && hasText) {
            if (delay > 3) {
                badge.innerHTML = `⚠️ Evaluate`; badge.className = 'delay-badge delay-warning'; badge.title = "Task delayed > 3 days. Evaluate priority or cancel.";
            } else {
                const circled = ["", "❶", "❷", "❸"];
                badge.innerHTML = circled[delay] || `+${delay}`; badge.className = 'delay-badge'; badge.title = "";
            }
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    const percent = totalActive === 0 ? 0 : Math.round((done / totalActive) * 100);
    dailyPercents[dIdx] = percent; dailyStats[dIdx] = { done, total: totalActive };
    
    let headerHtml = `${daysData[dIdx].name} (${weekDates[dIdx]})`;
    if (isPast && done < totalActive && totalActive > 0 && activeModalCount === 0) {
        headerHtml += `<span style="position: absolute; top: -16px; right: -5px; z-index: 9999; color: #D32F2F; font-size: 64px; font-weight: 900; transform: rotate(15deg); line-height: 1; font-family: 'Comic Sans MS', cursive; text-shadow: 2px 2px 0px rgba(255,255,255,0.8);">!!</span>`;
    }
    document.getElementById(`day_header_${dIdx}`).innerHTML = headerHtml;

    document.getElementById(`pct_${dIdx}`).innerText = percent + '%';
    document.getElementById(`done_${dIdx}`).innerText = done;
    document.getElementById(`prog_${dIdx}`).innerText = (totalActive - done);
    document.getElementById(`total_${dIdx}`).innerText = totalActive; 

    const gridItem = document.getElementById(`task_div_${dIdx}_0`).closest('.grid-item');
    if (totalActive > 0 && done === totalActive) { gridItem.classList.add('daily-victory'); } 
    else { gridItem.classList.remove('daily-victory'); }

    const circle = document.getElementById(`circle_${dIdx}`);
    const circumference = 2 * Math.PI * 28;
    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = circumference - (circumference * percent / 100);

    const progBar = document.getElementById(`day_prog_bar_${dIdx}`);
    progBar.style.width = percent + '%';
    if(percent >= 100) progBar.style.backgroundColor = `var(--success-green)`;
    else progBar.style.backgroundColor = `hsl(122, ${percent}%, ${75 - (percent * 0.35)}%)`;
}

function updateAll() { for(let d = 0; d < 7; d++) updateDay(d); updateWeeklySummary(); drawWaveChart(); }

function showTooltip(e, dayIndex) {
    const t = document.getElementById('chart-tooltip');
    t.innerHTML = `${dailyStats[dayIndex].done}/${dailyStats[dayIndex].total} tasks completed`;
    t.style.display = 'block'; t.style.left = (e.pageX / 1.1) + 'px'; t.style.top = ((e.pageY / 1.1) - 15) + 'px';
}
function hideTooltip() { document.getElementById('chart-tooltip').style.display = 'none'; }

function drawWaveChart() {
    const width = 1000; const height = 90; const paddingX = 40; const gap = (width - paddingX * 2) / 6;
    let points = []; let pointElements = '';
    dailyPercents.forEach((pct, i) => {
        const x = paddingX + i * gap; const y = height - 15 - (pct * 0.5); points.push({x, y});
        pointElements += `<circle cx="${x}" cy="${y}" r="4.5" onmousemove="showTooltip(event, ${i})" onmouseleave="hideTooltip()"></circle>`;
    });

    const p = points; let pathDataCurve = 'M ' + p[0].x + ',' + p[0].y; let pathDataPoly = 'M 0,' + height + ' L ' + p[0].x + ',' + p[0].y;
    for (let i = 1; i < p.length; i++) {
        const k = 0.15;
        let v1 = {x: p[1].x - p[0].x, y: p[1].y - p[0].y};
        if (i > 1) v1 = {x: p[i].x - p[i-2].x, y: p[i].y - p[i-2].y};
        let c1 = {x: p[i-1].x + v1.x * k, y: p[i-1].y + v1.y * k};
        let v2 = {x: p[i].x - p[i-1].x, y: p[i].x - p[i-1].x};
        if (i < p.length - 1) v2 = {x: p[i+1].x - p[i-1].x, y: p[i+1].y - p[i-1].y};
        let c2 = {x: p[i].x - v2.x * k, y: p[i].y - v2.y * k};

        pathDataCurve += ` C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p[i].x},${p[i].y}`;
        pathDataPoly += ` C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p[i].x},${p[i].y}`;
    }
    pathDataPoly += ' L ' + width + ',' + height + ' Z';
    document.getElementById('wave-path').setAttribute('d', pathDataCurve);
    document.getElementById('wave-polygon').setAttribute('d', pathDataPoly);
    document.getElementById('wave-points').innerHTML = pointElements;
}

function saveData() {
    const wData = { tasks: {}, habits: {}, notes: {} };
    for(let d = 0; d < 7; d++) {
        for(let t = 0; t < tasksPerDay; t++) {
            wData.tasks[`t_name_${d}_${t}`] = document.getElementById(`t_name_${d}_${t}`).value;
            wData.tasks[`t_h_start_${d}_${t}`] = document.getElementById(`t_h_start_${d}_${t}`).value;
            wData.tasks[`t_m_start_${d}_${t}`] = document.getElementById(`t_m_start_${d}_${t}`).value;
            wData.tasks[`t_h_end_${d}_${t}`] = document.getElementById(`t_h_end_${d}_${t}`).value;
            wData.tasks[`t_m_end_${d}_${t}`] = document.getElementById(`t_m_end_${d}_${t}`).value;
            wData.tasks[`t_check_${d}_${t}`] = document.getElementById(`t_check_${d}_${t}`).checked;
            wData.tasks[`t_pri_${d}_${t}`] = document.getElementById(`task_div_${d}_${t}`).getAttribute('data-priority');
            wData.tasks[`t_delay_${d}_${t}`] = document.getElementById(`task_div_${d}_${t}`).getAttribute('data-delay');
        }
    }
    for(let h = 0; h < habitsCount; h++) {
        wData.habits[`h_name_${h}`] = document.getElementById(`h_name_${h}`).value;
        for(let d = 0; d < 7; d++) { wData.habits[`h_check_${h}_${d}`] = document.getElementById(`h_check_${h}_${d}`).checked; }
    }
    for(let i=1; i<=10; i++) {
        const el = document.getElementById(`note_input_${i}`);
        if(el) wData.notes[`note_${i}`] = el.value;
    }
    
    appData.weeks[viewingWeekId] = wData;
    saveGlobalData();
}

function loadWeekData() {
    const wData = appData.weeks[viewingWeekId] || {tasks:{}, habits:{}, notes:{}};
    for(let d = 0; d < 7; d++) {
        for(let t = 0; t < tasksPerDay; t++) {
            document.getElementById(`t_name_${d}_${t}`).value = wData.tasks[`t_name_${d}_${t}`] || "";
            document.getElementById(`t_h_start_${d}_${t}`).value = wData.tasks[`t_h_start_${d}_${t}`] || "";
            document.getElementById(`t_m_start_${d}_${t}`).value = wData.tasks[`t_m_start_${d}_${t}`] || "";
            document.getElementById(`t_h_end_${d}_${t}`).value = wData.tasks[`t_h_end_${d}_${t}`] || "";
            document.getElementById(`t_m_end_${d}_${t}`).value = wData.tasks[`t_m_end_${d}_${t}`] || "";
            document.getElementById(`t_check_${d}_${t}`).checked = wData.tasks[`t_check_${d}_${t}`] || false;
            document.getElementById(`task_div_${d}_${t}`).setAttribute('data-priority', wData.tasks[`t_pri_${d}_${t}`] || "3");
            document.getElementById(`task_div_${d}_${t}`).setAttribute('data-delay', wData.tasks[`t_delay_${d}_${t}`] || "0");
        }
        sortTasks(d);
    }
    for(let h = 0; h < habitsCount; h++) {
        const hName = document.getElementById(`h_name_${h}`);
        hName.value = wData.habits[`h_name_${h}`] || "";
        autoResizeTextarea(hName);
        for(let d = 0; d < 7; d++) { document.getElementById(`h_check_${h}_${d}`).checked = wData.habits[`h_check_${h}_${d}`] || false; }
    }
    for(let i=1; i<=10; i++) {
        const el = document.getElementById(`note_input_${i}`);
        if(el) el.value = wData.notes?.[`note_${i}`] || "";
    }
}

function openNoteModal() { activeModalCount++; document.getElementById('note-modal').style.display = 'flex'; }
function closeNoteModal() { activeModalCount = Math.max(0, activeModalCount - 1); document.getElementById('note-modal').style.display = 'none'; }

function openAbbrModal() { activeModalCount++; document.getElementById('abbr-modal').style.display = 'flex'; }
function closeAbbrModal() { activeModalCount = Math.max(0, activeModalCount - 1); document.getElementById('abbr-modal').style.display = 'none'; }

function openMonthlyModal() { activeModalCount++; document.getElementById('monthly-modal').style.display = 'flex'; loadMonthlyData(); }
function closeMonthlyModal() { activeModalCount = Math.max(0, activeModalCount - 1); document.getElementById('monthly-modal').style.display = 'none'; }

function getMonthWeeks() {
    const sortedIds = Object.keys(appData.weeks).sort((a,b) => new Date(a) - new Date(b));
    return sortedIds.slice(-4);
}

function loadMonthlyData() {
    const mData = appData.monthly || {};
    for(let i=1; i<=3; i++) {
        document.getElementById(`mg-${i}`).value = mData[`mg_${i}`] || "";
        document.getElementById(`gr-name-${i}`).value = mData[`gr_name_${i}`] || "";
        document.getElementById(`gr-target-${i}`).value = mData[`gr_target_${i}`] || "";
        document.getElementById(`gr-actual-${i}`).value = mData[`gr_actual_${i}`] || "";
        document.getElementById(`gr-status-${i}`).value = mData[`gr_status_${i}`] || "Pending";
        updateRowStatus(i);
    }
    
    const wIds = getMonthWeeks();
    const colsContainer = document.getElementById('modal-weekly-cols');
    colsContainer.innerHTML = '';
    
    let dailyTaskPcts = [];
    
    for(let i=0; i<4; i++) {
        let wId = wIds[i]; let taskPct = 0; let habPct = 0;
        if(wId && appData.weeks[wId]) {
            const wd = appData.weeks[wId];
            let tDoneTotal=0, tTotalCount=0, hDone=0, hTotal=0;
            for(let d=0; d<7; d++) {
                let dayDone=0, dayTotal=0;
                for(let t=0; t<10; t++) {
                    if(wd.tasks[`t_name_${d}_${t}`]) {
                        dayTotal++; tTotalCount++;
                        if(wd.tasks[`t_check_${d}_${t}`]) { dayDone++; tDoneTotal++; }
                    }
                }
                dailyTaskPcts.push(dayTotal > 0 ? (dayDone/dayTotal)*100 : 0);
            }
            if(tTotalCount>0) taskPct = Math.round((tDoneTotal/tTotalCount)*100);
            for(let h=0; h<5; h++) {
                if(wd.habits[`h_name_${h}`]) {
                    for(let d=0; d<7; d++) { hTotal++; if(wd.habits[`h_check_${h}_${d}`]) hDone++; }
                }
            }
            if(hTotal>0) habPct = Math.round((hDone/hTotal)*100);
        } else {
            for(let d=0; d<7; d++) dailyTaskPcts.push(0);
        }
        
        colsContainer.innerHTML += `
            <div class="week-card">
                <h4>Week ${i+1}${wId ? `<br><span style="font-size:10px; font-weight:600; color:#aaa; text-transform:none;">${wId}</span>` : ''}</h4>
                <div class="week-card-stats">
                    <div>
                        <div style="font-size:18px; font-weight:800; color:var(--text-main);">${taskPct}%</div>
                        <div style="font-size:10px; color:#888;">Tasks</div>
                    </div>
                    <div>
                        <div style="font-size:14px; font-weight:800; color:var(--border-darker);">${habPct}%</div>
                        <div style="font-size:10px; color:#888;">Habits</div>
                    </div>
                </div>
                <button class="nav-btn detail-btn" ${wId ? `onclick="switchToWeek('${wId}')"` : 'disabled'}>Detail</button>
            </div>
        `;
    }
    
    let barHtml = `<svg viewBox="0 -10 750 180" style="width:100%; height:100%; overflow:visible;">`;
    barHtml += `<line x1="40" y1="10" x2="740" y2="10" stroke="rgba(139, 94, 60, 0.2)" stroke-dasharray="4" stroke-width="1"></line>`;
    barHtml += `<line x1="40" y1="80" x2="740" y2="80" stroke="rgba(139, 94, 60, 0.2)" stroke-dasharray="4" stroke-width="1"></line>`;
    barHtml += `<line x1="40" y1="150" x2="740" y2="150" stroke="rgba(139, 94, 60, 0.5)" stroke-width="1"></line>`;
    
    barHtml += `<text x="30" y="14" text-anchor="end" font-size="10" fill="var(--border-darker)" font-weight="600">100%</text>`;
    barHtml += `<text x="30" y="84" text-anchor="end" font-size="10" fill="var(--border-darker)" font-weight="600">50%</text>`;
    barHtml += `<text x="30" y="154" text-anchor="end" font-size="10" fill="var(--border-darker)" font-weight="600">0%</text>`;

    if (dailyTaskPcts.length > 0) {
        let chartWidth = 700;
        let startX = 40;
        let barWidth = (chartWidth / dailyTaskPcts.length) - 4;
        
        dailyTaskPcts.forEach((pct, i) => {
            let h = (pct / 100) * 140; 
            let x = startX + i * (chartWidth / dailyTaskPcts.length) + 2;
            let y = 150 - h;
            barHtml += `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="var(--border-color)" rx="2"></rect>`;
        });

        let weekWidth = chartWidth / 4;
        for(let w=0; w<4; w++) {
            let wx = startX + (w * weekWidth) + (weekWidth / 2);
            barHtml += `<text x="${wx}" y="170" text-anchor="middle" font-size="11" fill="var(--border-darker)" font-weight="700">Week ${w+1}</text>`;
            if (w > 0) {
                let divX = startX + (w * weekWidth);
                barHtml += `<line x1="${divX}" y1="10" x2="${divX}" y2="155" stroke="rgba(139, 94, 60, 0.2)" stroke-width="1"></line>`;
            }
        }
    }
    barHtml += `</svg>`;
    document.getElementById('monthly-bar-chart').innerHTML = barHtml;

    let habitStats = [];
    for(let h=0; h<5; h++) {
        let totalDones = 0;
        let hName = "";
        for(let i=0; i<4; i++) {
            let wId = wIds[i];
            if(wId && appData.weeks[wId] && appData.weeks[wId].habits[`h_name_${h}`]) {
                hName = appData.weeks[wId].habits[`h_name_${h}`];
                for(let d=0; d<7; d++) {
                    if(appData.weeks[wId].habits[`h_check_${h}_${d}`]) totalDones++;
                }
            }
        }
        if(hName && totalDones > 0) habitStats.push({ name: hName, count: totalDones });
    }

    let totalHabitDones = habitStats.reduce((sum, h) => sum + h.count, 0);
    let pieHtml = `<svg viewBox="-110 -110 220 220" style="width:100%; height:100%; overflow:visible;">`;
    if(totalHabitDones === 0) {
        pieHtml += `<text x="0" y="0" text-anchor="middle" fill="#888" font-size="12">No Data</text>`;
    } else {
        let startAngle = 0;
        const colors = ['#E6C655', '#90B496', '#86A8BC', '#E3A77A', '#FA8C28'];
        habitStats.forEach((h, i) => {
            let pct = h.count / totalHabitDones;
            let angle = pct * 2 * Math.PI;
            let endAngle = startAngle + angle;
            
            let x1 = Math.cos(startAngle) * 60; let y1 = Math.sin(startAngle) * 60;
            let x2 = Math.cos(endAngle) * 60; let y2 = Math.sin(endAngle) * 60;
            let largeArc = pct > 0.5 ? 1 : 0;
            
            let pathData = `M 0 0 L ${x1} ${y1} A 60 60 0 ${largeArc} 1 ${x2} ${y2} Z`;
            if (pct === 1) { pathData = `M 60 0 A 60 60 0 1 1 -60 0 A 60 60 0 1 1 60 0`; }
            
            pieHtml += `<path d="${pathData}" fill="${colors[i % colors.length]}" stroke="#fff" stroke-width="1"></path>`;
            
            let midAngle = startAngle + angle / 2;
            let lineX1 = Math.cos(midAngle) * 60; let lineY1 = Math.sin(midAngle) * 60;
            let lineX2 = Math.cos(midAngle) * 75; let lineY2 = Math.sin(midAngle) * 75;
            let textX = Math.cos(midAngle) * 80; let textY = Math.sin(midAngle) * 80;
            let textAnchor = Math.cos(midAngle) > 0 ? "start" : "end";
            
            pieHtml += `<polyline points="${lineX1},${lineY1} ${lineX2},${lineY2}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="1.5"></polyline>`;
            pieHtml += `<text x="${textX}" y="${textY}" text-anchor="${textAnchor}" alignment-baseline="middle" font-size="10" font-weight="700" fill="var(--text-main)">${h.name} (${Math.round(pct*100)}%)</text>`;
            
            startAngle = endAngle;
        });
    }
    pieHtml += `</svg>`;
    document.getElementById('monthly-pie-chart').innerHTML = pieHtml;
}

function saveMonthly() {
    appData.monthly = appData.monthly || {};
    for(let i=1; i<=3; i++) {
        appData.monthly[`mg_${i}`] = document.getElementById(`mg-${i}`).value;
        appData.monthly[`gr_name_${i}`] = document.getElementById(`gr-name-${i}`).value;
        appData.monthly[`gr_target_${i}`] = document.getElementById(`gr-target-${i}`).value;
        appData.monthly[`gr_actual_${i}`] = document.getElementById(`gr-actual-${i}`).value;
        appData.monthly[`gr_status_${i}`] = document.getElementById(`gr-status-${i}`).value;
    }
    saveGlobalData();
}

function updateRowStatus(id) {
    const row = document.getElementById(`gr-row-${id}`);
    const select = document.getElementById(`gr-status-${id}`);
    row.classList.remove('status-achieved', 'status-pending');
    if(select.value === 'Achieved') row.classList.add('status-achieved');
    else if (select.value === 'Pending') row.classList.add('status-pending');
}

function switchToWeek(targetWeekId) {
    saveData();
    viewingWeekId = targetWeekId;

    const parts = currentRealWeekId.split('-');
    const thisMonday = new Date(parts[0], parts[1] - 1, parts[2]);
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);
    const nextWeekId = formatDateKey(nextMonday);

    isViewingNextWeek = (targetWeekId === nextWeekId);

    const btn = document.getElementById('nav-btn-schedule');
    const title = document.getElementById('board-title');
    if (isViewingNextWeek) {
        btn.classList.add('active-btn'); btn.innerText = "⬅ Back to Current"; title.innerText = "NEXT WEEK PLAN";
    } else if (targetWeekId === currentRealWeekId) {
        btn.classList.remove('active-btn'); btn.innerText = "📅 Plan Next Week"; title.innerText = "CURRENT WEEK";
    } else {
        btn.classList.remove('active-btn'); btn.innerText = "📅 Plan Next Week"; title.innerText = "PAST WEEK";
    }

    if (!appData.weeks[viewingWeekId]) { appData.weeks[viewingWeekId] = { tasks: {}, habits: {}, notes: {} }; }

    closeMonthlyModal();
    generateWeekDates(viewingWeekId);
    rebuildUI();
}
