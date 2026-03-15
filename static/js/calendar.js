

const CAL_STORAGE_KEY = 'shingaku-calendar';
let calState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    view: 'month',
    weekStart: null,
    selectedDate: null,
    data: {}
};


let USER_SCHEDULE = {};       // { groups: [...], schedule: { "0": [...], ... } }
let COLLEGE_EVENTS = {};
let SELECTED_GROUP = '';      // user's chosen group


async function loadAllData() {
    await Promise.all([loadCalData(), loadUserSchedule(), loadCollegeEvents(), loadUserGroup()]);
    renderCurrentView();
}

function loadCalData() {
    try {
        const stored = JSON.parse(localStorage.getItem(CAL_STORAGE_KEY));
        if (stored) calState.data = stored;
    } catch {}
    return fetchMonthData();
}

async function loadUserSchedule() {
    try {
        const res = await fetch('/api/calendar/schedule');
        const json = await res.json();
        if (json.status === 'success' && json.schedule) {
            USER_SCHEDULE = normalizeSchedule(json.schedule);
        }
    } catch {}
}

function normalizeSchedule(raw) {
    if (raw.schedule && raw.groups) return raw;
    const converted = { groups: ['ALL'], schedule: {} };
    for (const [dow, entries] of Object.entries(raw)) {
        converted.schedule[dow] = entries.map(e => ({
            time: e.time,
            slots: [{ group: 'ALL', name: e.name, type: e.type, color: e.color }]
        }));
    }
    return converted;
}

async function loadCollegeEvents() {
    try {
        const res = await fetch('/api/calendar/events');
        const json = await res.json();
        if (json.status === 'success' && json.events) {
            COLLEGE_EVENTS = json.events;
        }
    } catch {}
}

async function loadUserGroup() {
    try {
        const res = await fetch('/api/calendar/group');
        const json = await res.json();
        if (json.status === 'success') {
            SELECTED_GROUP = json.group || '';
        }
    } catch {}
}

async function fetchMonthData() {
    const monthKey = `${calState.year}-${String(calState.month + 1).padStart(2, '0')}`;
    try {
        const res = await fetch(`/api/calendar/${monthKey}`);
        const json = await res.json();
        if (json.status === 'success' && json.data) {
            Object.assign(calState.data, json.data);
            localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(calState.data));
        }
    } catch {}
}

function saveCalData() {
    localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(calState.data));
    if (calState.selectedDate) {
        const dayData = calState.data[calState.selectedDate];
        if (dayData) {
            fetch(`/api/calendar/day/${calState.selectedDate}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dayData)
            }).catch(() => {});
        }
    }
}

function getDayData(dk) {
    if (!calState.data[dk]) calState.data[dk] = { todos: [], attendance: {} };
    return calState.data[dk];
}


function dateKey(y, m, d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function dateKeyFromDate(dt) { return dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
function todayKey() { const t = new Date(); return dateKey(t.getFullYear(), t.getMonth(), t.getDate()); }
function getMonthName(m) { return ['January','February','March','April','May','June','July','August','September','October','November','December'][m]; }
function getDayName(d) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]; }
function getFullDayName(d) { return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d]; }

function getScheduleForDate(dk) {
    const sched = USER_SCHEDULE.schedule || {};
    const d = new Date(dk);
    const dow = String(d.getDay());
    const daySlots = sched[dow] || [];
    const result = [];
    for (const entry of daySlots) {
        for (const slot of (entry.slots || [])) {
            if (slot.group === 'ALL' || !SELECTED_GROUP || slot.group === SELECTED_GROUP) {
                result.push({ time: entry.time, name: slot.name, type: slot.type, color: slot.color, group: slot.group });
            }
        }
    }
    return result;
}

function getEventsForDate(dk) {
    return COLLEGE_EVENTS[dk] || [];
}

function formatDateLong(dk) {
    const d = new Date(dk);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }


function attVal(v) {
    if (v === true || v === 'present') return 'present';
    if (v === 'cancelled') return 'cancelled';
    return 'absent'; // false, undefined, 'absent'
}


function renderMonthView() {
    const y = calState.year, m = calState.month;
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev = new Date(y, m, 0).getDate();

    let html = '<div class="cal-grid">';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => html += `<div class="cal-weekday-header">${d}</div>`);

    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrev - i;
        const pm = m === 0 ? 11 : m - 1, py = m === 0 ? y - 1 : y;
        html += buildMonthCell(dateKey(py, pm, day), day, true);
    }
    for (let d = 1; d <= daysInMonth; d++) html += buildMonthCell(dateKey(y, m, d), d, false);
    const total = firstDay + daysInMonth, rem = (7 - (total % 7)) % 7;
    for (let i = 1; i <= rem; i++) {
        const nm = m === 11 ? 0 : m + 1, ny = m === 11 ? y + 1 : y;
        html += buildMonthCell(dateKey(ny, nm, i), i, true);
    }
    html += '</div>';

    const el = document.getElementById('cal-month-view');
    if (el) el.innerHTML = html;
    renderMobileMonthView();
}

function buildMonthCell(dk, dayNum, isOther) {
    const tk = todayKey(), isToday = dk === tk, isSel = dk === calState.selectedDate;
    const data = calState.data[dk] || {};
    const events = getEventsForDate(dk), sched = getScheduleForDate(dk);

    let cls = 'cal-cell';
    if (isOther) cls += ' other-month';
    if (isToday) cls += ' today';
    if (isSel) cls += ' selected';

    let ind = '';
    if (events.length > 0) events.forEach(e => ind += `<div class="cal-indicator ${e.type}">${escHtml(e.label)}</div>`);
    if (data.todos && data.todos.length > 0) {
        const done = data.todos.filter(t => t.done).length;
        ind += `<div class="cal-indicator todo">${done}/${data.todos.length} tasks</div>`;
    }
    if (sched.length > 0 && !isOther) ind += `<div class="cal-indicator schedule">${sched.length} lectures</div>`;
    if (data.attendance && sched.length > 0) {
        const schedKeys = new Set(sched.map(s => s.name + '_' + s.time));
        const vals = Object.entries(data.attendance).filter(([k]) => schedKeys.has(k)).map(([,v]) => v);
        const att = vals.filter(v => attVal(v) === 'present').length;
        const canc = vals.filter(v => attVal(v) === 'cancelled').length;
        const counted = vals.length - canc;
        if (counted > 0) ind += `<div class="cal-indicator attendance">${att}/${counted} attended</div>`;
    }

    return `<div class="${cls}" onclick="openDayModal('${dk}')" data-date="${dk}">
        <div class="cal-day-num">${dayNum}${isToday ? '<span class="today-dot"></span>' : ''}</div>
        <div class="cal-indicators">${ind}</div>
    </div>`;
}


function renderMobileMonthView() {
    const y = calState.year, m = calState.month;
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev = new Date(y, m, 0).getDate();

    let html = '<div class="mob-cal-grid">';
    ['S','M','T','W','T','F','S'].forEach(d => html += `<div class="mob-cal-weekday">${d}</div>`);
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrev - i, pm = m===0?11:m-1, py = m===0?y-1:y;
        html += buildMobCell(dateKey(py,pm,day), day, true);
    }
    for (let d = 1; d <= daysInMonth; d++) html += buildMobCell(dateKey(y,m,d), d, false);
    const total = firstDay + daysInMonth, rem = (7-(total%7))%7;
    for (let i = 1; i <= rem; i++) {
        const nm = m===11?0:m+1, ny = m===11?y+1:y;
        html += buildMobCell(dateKey(ny,nm,i), i, true);
    }
    html += '</div>';
    const el = document.getElementById('mob-cal-month-view');
    if (el) el.innerHTML = html;
}

function buildMobCell(dk, dayNum, isOther) {
    const tk = todayKey(), isToday = dk === tk, isSel = dk === calState.selectedDate;
    const data = calState.data[dk] || {};
    const events = getEventsForDate(dk), sched = getScheduleForDate(dk);
    let cls = 'mob-cal-cell';
    if (isOther) cls += ' other-month';
    if (isToday) cls += ' today';
    if (isSel) cls += ' selected';
    let dots = '';
    if (data.todos && data.todos.length > 0) dots += '<div class="mob-cal-dot todo"></div>';
    if (events.length > 0) dots += '<div class="mob-cal-dot event"></div>';
    if (sched.length > 0 && !isOther) dots += '<div class="mob-cal-dot schedule"></div>';
    if (data.attendance && sched.length > 0) {
        const schedKeys = new Set(sched.map(s => s.name + '_' + s.time));
        if (Object.keys(data.attendance).some(k => schedKeys.has(k))) dots += '<div class="mob-cal-dot attendance"></div>';
    }
    return `<div class="${cls}" onclick="openDayModal('${dk}')"><div class="mob-cal-cell-num">${dayNum}</div><div class="mob-cal-dots">${dots}</div></div>`;
}


function getWeekDates() {
    if (!calState.weekStart) {
        const t = new Date(), d = t.getDay();
        calState.weekStart = new Date(t); calState.weekStart.setDate(t.getDate()-d);
    }
    const dates = [];
    for (let i = 0; i < 7; i++) { const d = new Date(calState.weekStart); d.setDate(calState.weekStart.getDate()+i); dates.push(d); }
    return dates;
}

function renderWeekView() {
    const dates = getWeekDates();
    let html = '<div class="cal-week-grid">';
    dates.forEach(d => html += `<div class="cal-weekday-header">${getDayName(d.getDay())}</div>`);
    dates.forEach(d => html += buildWeekCell(d, dateKeyFromDate(d)));
    html += '</div>';
    const el = document.getElementById('cal-week-view');
    if (el) el.innerHTML = html;

    let mob = '<div class="mob-week-container">';
    dates.forEach(d => mob += buildMobWeekCard(d, dateKeyFromDate(d)));
    mob += '</div>';
    const mel = document.getElementById('mob-cal-week-view');
    if (mel) mel.innerHTML = mob;
    lucide.createIcons();
}

function buildWeekCell(date, dk) {
    const isToday = dk === todayKey();
    const data = calState.data[dk] || {}, events = getEventsForDate(dk), sched = getScheduleForDate(dk);
    let cls = 'cal-week-cell'; if (isToday) cls += ' today';

    let c = `<div class="cal-week-header"><div class="cal-week-day-name">${getDayName(date.getDay())}</div><div class="cal-week-day-num">${date.getDate()}</div></div>`;

    if (events.length > 0) {
        c += '<div class="cal-week-section"><div class="cal-week-section-title events">Events</div>';
        events.forEach(e => c += `<div class="cal-indicator ${e.type}" style="margin-bottom:2px">${escHtml(e.label)}</div>`);
        c += '</div>';
    }
    if (sched.length > 0) {
        c += '<div class="cal-week-section"><div class="cal-week-section-title schedule">Schedule</div>';
        sched.forEach(s => c += `<div class="cal-indicator schedule" style="margin-bottom:2px">${s.time} ${escHtml(s.name)}</div>`);
        c += '</div>';
    }
    if (data.todos && data.todos.length > 0) {
        const done = data.todos.filter(t => t.done).length;
        c += `<div class="cal-week-section"><div class="cal-week-section-title todos">Tasks (${done}/${data.todos.length})</div>`;
        data.todos.slice(0,3).forEach(t => {
            const st = t.done ? 'text-decoration:line-through;color:var(--text-muted)' : '';
            c += `<div style="font-size:10px;font-weight:600;padding:1px 0;${st}">${t.done?'\u2713 ':'\u25CB '}${escHtml(t.text)}</div>`;
        });
        if (data.todos.length > 3) c += `<div style="font-size:9px;color:var(--text-muted)">+${data.todos.length-3} more</div>`;
        c += '</div>';
    }
    return `<div class="${cls}" onclick="openDayModal('${dk}')">${c}</div>`;
}

function buildMobWeekCard(date, dk) {
    const isToday = dk === todayKey();
    const data = calState.data[dk] || {}, events = getEventsForDate(dk), sched = getScheduleForDate(dk);
    let cls = 'mob-week-day-card'; if (isToday) cls += ' today';
    let badges = '';
    events.forEach(e => {
        const bg = e.type==='holiday'?'rgba(239,68,68,.08)':'rgba(139,92,246,.1)';
        const co = e.type==='holiday'?'#ef4444':'#8b5cf6';
        badges += `<span class="mob-week-badge" style="background:${bg};color:${co}">${escHtml(e.label)}</span>`;
    });
    if (data.todos && data.todos.length > 0) { const d = data.todos.filter(t=>t.done).length; badges += `<span class="mob-week-badge" style="background:var(--getsuga-glow);color:var(--getsuga)">${d}/${data.todos.length} tasks</span>`; }
    if (sched.length > 0) badges += `<span class="mob-week-badge" style="background:var(--reishi-glow);color:var(--reishi)">${sched.length} lectures</span>`;
    return `<div class="${cls}" onclick="openDayModal('${dk}')">
        <div class="mob-week-day-head"><div class="mob-week-day-label"><div class="mob-week-day-num">${date.getDate()}</div><div class="mob-week-day-name">${getFullDayName(date.getDay())}</div></div></div>
        ${badges ? `<div class="mob-week-badges">${badges}</div>` : ''}
    </div>`;
}

// ========== DAY MODAL (TAB-BASED) ==========
let modalActiveTab = 'schedule';

function openDayModal(dk) {
    calState.selectedDate = dk;
    const data = getDayData(dk);
    const events = getEventsForDate(dk);
    const schedule = getScheduleForDate(dk);

    // Init attendance from schedule if empty
    if (schedule.length > 0 && (!data.attendance || Object.keys(data.attendance).length === 0)) {
        data.attendance = {};
        schedule.forEach(s => { data.attendance[s.name + '_' + s.time] = 'absent'; });
    }

    document.getElementById('cal-modal-date').textContent = formatDateLong(dk);

    const tabs = [];
    if (schedule.length > 0) tabs.push({ id: 'schedule', label: 'Schedule', icon: 'book-open' });
    tabs.push({ id: 'tasks', label: 'Tasks', icon: 'check-square' });
    if (schedule.length > 0) tabs.push({ id: 'attendance', label: 'Attendance', icon: 'user-check' });
    if (events.length > 0) tabs.push({ id: 'events', label: 'Events', icon: 'calendar' });
    tabs.push({ id: 'summary', label: 'Summary', icon: 'zap' });

    if (!tabs.find(t => t.id === modalActiveTab)) modalActiveTab = tabs[0].id;

    const tabsEl = document.getElementById('cal-tabs');
    tabsEl.innerHTML = tabs.map(t =>
        `<button class="cal-tab${t.id === modalActiveTab ? ' active' : ''}" data-tab="${t.id}" onclick="switchModalTab('${t.id}')">
            <i data-lucide="${t.icon}" style="width:12px;height:12px;vertical-align:-2px;margin-right:4px"></i>${t.label}
        </button>`
    ).join('');

    const panelsEl = document.getElementById('cal-tab-panels');
    let panels = '';

    // Schedule panel
    if (schedule.length > 0) {
        const badgeColors = { 'Lecture': 'var(--getsuga-glow);color:var(--getsuga)', 'Lab': 'var(--reishi-glow);color:var(--reishi)', 'Tutorial': 'rgba(34,197,94,.1);color:#22c55e' };
        let schedHtml = schedule.map(s => {
            const bc = badgeColors[s.type] || badgeColors['Lecture'];
            return `<div class="cal-schedule-item">
                <div class="cal-sched-time">${s.time}</div>
                <div class="cal-sched-bar" style="background:${s.color || 'var(--getsuga)'}"></div>
                <div style="min-width:0;flex:1"><div class="cal-sched-name">${escHtml(s.name)}</div><div class="cal-sched-type">${s.type}</div></div>
                <div class="cal-sched-badge" style="background:${bc.split(';')[0]};${bc.split(';')[1]}">${s.type}</div>
            </div>`;
        }).join('');
        if (!schedHtml) schedHtml = '<div class="cal-empty">No classes scheduled</div>';
        panels += `<div class="cal-tab-panel${modalActiveTab==='schedule'?' active':''}" data-panel="schedule">${schedHtml}</div>`;
    }

    // Tasks panel
    panels += `<div class="cal-tab-panel${modalActiveTab==='tasks'?' active':''}" data-panel="tasks" id="cal-tasks-panel">${buildTodoPanel(dk, data)}</div>`;

    // Attendance panel (3-state: present / absent / cancelled)
    if (schedule.length > 0) {
        let attHtml = schedule.map(s => {
            const key = s.name + '_' + s.time;
            const state = attVal(data.attendance && data.attendance[key]);
            return `<div class="cal-attendance-item">
                <div class="cal-attendance-info">
                    <div class="cal-attendance-bar" style="background:${s.color || 'var(--getsuga)'}"></div>
                    <div style="min-width:0"><div class="cal-attendance-name">${escHtml(s.name)}</div><div class="cal-attendance-time">${s.time} \u2022 ${s.type}</div></div>
                </div>
                <div class="cal-att-btns">
                    <button class="cal-att-btn present${state==='present'?' active':''}" onclick="setAttendance('${dk}','${key}','present')" title="Present"><i data-lucide="check" style="width:12px;height:12px"></i></button>
                    <button class="cal-att-btn absent${state==='absent'?' active':''}" onclick="setAttendance('${dk}','${key}','absent')" title="Absent"><i data-lucide="x" style="width:12px;height:12px"></i></button>
                    <button class="cal-att-btn cancelled${state==='cancelled'?' active':''}" onclick="setAttendance('${dk}','${key}','cancelled')" title="Cancelled"><i data-lucide="ban" style="width:12px;height:12px"></i></button>
                </div>
            </div>`;
        }).join('');
        panels += `<div class="cal-tab-panel${modalActiveTab==='attendance'?' active':''}" data-panel="attendance">${attHtml}</div>`;
    }

    // Events panel
    if (events.length > 0) {
        let evtHtml = events.map(e =>
            `<div class="cal-event-badge ${e.type}">
                <div class="cal-event-icon" style="background:${e.type==='holiday'?'rgba(239,68,68,.1)':'rgba(139,92,246,.1)'}">
                    <i data-lucide="${e.type==='holiday'?'sun':'flag'}" style="width:12px;height:12px;color:${e.type==='holiday'?'#ef4444':'#8b5cf6'}"></i>
                </div>
                ${escHtml(e.label)}
            </div>`
        ).join('');
        panels += `<div class="cal-tab-panel${modalActiveTab==='events'?' active':''}" data-panel="events">${evtHtml}</div>`;
    }

    // Summary panel
    panels += `<div class="cal-tab-panel${modalActiveTab==='summary'?' active':''}" data-panel="summary">${buildSummaryPanel(dk)}</div>`;

    panelsEl.innerHTML = panels;
    document.getElementById('cal-modal-overlay').classList.add('open');
    lucide.createIcons();
    renderCurrentView();
}

function switchModalTab(tabId) {
    modalActiveTab = tabId;
    document.querySelectorAll('.cal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.cal-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tabId));
}

function buildTodoPanel(dk, data) {
    let html = '';
    if (data.todos && data.todos.length > 0) {
        data.todos.forEach((t, i) => {
            html += `<div class="cal-todo-item" onclick="toggleCalTodo('${dk}',${i})">
                <div class="cal-todo-check${t.done?' done':''}">${t.done?'<i data-lucide="check" style="width:10px;height:10px;color:#000"></i>':''}</div>
                <div class="cal-todo-text${t.done?' done':''}">${escHtml(t.text)}</div>
                <button class="cal-todo-delete" onclick="event.stopPropagation();deleteCalTodo('${dk}',${i})"><i data-lucide="x" style="width:12px;height:12px"></i></button>
            </div>`;
        });
    } else {
        html += '<div class="cal-empty">No tasks for this day</div>';
    }
    html += `<div class="cal-todo-add">
        <input type="text" id="cal-todo-input" placeholder="Add a task..." onkeydown="if(event.key==='Enter')addCalTodo('${dk}')">
        <button onclick="addCalTodo('${dk}')"><i data-lucide="plus" style="width:14px;height:14px"></i></button>
    </div>`;
    return html;
}

function buildSummaryPanel(dk) {
    const data = calState.data[dk] || {};
    const events = getEventsForDate(dk);
    const schedule = getScheduleForDate(dk);

    const totalTodos = data.todos ? data.todos.length : 0;
    const doneTodos = data.todos ? data.todos.filter(t => t.done).length : 0;
    const totalLectures = schedule.length;

    let attended = 0, cancelled = 0, totalAtt = 0;
    if (data.attendance && schedule.length > 0) {
        const schedKeys = new Set(schedule.map(s => s.name + '_' + s.time));
        for (const [k, v] of Object.entries(data.attendance)) {
            if (!schedKeys.has(k)) continue;
            const s = attVal(v);
            if (s === 'cancelled') { cancelled++; continue; }
            totalAtt++;
            if (s === 'present') attended++;
        }
    }

    const todoPct = totalTodos > 0 ? Math.round((doneTodos / totalTodos) * 100) : 0;
    const attPct = totalAtt > 0 ? Math.round((attended / totalAtt) * 100) : 0;

    const todoClass = todoPct >= 80 ? 'good' : todoPct >= 50 ? 'warn' : totalTodos === 0 ? '' : 'bad';
    const attClass = attPct >= 80 ? 'good' : attPct >= 50 ? 'warn' : totalAtt === 0 ? '' : 'bad';
    const eventsList = events.length > 0 ? events.map(e => escHtml(e.label)).join(', ') : 'None';

    let html = `
        <div class="cal-summary-stat"><div class="cal-summary-stat-label">Tasks Completed</div><div class="cal-summary-stat-value ${todoClass}">${doneTodos}/${totalTodos}${totalTodos>0?' ('+todoPct+'%)':''}</div></div>
        <div class="cal-summary-stat"><div class="cal-summary-stat-label">Lectures Attended</div><div class="cal-summary-stat-value ${attClass}">${attended}/${totalAtt}${totalAtt>0?' ('+attPct+'%)':''}</div></div>
        <div class="cal-summary-stat"><div class="cal-summary-stat-label">Total Lectures</div><div class="cal-summary-stat-value">${totalLectures}${cancelled>0?' ('+cancelled+' cancelled)':''}</div></div>
        <div class="cal-summary-stat"><div class="cal-summary-stat-label">Events / Holidays</div><div class="cal-summary-stat-value" style="font-size:12px">${eventsList}</div></div>`;

    if (totalTodos > 0 && doneTodos < totalTodos)
        html += `<div class="cal-summary-alert warn"><i data-lucide="alert-triangle" style="width:14px;height:14px;flex-shrink:0"></i>${totalTodos-doneTodos} task${totalTodos-doneTodos>1?'s':''} still pending</div>`;
    if (totalTodos > 0 && doneTodos === totalTodos)
        html += `<div class="cal-summary-alert good"><i data-lucide="check-circle" style="width:14px;height:14px;flex-shrink:0"></i>All tasks completed!</div>`;

    return html;
}

function closeDayModal() {
    document.getElementById('cal-modal-overlay').classList.remove('open');
}


function toggleCalTodo(dk, idx) {
    const data = getDayData(dk);
    if (data.todos[idx]) { data.todos[idx].done = !data.todos[idx].done; saveCalData(); openDayModal(dk); }
}

function addCalTodo(dk) {
    const inp = document.getElementById('cal-todo-input');
    const val = inp.value.trim(); if (!val) return;
    const data = getDayData(dk);
    data.todos.push({ id: Date.now(), text: val, done: false });
    inp.value = '';
    saveCalData(); openDayModal(dk); showToast('Task added');
}

function deleteCalTodo(dk, idx) {
    const data = getDayData(dk);
    data.todos.splice(idx, 1);
    saveCalData(); openDayModal(dk); showToast('Task removed');
}

// ========== ATTENDANCE (3-state) ==========
function setAttendance(dk, key, state) {
    const data = getDayData(dk);
    if (!data.attendance) data.attendance = {};
    data.attendance[key] = state;
    saveCalData();
    const msgs = { present: 'Marked as present', absent: 'Marked as absent', cancelled: 'Marked as cancelled' };
    showToast(msgs[state] || 'Updated');
    openDayModal(dk);
}


function openUploadModal() {
    document.getElementById('cal-upload-overlay').classList.add('open');
    const status = document.getElementById('sched-upload-status');
    status.className = 'cal-upload-status';
    status.style.display = 'none';
    document.getElementById('sched-file-input').value = '';
    lucide.createIcons();
}

function closeUploadModal() {
    document.getElementById('cal-upload-overlay').classList.remove('open');
}

async function handleScheduleUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('sched-upload-status');
    status.className = 'cal-upload-status loading';
    status.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;flex-shrink:0;animation:spin 1s linear infinite"></i> Processing with AI...';
    status.style.display = 'flex';
    lucide.createIcons();

    const fd = new FormData();
    fd.append('file', file);
    try {
        const res = await fetch('/api/calendar/schedule/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.status === 'success') {
            USER_SCHEDULE = normalizeSchedule(json.schedule);
            status.className = 'cal-upload-status success';
            status.innerHTML = '<i data-lucide="check-circle" style="width:14px;height:14px;flex-shrink:0"></i> Schedule extracted and saved!';
            // Auto-set first group if groups detected and none selected
            const groups = USER_SCHEDULE.groups || ['ALL'];
            if (groups.length > 1 && !SELECTED_GROUP) {
                SELECTED_GROUP = groups[0];
                fetch('/api/calendar/group', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ group: groups[0] })
                }).catch(() => {});
                showToast(`Groups detected! Set to ${groups[0]}. Change in Attendance page.`);
            }
            renderCurrentView();
            showToast('Schedule uploaded successfully');
        } else {
            status.className = 'cal-upload-status error';
            status.innerHTML = `<i data-lucide="alert-circle" style="width:14px;height:14px;flex-shrink:0"></i> ${escHtml(json.message || 'Upload failed')}`;
        }
    } catch {
        status.className = 'cal-upload-status error';
        status.innerHTML = '<i data-lucide="alert-circle" style="width:14px;height:14px;flex-shrink:0"></i> Network error';
    }
    lucide.createIcons();
}

// Drag and drop
const uploadZone = document.getElementById('sched-upload-zone');
if (uploadZone) {
    ['dragover','dragenter'].forEach(ev => uploadZone.addEventListener(ev, e => { e.preventDefault(); uploadZone.classList.add('dragging'); }));
    ['dragleave','drop'].forEach(ev => uploadZone.addEventListener(ev, e => { e.preventDefault(); uploadZone.classList.remove('dragging'); }));
    uploadZone.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        if (file) {
            const dt = new DataTransfer(); dt.items.add(file);
            document.getElementById('sched-file-input').files = dt.files;
            handleScheduleUpload(document.getElementById('sched-file-input'));
        }
    });
}

// ========== VIEW SWITCHING ==========
function setView(view) {
    calState.view = view;
    document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.getElementById('cal-month-view').style.display = view === 'month' ? '' : 'none';
    document.getElementById('cal-week-view').style.display = view === 'week' ? '' : 'none';
    document.querySelectorAll('.mob-cal-ctrl-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const mm = document.getElementById('mob-cal-month-view'), mw = document.getElementById('mob-cal-week-view');
    if (mm) mm.style.display = view === 'month' ? '' : 'none';
    if (mw) mw.style.display = view === 'week' ? '' : 'none';
    if (view === 'week') {
        const d = new Date(calState.year, calState.month, 1), day = d.getDay();
        calState.weekStart = new Date(d); calState.weekStart.setDate(d.getDate()-day);
    }
    renderCurrentView();
}

function renderCurrentView() {
    updateTitle();
    if (calState.view === 'month') renderMonthView(); else renderWeekView();
    lucide.createIcons();
}

function updateTitle() {
    const dt = document.getElementById('cal-month-title'), mt = document.getElementById('mob-cal-title');
    if (calState.view === 'month') {
        const text = `${getMonthName(calState.month)} ${calState.year}`;
        if (dt) dt.textContent = text; if (mt) mt.textContent = text;
    } else {
        const dates = getWeekDates(), s = dates[0], e = dates[6];
        const text = `${getMonthName(s.getMonth())} ${s.getDate()} - ${s.getMonth()!==e.getMonth()?getMonthName(e.getMonth())+' ':''}${e.getDate()}`;
        if (dt) dt.textContent = text; if (mt) mt.textContent = text;
    }
}

// ========== NAVIGATION ==========
function navigatePrev() {
    if (calState.view === 'month') { calState.month--; if (calState.month < 0) { calState.month = 11; calState.year--; } }
    else calState.weekStart.setDate(calState.weekStart.getDate()-7);
    fetchMonthData(); renderCurrentView();
}
function navigateNext() {
    if (calState.view === 'month') { calState.month++; if (calState.month > 11) { calState.month = 0; calState.year++; } }
    else calState.weekStart.setDate(calState.weekStart.getDate()+7);
    fetchMonthData(); renderCurrentView();
}
function goToday() {
    const t = new Date(); calState.year = t.getFullYear(); calState.month = t.getMonth(); calState.weekStart = null;
    fetchMonthData(); renderCurrentView();
}

// ========== THEME ==========
function applyTheme() {
    const theme = localStorage.getItem('shingaku-theme') || 'dark';
    document.body.classList.toggle('light-theme', theme === 'light');
    updateThemeIcons(theme);
}
function toggleTheme() {
    const cur = localStorage.getItem('shingaku-theme') || 'dark', next = cur==='dark'?'light':'dark';
    localStorage.setItem('shingaku-theme', next);
    document.body.classList.toggle('light-theme', next==='light');
    updateThemeIcons(next);
    showToast(next==='light'?'Light mode activated':'Dark mode activated');
}
function updateThemeIcons(theme) {
    const icon = theme === 'light' ? 'moon' : 'sun';
    document.querySelectorAll('#theme-toggle i, #mob-theme-toggle i').forEach(el => el.setAttribute('data-lucide', icon));
    lucide.createIcons();
}

// ========== SIDEBAR ==========
const sidebar = document.getElementById('dk-sidebar'), sidebarToggle = document.getElementById('sidebar-toggle');
if (sidebarToggle && sidebar) {
    if ((localStorage.getItem('shingaku-sidebar')||'expanded') === 'collapsed') sidebar.classList.add('collapsed');
    sidebarToggle.addEventListener('click', () => { sidebar.classList.toggle('collapsed'); localStorage.setItem('shingaku-sidebar', sidebar.classList.contains('collapsed')?'collapsed':'expanded'); });
}
function toggleProfileDropdown() { document.getElementById('profile-dropdown').classList.toggle('open'); }
document.addEventListener('click', e => { if (!e.target.closest('.dk-avatar-wrap')) { const dd = document.getElementById('profile-dropdown'); if (dd) dd.classList.remove('open'); } });

async function logOut() {
    try { const r = await fetch('/logout',{method:'POST'}); const d = await r.json(); if (d.status==='success'){ showToast('Logged out'); setTimeout(()=>location.href='/',600);} }
    catch { showToast('Logout failed'); }
}

function showToast(msg) {
    const c = document.getElementById('toast-container'); if (!c) return;
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<i data-lucide="info" style="width:14px;height:14px;color:var(--getsuga);flex-shrink:0"></i>${escHtml(msg)}`;
    c.appendChild(t); lucide.createIcons();
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
    document.getElementById('cal-prev')?.addEventListener('click', navigatePrev);
    document.getElementById('cal-next')?.addEventListener('click', navigateNext);
    document.getElementById('cal-today-btn')?.addEventListener('click', goToday);
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
    document.getElementById('mob-cal-prev')?.addEventListener('click', navigatePrev);
    document.getElementById('mob-cal-next')?.addEventListener('click', navigateNext);
    document.getElementById('mob-cal-today')?.addEventListener('click', goToday);

    document.querySelectorAll('.cal-view-btn').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    document.querySelectorAll('.mob-cal-ctrl-btn[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

    document.getElementById('cal-modal-close')?.addEventListener('click', closeDayModal);
    document.getElementById('cal-modal-overlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeDayModal(); });
    document.getElementById('cal-upload-overlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeUploadModal(); });

    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeUploadModal(); closeDayModal(); } });
}

function dismissBoot() { const bs = document.getElementById('boot-screen'); if (!bs) return; bs.classList.add('fade-out'); setTimeout(() => bs.style.display='none', 600); }

async function init() {
    applyTheme();
    setupEventListeners();
    if (typeof SHINGAKU_USER !== 'undefined' && SHINGAKU_USER.username) {
        const dd = document.getElementById('dd-user'); if (dd) dd.textContent = SHINGAKU_USER.username;
    }
    await loadAllData();
    requestAnimationFrame(() => setTimeout(dismissBoot, 300));
}

document.addEventListener('DOMContentLoaded', init);

const style = document.createElement('style');
style.textContent = '@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
document.head.appendChild(style);
