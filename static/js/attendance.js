
let SCHEDULE = {};
let SELECTED_GROUP = '';
let STATS = {};

function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function loadAll() {
    await Promise.all([loadSchedule(), loadGroup(), loadStats()]);
    render();
}

async function loadSchedule() {
    try {
        const res = await fetch('/api/calendar/schedule');
        const json = await res.json();
        if (json.status === 'success' && json.schedule) {
            SCHEDULE = normalize(json.schedule);
        }
    } catch {}
}

function normalize(raw) {
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

async function loadGroup() {
    try {
        const res = await fetch('/api/calendar/group');
        const json = await res.json();
        if (json.status === 'success') SELECTED_GROUP = json.group || '';
    } catch {}
}

async function loadStats() {
    try {
        const res = await fetch('/api/calendar/attendance_stats');
        const json = await res.json();
        if (json.status === 'success' && json.stats) STATS = json.stats;
    } catch {}
}

async function setGroup(group) {
    SELECTED_GROUP = group;
    try {
        await fetch('/api/calendar/group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group })
        });
    } catch {}
    render();
    showToast(`Group set to ${group}`);
}
function getSubjects() {
    const sched = SCHEDULE.schedule || {};
    const subjects = new Set();
    for (const daySlots of Object.values(sched)) {
        for (const entry of daySlots) {
            for (const slot of (entry.slots || [])) {
                if (slot.group === 'ALL' || !SELECTED_GROUP || slot.group === SELECTED_GROUP) {
                    subjects.add(slot.name);
                }
            }
        }
    }
    return [...subjects];
}

function hasMultipleGroups() {
    const g = SCHEDULE.groups || ['ALL'];
    return g.length > 1 || (g.length === 1 && g[0] !== 'ALL');
}

function render() {
    const subjects = getSubjects();
    const hasData = subjects.length > 0;

    const groupEls = [document.getElementById('att-group-section'), document.getElementById('mob-att-group-section')];
    if (hasMultipleGroups()) {
        const groups = SCHEDULE.groups || [];
        const html = `<div class="att-group-label"><i data-lucide="users" style="width:14px;height:14px;vertical-align:-2px;margin-right:6px"></i>Your Group</div>
            <div class="att-group-chips">
                ${groups.map(g => `<button class="att-group-chip${SELECTED_GROUP === g ? ' active' : ''}" onclick="setGroup('${escHtml(g)}')">${escHtml(g)}</button>`).join('')}
            </div>`;
        groupEls.forEach(el => { if (el) el.innerHTML = html; });

        const mobEl = document.getElementById('mob-att-group-section');
        if (mobEl) {
            mobEl.innerHTML = groups.map(g => `<button class="att-group-chip${SELECTED_GROUP === g ? ' active' : ''}" onclick="setGroup('${escHtml(g)}')">${escHtml(g)}</button>`).join('');
        }
    } else {
        groupEls.forEach(el => { if (el) el.innerHTML = ''; });
    }

    ['att-empty', 'mob-att-empty'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = hasData ? 'none' : 'flex';
    });

    if (!hasData) {
        ['att-cards', 'mob-att-cards'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        ['att-overall', 'mob-att-overall'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = '--'; el.className = 'att-overall-badge neutral'; }
        });
        lucide.createIcons();
        return;
    }

    let cardsHtml = '';
    let overallAttended = 0, overallTotal = 0;

    for (const subj of subjects) {
        const s = STATS[subj] || { attended: 0, total: 0, cancelled: 0 };
        const pct = s.total > 0 ? Math.round((s.attended / s.total) * 100) : 0;
        const isSafe = pct >= 70;
        const pctClass = pct >= 75 ? 'good' : pct >= 70 ? 'warn' : s.total === 0 ? 'neutral' : 'bad';

        overallAttended += s.attended;
        overallTotal += s.total;

        let canMiss = 0;
        if (s.total > 0 && isSafe) {
            canMiss = Math.floor(s.attended / 0.7) - s.total;
            if (canMiss < 0) canMiss = 0;
        }
        let needToAttend = 0;
        if (s.total > 0 && pct < 70) {
            let a = s.attended, t = s.total;
            while (a / t < 0.7) { a++; t++; needToAttend++; }
        }

        const statusText = s.total === 0
            ? 'No classes yet'
            : isSafe
                ? `Safe \u2022 can miss ${canMiss} more`
                : `Attend next ${needToAttend} to reach 70%`;

        const cancelledText = s.cancelled > 0 ? `<span class="att-card-cancelled">${s.cancelled} cancelled</span>` : '';

        cardsHtml += `<div class="att-card">
            <div class="att-card-header">
                <div class="att-card-subject">${escHtml(subj)}</div>
                <div class="att-card-pct ${pctClass}">${pct}%</div>
            </div>
            <div class="att-progress-track">
                <div class="att-progress-fill ${pctClass}" style="width:${Math.min(pct, 100)}%"></div>
                <div class="att-progress-threshold" style="left:70%"></div>
            </div>
            <div class="att-card-stats">
                <span class="att-card-count">${s.attended}/${s.total} attended</span>
                ${cancelledText}
                <span class="att-card-status ${pctClass}">${statusText}</span>
            </div>
        </div>`;
    }

    const dkCards = document.getElementById('att-cards');
    const mobCards = document.getElementById('mob-att-cards');
    if (dkCards) dkCards.innerHTML = cardsHtml;
    if (mobCards) mobCards.innerHTML = cardsHtml;

    const overallPct = overallTotal > 0 ? Math.round((overallAttended / overallTotal) * 100) : 0;
    const overallClass = overallPct >= 75 ? 'good' : overallPct >= 70 ? 'warn' : overallTotal === 0 ? 'neutral' : 'bad';
    ['att-overall', 'mob-att-overall'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = overallTotal > 0 ? `${overallPct}% (${overallAttended}/${overallTotal})` : '--';
            el.className = `att-overall-badge ${id.includes('mob') ? 'mob ' : ''}${overallClass}`;
        }
    });

    lucide.createIcons();
}

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
    showToast(next==='light'?'Light mode':'Dark mode');
}
function updateThemeIcons(theme) {
    const icon = theme === 'light' ? 'moon' : 'sun';
    document.querySelectorAll('#theme-toggle i, #mob-theme-toggle i').forEach(el => el.setAttribute('data-lucide', icon));
    lucide.createIcons();
}

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


function dismissBoot() { const bs = document.getElementById('boot-screen'); if (!bs) return; bs.classList.add('fade-out'); setTimeout(() => bs.style.display='none', 600); }

async function init() {
    applyTheme();
    if (typeof SHINGAKU_USER !== 'undefined' && SHINGAKU_USER.username) {
        const dd = document.getElementById('dd-user'); if (dd) dd.textContent = SHINGAKU_USER.username;
    }
    await loadAll();
    requestAnimationFrame(() => setTimeout(dismissBoot, 300));
}

document.addEventListener('DOMContentLoaded', init);
