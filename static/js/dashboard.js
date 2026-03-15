/* ============================================
   SHINGAKU — Dashboard Engine v2
   Live data from calendar APIs
   ============================================ */

// ========== STATE ==========
let USER_SCHEDULE = {};
let SELECTED_GROUP = '';
let COLLEGE_EVENTS = {};
let TODAY_DATA = { todos: [], attendance: {} };
let ATT_STATS = {};

const MEME_GIFS = ['/static/assets/memes/animation.gif', '/static/assets/memes/animation2.gif', '/static/assets/memes/animation3.gif'];
const HOLIDAY_LINES = [
    "IT'S DISCO TIME", "LET'S DANCE", "LET'S CHILL", "VIBES ONLY TODAY",
    "NO BOOKS, JUST VIBES", "TOUCH GRASS DAY", "SLEEP MODE: ON",
    "HOLIDAY ARC ACTIVATED", "FILLER EPISODE DAY", "PARTY NO JUTSU"
];
const LOW_ATT_LINES = [
    "Someone needs to touch the books",
    "Your attendance is on life support",
    "The bench misses you",
    "Even your proxy won't save you now",
    "Attendance said: I don't know this person",
    "Your seat in class filed a missing report",
    "75% is a vibe, you're not even close",
    "Bro thinks bunking is a personality trait"
];

function todayKey() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
}

function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

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

function getEventsForDate(dk) { return COLLEGE_EVENTS[dk] || []; }

function attVal(v) {
    if (v === true || v === 'present') return 'present';
    if (v === 'cancelled') return 'cancelled';
    return 'absent';
}

// ========== DATA LOADING ==========
async function loadAllDashboardData() {
    await Promise.all([loadUserSchedule(), loadUserGroup(), loadCollegeEvents(), loadTodayData(), loadAttendanceStats()]);
}

async function loadUserSchedule() {
    try {
        const res = await fetch('/api/calendar/schedule');
        const json = await res.json();
        if (json.status === 'success' && json.schedule) USER_SCHEDULE = normalizeSchedule(json.schedule);
    } catch {}
}

async function loadUserGroup() {
    try {
        const res = await fetch('/api/calendar/group');
        const json = await res.json();
        if (json.status === 'success') SELECTED_GROUP = json.group || '';
    } catch {}
}

async function loadCollegeEvents() {
    try {
        const res = await fetch('/api/calendar/events');
        const json = await res.json();
        if (json.status === 'success' && json.events) COLLEGE_EVENTS = json.events;
    } catch {}
}

async function loadTodayData() {
    try {
        const res = await fetch(`/api/calendar/day/${todayKey()}`);
        const json = await res.json();
        if (json.status === 'success' && json.data) TODAY_DATA = json.data;
    } catch {}
    if (!TODAY_DATA.todos) TODAY_DATA.todos = [];
    if (!TODAY_DATA.attendance) TODAY_DATA.attendance = {};
}

async function loadAttendanceStats() {
    try {
        const res = await fetch('/api/calendar/attendance_stats');
        const json = await res.json();
        if (json.status === 'success') ATT_STATS = json.stats || {};
    } catch {}
}

async function saveTodayData() {
    try {
        await fetch(`/api/calendar/day/${todayKey()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(TODAY_DATA)
        });
    } catch {}
}

// ========== GREETING ==========
function getGreeting() {
    const h = new Date().getHours();
    if (h < 5) return "Burning the midnight oil";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Night owl mode";
}

function renderGreeting() {
    const g = getGreeting();
    const d = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const name = (typeof SHINGAKU_USER !== 'undefined' && SHINGAKU_USER.username) || 'Scholar';
    const html = `${g}, <span class="accent">${name}</span>`;
    ["dk-greeting-text", "mob-greeting-text"].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
    ["dk-date", "mob-date"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = d; });
}

// ========== STATS ==========
function renderStats() {
    const schedule = getScheduleForDate(todayKey());
    const pendingTodos = (TODAY_DATA.todos || []).filter(t => !t.done).length;
    const notifs = SoulSocietyOS.notifications.length;

    // Overall attendance %
    let totalAtt = 0, totalPresent = 0;
    for (const s of Object.values(ATT_STATS)) {
        totalAtt += s.total;
        totalPresent += s.attended;
    }
    const attPct = totalAtt > 0 ? Math.round((totalPresent / totalAtt) * 100) : -1;
    const attStr = attPct >= 0 ? attPct + '%' : '--';

    ["dk-stat-classes", "mob-stat-classes"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = schedule.length; });
    ["dk-stat-todos", "mob-stat-todos"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = pendingTodos; });
    ["dk-stat-notifs", "mob-stat-notifs"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = notifs; });
    ["dk-stat-att", "mob-stat-att"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = attStr; });
}

// ========== HIGHLIGHT CARD (schedule or holiday meme) ==========
function renderHighlight() {
    const dk = todayKey();
    const events = getEventsForDate(dk);
    const schedule = getScheduleForDate(dk);
    const isHoliday = events.some(e => e.type === 'holiday');
    const isSunday = new Date(dk).getDay() === 0;
    const noClasses = schedule.length === 0;

    let html = '';
    if (isHoliday || (isSunday && noClasses)) {
        const gif = MEME_GIFS[Math.floor(Math.random() * MEME_GIFS.length)];
        const line = HOLIDAY_LINES[Math.floor(Math.random() * HOLIDAY_LINES.length)];
        const holidayLabel = events.find(e => e.type === 'holiday')?.label || (isSunday ? 'Sunday' : 'Day Off');
        html = `<div class="dk-card dk-holiday-card">
            <div class="dk-holiday-inner">
                <div class="dk-holiday-text">
                    <div class="dk-holiday-tag"><i data-lucide="party-popper" style="width:14px;height:14px"></i> ${escHtml(holidayLabel)}</div>
                    <div class="dk-holiday-line font-oswald">${line}</div>
                    <div class="dk-holiday-sub">No lectures today. Recharge and come back stronger.</div>
                </div>
                <div class="dk-holiday-gif"><video src="${gif}" autoplay loop muted playsinline></video></div>
            </div>
        </div>`;
    } else if (schedule.length > 0) {
        // Quick glance: next upcoming class
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        let next = null;
        for (const s of schedule) {
            const [h, m] = s.time.split(':').map(Number);
            if (h * 60 + m >= nowMin) { next = s; break; }
        }
        if (next) {
            html = `<div class="dk-card dk-next-class-card">
                <div class="dk-next-class-inner">
                    <div class="dk-next-class-tag"><i data-lucide="zap" style="width:12px;height:12px"></i> Up Next</div>
                    <div class="dk-next-class-name font-oswald">${escHtml(next.name)}</div>
                    <div class="dk-next-class-meta">${next.time} &bull; ${next.type}</div>
                </div>
                <div class="dk-next-class-accent" style="background:${next.color || 'var(--getsuga)'}"></div>
            </div>`;
        } else {
            html = `<div class="dk-card dk-next-class-card">
                <div class="dk-next-class-inner">
                    <div class="dk-next-class-tag" style="color:var(--success)"><i data-lucide="check-circle" style="width:12px;height:12px"></i> All Done</div>
                    <div class="dk-next-class-name font-oswald">CLASSES DONE FOR TODAY</div>
                    <div class="dk-next-class-meta">You survived. Go touch some grass.</div>
                </div>
            </div>`;
        }
    }
    // else: no schedule uploaded yet, show nothing

    ["dk-highlight", "mob-highlight"].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
}

// ========== ATTENDANCE BAR ==========
function renderAttendanceBar() {
    let totalAtt = 0, totalPresent = 0, totalCancelled = 0;
    for (const s of Object.values(ATT_STATS)) {
        totalAtt += s.total;
        totalPresent += s.attended;
        totalCancelled += (s.cancelled || 0);
    }

    if (totalAtt === 0) {
        ["dk-att-bar", "mob-att-bar"].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
        return;
    }

    const pct = Math.round((totalPresent / totalAtt) * 100);
    const isLow = pct < 70;
    const barColor = pct >= 75 ? 'var(--success)' : pct >= 70 ? 'var(--getsuga)' : 'var(--danger)';
    const quip = isLow ? LOW_ATT_LINES[Math.floor(Math.random() * LOW_ATT_LINES.length)] : '';

    const html = `<div class="dk-card dk-att-overview" onclick="location.href='/attendance'" style="cursor:pointer">
        <div class="dk-att-overview-header">
            <div class="dk-section-title" style="margin-bottom:0">Attendance</div>
            <div class="dk-att-pct font-oswald ${isLow ? 'low' : 'ok'}">${pct}%</div>
        </div>
        <div class="dk-att-track">
            <div class="dk-att-fill" style="width:${pct}%;background:${barColor}"></div>
            <div class="dk-att-threshold"></div>
        </div>
        <div class="dk-att-details">
            <span>${totalPresent} attended</span>
            <span>${totalAtt - totalPresent} missed</span>
            ${totalCancelled > 0 ? `<span>${totalCancelled} cancelled</span>` : ''}
        </div>
        ${isLow ? `<div class="dk-att-quip"><i data-lucide="alert-triangle" style="width:13px;height:13px;flex-shrink:0"></i> ${escHtml(quip)}</div>` : ''}
    </div>`;

    ["dk-att-bar", "mob-att-bar"].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
}

// ========== SCHEDULE ==========
function renderSchedule() {
    const schedule = getScheduleForDate(todayKey());
    const dk = document.getElementById("dk-schedule");
    const mob = document.getElementById("mob-schedule");

    if (schedule.length === 0) {
        const empty = '<div style="padding:20px 0;text-align:center;color:var(--text-muted);font-size:12px;font-weight:600">No classes today</div>';
        if (dk) dk.innerHTML = empty;
        if (mob) mob.innerHTML = empty;
        return;
    }

    const buildItem = (c, cls) => {
        const badgeColors = { "Lecture": "var(--getsuga-glow);color:var(--getsuga)", "Lab": "var(--reishi-glow);color:var(--reishi)", "Tutorial": "rgba(34,197,94,.1);color:#22c55e" };
        const badgeBg = badgeColors[c.type] || "var(--getsuga-glow);color:var(--getsuga)";
        return `<div class="${cls}-schedule-item">
            <div class="${cls}-schedule-time">${c.time}</div>
            <div class="${cls}-schedule-bar" style="background:${c.color || 'var(--getsuga)'}"></div>
            <div><div class="${cls}-schedule-name">${escHtml(c.name)}</div><div class="${cls}-schedule-type">${c.type}</div></div>
            <div class="${cls}-schedule-badge" style="background:${badgeBg.split(";")[0]};${badgeBg.split(";")[1]}">${c.type}</div>
        </div>`;
    };
    if (dk) dk.innerHTML = schedule.map(c => buildItem(c, "dk")).join("");
    if (mob) mob.innerHTML = schedule.map(c => buildItem(c, "mob")).join("");
}

// ========== TODOS (synced with calendar) ==========
function renderTodos() {
    const todos = TODAY_DATA.todos || [];
    const build = (t, idx, cls) => {
        return `<div class="${cls}-todo-item" onclick="toggleTodo(${idx})">
            <div class="${cls}-todo-check ${t.done ? 'done' : ''}">${t.done ? '<i data-lucide="check" style="width:12px;height:12px;color:#000"></i>' : ''}</div>
            <div class="${cls}-todo-text ${t.done ? 'done' : ''}">${escHtml(t.text)}</div>
            <button class="${cls === 'dk' ? 'dk-todo-del' : 'mob-todo-del'}" onclick="event.stopPropagation();deleteTodo(${idx})" title="Remove"><i data-lucide="x" style="width:12px;height:12px"></i></button>
        </div>`;
    };
    const dk = document.getElementById("dk-todos");
    const mob = document.getElementById("mob-todos");
    if (todos.length === 0) {
        const empty = '<div style="padding:16px 0;text-align:center;color:var(--text-muted);font-size:12px;font-weight:600">No tasks for today</div>';
        if (dk) dk.innerHTML = empty;
        if (mob) mob.innerHTML = empty;
    } else {
        if (dk) dk.innerHTML = todos.map((t, i) => build(t, i, "dk")).join("");
        if (mob) mob.innerHTML = todos.map((t, i) => build(t, i, "mob")).join("");
    }
    lucide.createIcons();
    renderStats();
}

function toggleTodo(idx) {
    const todos = TODAY_DATA.todos || [];
    if (todos[idx]) {
        todos[idx].done = !todos[idx].done;
        saveTodayData();
        renderTodos();
    }
}

function deleteTodo(idx) {
    const todos = TODAY_DATA.todos || [];
    todos.splice(idx, 1);
    saveTodayData();
    renderTodos();
    showToast('Task removed');
}

function addTodo() {
    const inp = document.getElementById("dk-todo-input");
    const val = inp.value.trim();
    if (!val) return;
    if (!TODAY_DATA.todos) TODAY_DATA.todos = [];
    TODAY_DATA.todos.push({ id: Date.now(), text: val, done: false });
    inp.value = "";
    saveTodayData();
    renderTodos();
    showToast("Task added");
}

function addTodoMob() {
    const inp = document.getElementById("mob-todo-input");
    const val = inp.value.trim();
    if (!val) return;
    if (!TODAY_DATA.todos) TODAY_DATA.todos = [];
    TODAY_DATA.todos.push({ id: Date.now(), text: val, done: false });
    inp.value = "";
    saveTodayData();
    renderTodos();
    showToast("Task added");
}

// ========== NOTIFICATIONS ==========
const SoulSocietyOS = { notifications: [] };

function renderNotifications() {
    const list = document.getElementById("notif-list");
    if (!list) return;
    if (SoulSocietyOS.notifications.length === 0) {
        list.innerHTML = '<div class="dk-dropdown-item" style="color:var(--text-muted);pointer-events:none">No notifications</div>';
        return;
    }
    list.innerHTML = SoulSocietyOS.notifications.map(n =>
        `<div class="dk-dropdown-item" style="cursor:pointer" onclick="dismissNotification('${n._id}', this)"><i data-lucide="${n.icon || 'bell'}" style="width:14px;height:14px;color:var(--getsuga);flex-shrink:0"></i><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:700">${n.title}</div><div style="font-size:10px;color:var(--text-muted)">${n.message}</div></div><span style="margin-left:auto;font-size:10px;color:var(--text-muted);white-space:nowrap">${timeAgo(n.created_at)}</span></div>`
    ).join("");
    lucide.createIcons();
    const hasBadge = SoulSocietyOS.notifications.length > 0;
    ["notif-dot", "mob-notif-dot"].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = hasBadge ? "block" : "none"; });
}

function timeAgo(ts) {
    const diff = Math.floor(Date.now() / 1000 - ts);
    if (diff < 60) return 'now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

function dismissNotification(id, el) {
    if (el) el.style.opacity = '0.3';
    fetch('/notifications/dismiss', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id })
    }).then(() => {
        SoulSocietyOS.notifications = SoulSocietyOS.notifications.filter(n => n._id !== id);
        renderNotifications();
        renderStats();
    });
}

let _lastNotifIds = new Set();
async function fetchNotifications() {
    try {
        const res = await fetch('/notifications');
        const data = await res.json();
        if (data.status === 'success') {
            const newNotifs = data.notifications;
            if (_lastNotifIds.size > 0) {
                for (const n of newNotifs) {
                    if (!_lastNotifIds.has(n._id)) showBrowserNotification(n);
                }
            }
            _lastNotifIds = new Set(newNotifs.map(n => n._id));
            SoulSocietyOS.notifications = newNotifs;
            renderNotifications();
            renderStats();
        }
    } catch {}
}

function initBrowserNotifications() {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}
function showBrowserNotification(n) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(n.title, { body: n.message, icon: '/static/assets/gif/logo.png', tag: n._id });
    }
}

// ========== DROPDOWN / NAVIGATION ==========
function toggleNotifDropdown() {
    const dd = document.getElementById("notif-dropdown");
    const pdd = document.getElementById("profile-dropdown");
    if (pdd) pdd.classList.remove("open");
    dd.classList.toggle("open");
}
function toggleProfileDropdown() {
    const dd = document.getElementById("profile-dropdown");
    const ndd = document.getElementById("notif-dropdown");
    if (ndd) ndd.classList.remove("open");
    dd.classList.toggle("open");
}
document.addEventListener("click", e => {
    if (!e.target.closest("#notif-toggle") && !e.target.closest("#notif-dropdown")) {
        const dd = document.getElementById("notif-dropdown"); if (dd) dd.classList.remove("open");
    }
    if (!e.target.closest(".dk-avatar-wrap")) {
        const dd = document.getElementById("profile-dropdown"); if (dd) dd.classList.remove("open");
    }
});
document.getElementById("notif-toggle")?.addEventListener("click", toggleNotifDropdown);

// ========== SIDEBAR ==========
const sidebar = document.getElementById("dk-sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
if (sidebarToggle && sidebar) {
    if ((localStorage.getItem("shingaku-sidebar") || "expanded") === "collapsed") sidebar.classList.add("collapsed");
    sidebarToggle.addEventListener("click", () => {
        sidebar.classList.toggle("collapsed");
        localStorage.setItem("shingaku-sidebar", sidebar.classList.contains("collapsed") ? "collapsed" : "expanded");
    });
}

// ========== THEME ==========
function applyTheme() {
    const theme = localStorage.getItem("shingaku-theme") || "dark";
    document.body.classList.toggle("light-theme", theme === "light");
    updateThemeIcons(theme);
}
function toggleTheme() {
    const current = localStorage.getItem("shingaku-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("shingaku-theme", next);
    document.body.classList.toggle("light-theme", next === "light");
    updateThemeIcons(next);
    showToast(next === "light" ? "Light mode activated" : "Dark mode activated");
}
function updateThemeIcons(theme) {
    const icon = theme === "light" ? "moon" : "sun";
    document.querySelectorAll("#theme-toggle i, #mob-theme-toggle i").forEach(el => el.setAttribute("data-lucide", icon));
    lucide.createIcons();
}
document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);

// ========== POMODORO (cross-tab, persistent) ==========
const POMO_KEY = 'shingaku-pomo';
const POMO_CUSTOM_KEY = 'shingaku-pomo-custom';
const POMO_FOCUS_DEFAULT = 25 * 60;
const POMO_BREAK_DEFAULT = 5 * 60;

function _loadPomoConfig() {
    try { const c = JSON.parse(localStorage.getItem(POMO_CUSTOM_KEY)); if (c && c.focus > 0 && c.break > 0) return { focus: c.focus * 60, break: c.break * 60 }; } catch {}
    return { focus: POMO_FOCUS_DEFAULT, break: POMO_BREAK_DEFAULT };
}
function _savePomoConfig(focusMin, breakMin) { localStorage.setItem(POMO_CUSTOM_KEY, JSON.stringify({ focus: focusMin, break: breakMin })); }
function applyPomoCustom() {
    const f = parseInt(document.getElementById('pomo-focus-input')?.value || document.getElementById('mob-pomo-focus-input')?.value) || 25;
    const b = parseInt(document.getElementById('pomo-break-input')?.value || document.getElementById('mob-pomo-break-input')?.value) || 5;
    const focusMin = Math.max(1, Math.min(120, f)), breakMin = Math.max(1, Math.min(60, b));
    _savePomoConfig(focusMin, breakMin);
    if (pomoTick) { clearInterval(pomoTick); pomoTick = null; }
    _savePomo({ running: false, remaining: focusMin * 60, isBreak: false });
    updatePomoDisplay(); _syncCustomInputs();
    showToast(`Timer set: ${focusMin}m focus / ${breakMin}m break`);
}
function _syncCustomInputs() {
    const cfg = _loadPomoConfig();
    const fm = cfg.focus / 60, bm = cfg.break / 60;
    ['pomo-focus-input', 'mob-pomo-focus-input'].forEach(id => { const el = document.getElementById(id); if (el) el.value = fm; });
    ['pomo-break-input', 'mob-pomo-break-input'].forEach(id => { const el = document.getElementById(id); if (el) el.value = bm; });
}
let pomoTick = null;
let _pomoChannel = null;
try { _pomoChannel = new BroadcastChannel('shingaku-pomo-sync'); } catch {}

function _loadPomo() { try { return JSON.parse(localStorage.getItem(POMO_KEY)) || null; } catch { return null; } }
function _savePomo(state) { localStorage.setItem(POMO_KEY, JSON.stringify(state)); if (_pomoChannel) _pomoChannel.postMessage('sync'); }

function _getPomoSeconds() {
    const st = _loadPomo(), cfg = _loadPomoConfig();
    if (!st) return { seconds: cfg.focus, running: false, isBreak: false };
    if (!st.running) return { seconds: st.remaining || cfg.focus, running: false, isBreak: !!st.isBreak };
    const elapsed = Math.floor(Date.now() / 1000) - st.startedAt;
    const left = st.duration - elapsed;
    if (left <= 0) return { seconds: 0, running: true, isBreak: !!st.isBreak, finished: true };
    return { seconds: left, running: true, isBreak: !!st.isBreak };
}

function formatPomoTime(sec) { return `${Math.floor(sec/60).toString().padStart(2,"0")}:${(sec%60).toString().padStart(2,"0")}`; }

function updatePomoDisplay() {
    const info = _getPomoSeconds();
    if (info.finished) { _pomoFinish(info.isBreak); return; }
    ["pomo-time", "mob-pomo-time"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = formatPomoTime(info.seconds); });
    ["pomo-phase", "mob-pomo-phase"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = info.isBreak ? "Break Time" : "Focus Time"; });
    ["pomo-start", "mob-pomo-start"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = info.running ? "Pause" : "Start"; });
    const showCustom = !info.running;
    ["pomo-custom", "mob-pomo-custom"].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = showCustom ? '' : 'none'; });
}

function _pomoFinish(wasBreak) {
    if (pomoTick) { clearInterval(pomoTick); pomoTick = null; }
    const cfg = _loadPomoConfig();
    const nextIsBreak = !wasBreak;
    _savePomo({ running: false, remaining: nextIsBreak ? cfg.break : cfg.focus, isBreak: nextIsBreak });
    updatePomoDisplay(); _pomoAlarm();
    const msg = nextIsBreak ? "Focus done! Time for a break." : "Break over! Back to focus.";
    showToast(msg);
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Shingaku Pomodoro', { body: msg, icon: '/static/assets/gif/logo.png', tag: 'pomo-alarm' });
    }
}

function _pomoAlarm() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const playBeep = (freq, start, dur) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
        };
        playBeep(523, 0, 0.2); playBeep(659, 0.25, 0.2); playBeep(784, 0.5, 0.4);
    } catch {}
}

function _startPomoTick() {
    if (pomoTick) clearInterval(pomoTick);
    pomoTick = setInterval(() => {
        const info = _getPomoSeconds();
        if (info.finished) { _pomoFinish(info.isBreak); return; }
        if (!info.running) { clearInterval(pomoTick); pomoTick = null; }
        updatePomoDisplay();
    }, 500);
}

function togglePomo() {
    const info = _getPomoSeconds();
    if (info.running) {
        _savePomo({ running: false, remaining: info.seconds, isBreak: info.isBreak });
        if (pomoTick) { clearInterval(pomoTick); pomoTick = null; }
    } else {
        const cfg = _loadPomoConfig();
        const duration = info.seconds > 0 ? info.seconds : (info.isBreak ? cfg.break : cfg.focus);
        _savePomo({ running: true, startedAt: Math.floor(Date.now() / 1000), duration, isBreak: info.isBreak });
        _startPomoTick();
    }
    updatePomoDisplay();
}

function resetPomo() {
    if (pomoTick) { clearInterval(pomoTick); pomoTick = null; }
    const cfg = _loadPomoConfig();
    _savePomo({ running: false, remaining: cfg.focus, isBreak: false });
    updatePomoDisplay();
}

if (_pomoChannel) {
    _pomoChannel.onmessage = () => {
        const info = _getPomoSeconds();
        if (info.running && !pomoTick) _startPomoTick();
        if (!info.running && pomoTick) { clearInterval(pomoTick); pomoTick = null; }
        updatePomoDisplay();
    };
}

function _pomoInit() {
    _syncCustomInputs();
    const info = _getPomoSeconds();
    if (info.finished) _pomoFinish(info.isBreak);
    else if (info.running) _startPomoTick();
    updatePomoDisplay();
}

function openPomo() { document.getElementById("pomo-overlay").classList.add("open"); _syncCustomInputs(); updatePomoDisplay(); }
function closePomo() { document.getElementById("pomo-overlay").classList.remove("open"); }
function mobOpenPomo() { document.getElementById("mob-pomo-overlay").classList.add("open"); _syncCustomInputs(); updatePomoDisplay(); }
function closeMobPomo() { document.getElementById("mob-pomo-overlay").classList.remove("open"); }
document.getElementById("pomo-open")?.addEventListener("click", openPomo);

// ========== NAVIGATION ==========
function profile() { window.location.href = "/profile"; }

async function logOut() {
    try {
        const res = await fetch("/logout", { method: "POST" });
        const data = await res.json();
        if (data.status === "success") { showToast("Logged out"); setTimeout(() => location.href = "/", 600); }
    } catch { showToast("Logout failed"); }
}

// ========== TOAST ==========
function showToast(msg) {
    const container = document.getElementById("toast-container"); if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i data-lucide="info" style="width:14px;height:14px;color:var(--getsuga);flex-shrink:0"></i>${escHtml(msg)}`;
    container.appendChild(toast); lucide.createIcons();
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 2800);
}

// ========== PIXEL AVATAR GENERATOR ==========
function generatePixelAvatar(seed, size=12) {
    const canvas = document.createElement('canvas');
    const scale = 10;
    canvas.width = size * scale; canvas.height = size * scale;
    const ctx = canvas.getContext('2d');
    let hash = 0;
    const str = seed + "salt";
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const rng = () => { const x = Math.sin(hash++) * 10000; return x - Math.floor(x); };
    const bgColors = ['#1a1a1a','#1e3a8a','#4c1d95','#052e16','#7f1d1d','#333'];
    const skinColors = ['#fdd0b1','#e0ac69','#8d5524','#c68642','#f1c27d'];
    const hairColors = ['#0f0f0f','#4a2c2a','#e6c35c','#8d2d2d','#5e3a28','#ff6b00','#00d2ff'];
    const shirtColors = ['#ef4444','#3b82f6','#10b981','#f59e0b','#8b5cf6'];
    const bg = bgColors[Math.floor(rng()*bgColors.length)];
    const skin = skinColors[Math.floor(rng()*skinColors.length)];
    const hair = hairColors[Math.floor(rng()*hairColors.length)];
    const shirt = shirtColors[Math.floor(rng()*shirtColors.length)];
    const rect = (x,y,w,h,c) => { ctx.fillStyle = c; ctx.fillRect(x*scale,y*scale,w*scale,h*scale); };
    rect(0,0,size,size,bg); rect(3,3,6,6,skin); rect(4,9,4,2,skin); rect(2,10,8,2,shirt);
    const ht = Math.floor(rng()*3);
    if(ht===0){rect(3,2,6,2,hair);rect(2,3,1,4,hair);rect(9,3,1,4,hair);}
    else if(ht===1){rect(3,1,6,3,hair);rect(1,3,2,5,hair);rect(9,3,2,5,hair);}
    else{rect(3,2,6,1,skin);}
    const eyeColor = rng()>0.8?'#00d2ff':'#000';
    rect(4,5,1,1,eyeColor); rect(7,5,1,1,eyeColor);
    if(rng()>0.5)rect(5,7,2,1,'#000'); else rect(5,7,2,1,'#a00');
    if(rng()>0.7){rect(3,5,6,1,'#fff');ctx.fillStyle='rgba(0,200,255,0.5)';ctx.fillRect(3*scale,5*scale,2*scale,1*scale);ctx.fillRect(7*scale,5*scale,2*scale,1*scale);}
    return canvas.toDataURL();
}

// ========== INIT ==========
function setAvatarElements(src) {
    const dkAvatar = document.getElementById('dk-avatar');
    const mobAvatar = document.getElementById('mob-avatar');
    if (dkAvatar) dkAvatar.src = src;
    if (mobAvatar) mobAvatar.src = src;
}

function loadUserAvatar() {
    if (typeof SHINGAKU_USER === 'undefined') return;
    const ddUser = document.getElementById('dd-user');
    if (ddUser && SHINGAKU_USER.username) ddUser.textContent = SHINGAKU_USER.username;
    let avatar = SHINGAKU_USER.avatar;
    if (!avatar && SHINGAKU_USER.username) {
        try {
            avatar = generatePixelAvatar(SHINGAKU_USER.username);
            fetch('/set_avatar', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({src:avatar})}).catch(()=>{});
        } catch {}
    }
    if (avatar) setAvatarElements(avatar);
}

function dismissBootScreen() {
    const bs = document.getElementById('boot-screen'); if (!bs) return;
    bs.classList.add('fade-out');
    setTimeout(() => { bs.style.display = 'none'; }, 600);
}

async function init() {
    applyTheme();
    loadUserAvatar();
    renderGreeting();
    fetchNotifications();
    initBrowserNotifications();
    _pomoInit();

    // Load live data from server then render
    await loadAllDashboardData();
    renderStats();
    renderHighlight();
    renderAttendanceBar();
    renderSchedule();
    renderTodos();

    setInterval(fetchNotifications, 30000);
    requestAnimationFrame(() => setTimeout(dismissBootScreen, 300));
}

document.addEventListener("DOMContentLoaded", init);
