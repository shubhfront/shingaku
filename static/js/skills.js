// ── Skills Roadmap Generator ──
(function(){

// ── Theme ──
const saved = localStorage.getItem('shingaku-theme');
if(saved === 'light') document.body.classList.add('light-theme');

function toggleTheme(){
    document.body.classList.toggle('light-theme');
    localStorage.setItem('shingaku-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
}
window.toggleTheme = toggleTheme;

const themeBtn = document.getElementById('theme-toggle');
if(themeBtn) themeBtn.addEventListener('click', toggleTheme);
const mobThemeBtn = document.getElementById('mob-theme-toggle');
if(mobThemeBtn) mobThemeBtn.addEventListener('click', toggleTheme);

// ── Sidebar ──
const sidebar = document.getElementById('dk-sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
if(sidebarToggle && sidebar){
    const collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if(collapsed) sidebar.classList.add('collapsed');
    sidebarToggle.addEventListener('click', ()=>{
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
    });
}

// ── Boot screen ──
window.addEventListener('load', ()=>{
    const boot = document.getElementById('boot-screen');
    if(boot){
        setTimeout(()=>{ boot.classList.add('fade-out'); }, 400);
        setTimeout(()=>{ boot.style.display='none'; }, 900);
    }
    lucide.createIcons();
});

// ── State ──
let selectedSkill = '';
let currentRoadmap = null;

// ── Category config ──
const CAT_COLORS = {
    foundation: {color:'#ff7b00', bg:'rgba(255,123,0,.08)', border:'rgba(255,123,0,.25)'},
    core:       {color:'#00f2ff', bg:'rgba(0,242,255,.08)',  border:'rgba(0,242,255,.25)'},
    specialization:{color:'#8b5cf6',bg:'rgba(139,92,246,.08)',border:'rgba(139,92,246,.25)'},
    project:    {color:'#22c55e', bg:'rgba(34,197,94,.08)',  border:'rgba(34,197,94,.25)'},
    advanced:   {color:'#ec4899', bg:'rgba(236,72,153,.08)', border:'rgba(236,72,153,.25)'},
};

// ── Sync tag selection across desktop & mobile ──
function syncTags(value){
    document.querySelectorAll('.sk-tag').forEach(t => {
        t.classList.toggle('active', t.dataset.value === value);
    });
    document.querySelectorAll('.sk-custom-input').forEach(inp => {
        if(value) inp.value = '';
    });
}

// ── Tag click handlers ──
document.querySelectorAll('.sk-tag').forEach(tag => {
    tag.addEventListener('click', ()=>{
        const val = tag.dataset.value;
        if(selectedSkill === val){
            selectedSkill = '';
            syncTags('');
        } else {
            selectedSkill = val;
            syncTags(val);
        }
        updateGenerateBtn();
    });
});

// ── Custom input ──
document.querySelectorAll('.sk-custom-input').forEach(inp => {
    inp.addEventListener('input', ()=>{
        const val = inp.value.trim();
        if(val){
            selectedSkill = val;
            document.querySelectorAll('.sk-tag').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.sk-custom-input').forEach(i => {
                if(i !== inp) i.value = val;
            });
        } else {
            selectedSkill = '';
        }
        updateGenerateBtn();
    });
    inp.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' && selectedSkill) generateRoadmap();
    });
});

function updateGenerateBtn(){
    document.querySelectorAll('.sk-generate-btn').forEach(btn => {
        btn.disabled = !selectedSkill;
    });
}

// ── Generate button ──
document.querySelectorAll('.sk-generate-btn').forEach(btn => {
    btn.addEventListener('click', ()=>{
        if(selectedSkill) generateRoadmap();
    });
});

// ── Reset button ──
document.querySelectorAll('.sk-reset-btn').forEach(btn => {
    btn.addEventListener('click', resetView);
});

// ── Generate ──
async function generateRoadmap(){
    showLoading();
    try {
        const res = await fetch('/api/skills/generate_roadmap', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({speciality: selectedSkill})
        });
        const data = await res.json();
        if(data.status === 'success'){
            currentRoadmap = data.roadmap;
            renderRoadmap(data.roadmap);
        } else {
            alert(data.message || 'Failed to generate roadmap');
            resetView();
        }
    } catch(err){
        console.error(err);
        alert('Network error. Please try again.');
        resetView();
    }
}

function showLoading(){
    ['sk-picker','mob-sk-picker'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
    ['sk-loading','mob-sk-loading'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='flex'; });
    ['sk-roadmap','mob-sk-roadmap'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
}

function resetView(){
    ['sk-picker','mob-sk-picker'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display=''; });
    ['sk-loading','mob-sk-loading'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
    ['sk-roadmap','mob-sk-roadmap'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
}

// ══════════════════════════════════════════════
//  MODULAR GRAPH LAYOUT
// ══════════════════════════════════════════════

function computeLevels(modules){
    // Build adjacency & compute topological levels
    const idMap = {};
    modules.forEach((m,i) => { idMap[m.id] = i; });

    const levels = new Array(modules.length).fill(0);
    let changed = true;
    let iter = 0;
    while(changed && iter < 50){
        changed = false;
        iter++;
        modules.forEach((m,i) => {
            (m.prerequisites || []).forEach(pid => {
                const pi = idMap[pid];
                if(pi !== undefined && levels[i] <= levels[pi]){
                    levels[i] = levels[pi] + 1;
                    changed = true;
                }
            });
        });
    }

    // Group by level
    const grouped = {};
    let maxLevel = 0;
    modules.forEach((m,i) => {
        const lv = levels[i];
        if(lv > maxLevel) maxLevel = lv;
        if(!grouped[lv]) grouped[lv] = [];
        grouped[lv].push({module: m, index: i, level: lv});
    });

    return {grouped, maxLevel, levels, idMap};
}

function renderRoadmap(roadmap){
    ['','mob-'].forEach(prefix => {
        const loading = document.getElementById(prefix + 'sk-loading');
        const roadmapEl = document.getElementById(prefix + 'sk-roadmap');
        const header = document.getElementById(prefix + 'sk-roadmap-header');
        const flow = document.getElementById(prefix + 'sk-flow');
        if(!roadmapEl) return;

        if(loading) loading.style.display = 'none';
        roadmapEl.style.display = '';

        // Header
        const totalHours = (roadmap.modules||[]).reduce((s,m)=> s+(m.estimated_hours||0), 0);
        const totalTopics = (roadmap.modules||[]).reduce((s,m)=> s+(m.topics||[]).length, 0);
        header.innerHTML = `
            <h2>${escHtml(roadmap.title)}</h2>
            <p>${escHtml(roadmap.description)}</p>
            <div class="sk-roadmap-stats">
                <span class="sk-stat-chip"><i data-lucide="box" style="width:12px;height:12px"></i>${(roadmap.modules||[]).length} Modules</span>
                <span class="sk-stat-chip"><i data-lucide="layers" style="width:12px;height:12px"></i>${totalTopics} Topics</span>
                <span class="sk-stat-chip"><i data-lucide="clock" style="width:12px;height:12px"></i>~${totalHours}h Total</span>
            </div>
            <div class="sk-legend">
                <span class="sk-legend-item" style="--lc:#ff7b00"><span class="sk-legend-dot"></span>Foundation</span>
                <span class="sk-legend-item" style="--lc:#00f2ff"><span class="sk-legend-dot"></span>Core</span>
                <span class="sk-legend-item" style="--lc:#8b5cf6"><span class="sk-legend-dot"></span>Specialization</span>
                <span class="sk-legend-item" style="--lc:#22c55e"><span class="sk-legend-dot"></span>Project</span>
                <span class="sk-legend-item" style="--lc:#ec4899"><span class="sk-legend-dot"></span>Advanced</span>
            </div>
        `;

        // Build modular graph
        const modules = roadmap.modules || [];
        const {grouped, maxLevel, levels, idMap} = computeLevels(modules);

        flow.innerHTML = '';

        // SVG for connector lines (desktop only, not prefix mob-)
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'sk-graph-svg');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '0';
        flow.style.position = 'relative';
        flow.appendChild(svg);

        // Render levels
        for(let lv = 0; lv <= maxLevel; lv++){
            const items = grouped[lv] || [];
            const levelRow = document.createElement('div');
            levelRow.className = 'sk-graph-level';
            levelRow.dataset.level = lv;

            // Level label
            const levelLabel = document.createElement('div');
            levelLabel.className = 'sk-level-label';
            const labelTexts = ['START', 'LEVEL 1', 'LEVEL 2', 'LEVEL 3', 'LEVEL 4', 'LEVEL 5', 'LEVEL 6', 'LEVEL 7', 'LEVEL 8'];
            levelLabel.textContent = labelTexts[lv] || ('LEVEL ' + lv);
            levelRow.appendChild(levelLabel);

            const nodesWrap = document.createElement('div');
            nodesWrap.className = 'sk-graph-nodes';

            items.forEach(({module: m, index: mi}) => {
                const cat = (m.category || 'core').toLowerCase();
                const cc = CAT_COLORS[cat] || CAT_COLORS.core;
                const topicCount = (m.topics || []).length;
                const hours = m.estimated_hours || 0;

                const node = document.createElement('div');
                node.className = 'sk-node';
                node.dataset.id = m.id;
                node.dataset.index = mi;
                node.style.setProperty('--node-color', cc.color);
                node.style.setProperty('--node-bg', cc.bg);
                node.style.setProperty('--node-border', cc.border);

                // Prerequisite arrows indicator
                const prereqCount = (m.prerequisites || []).length;
                const prereqLabel = prereqCount > 0 ? `<span class="sk-node-prereq">${prereqCount} prereq${prereqCount>1?'s':''}</span>` : '<span class="sk-node-prereq sk-no-prereq">Entry point</span>';

                node.innerHTML = `
                    <div class="sk-node-accent"></div>
                    <div class="sk-node-cat">${escHtml(cat)}</div>
                    <div class="sk-node-name">${escHtml(m.name)}</div>
                    <div class="sk-node-desc">${escHtml(m.description || '')}</div>
                    <div class="sk-node-meta">
                        <span><i data-lucide="layers" style="width:10px;height:10px"></i>${topicCount} topics</span>
                        <span><i data-lucide="clock" style="width:10px;height:10px"></i>~${hours}h</span>
                        ${prereqLabel}
                    </div>
                    <div class="sk-node-expand"><i data-lucide="chevron-down" style="width:12px;height:12px"></i>Explore Topics</div>
                `;

                node.addEventListener('click', ()=> toggleNodeExpand(node, m, mi));
                nodesWrap.appendChild(node);
            });

            levelRow.appendChild(nodesWrap);
            flow.appendChild(levelRow);
        }

        lucide.createIcons();

        // Draw SVG connectors after layout settles
        requestAnimationFrame(()=> requestAnimationFrame(()=> drawConnectors(flow, svg, modules, idMap)));
    });
}

function drawConnectors(flow, svg, modules, idMap){
    // Clear existing
    while(svg.firstChild) svg.removeChild(svg.firstChild);

    const flowRect = flow.getBoundingClientRect();
    const svgNS = 'http://www.w3.org/2000/svg';

    // Set SVG dimensions
    svg.setAttribute('width', flow.scrollWidth);
    svg.setAttribute('height', flow.scrollHeight);
    svg.style.width = flow.scrollWidth + 'px';
    svg.style.height = flow.scrollHeight + 'px';

    modules.forEach(m => {
        const targetNode = flow.querySelector(`.sk-node[data-id="${CSS.escape(m.id)}"]`);
        if(!targetNode) return;

        (m.prerequisites || []).forEach(pid => {
            const sourceNode = flow.querySelector(`.sk-node[data-id="${CSS.escape(pid)}"]`);
            if(!sourceNode) return;

            const sRect = sourceNode.getBoundingClientRect();
            const tRect = targetNode.getBoundingClientRect();

            const x1 = sRect.left + sRect.width/2 - flowRect.left;
            const y1 = sRect.bottom - flowRect.top;
            const x2 = tRect.left + tRect.width/2 - flowRect.left;
            const y2 = tRect.top - flowRect.top;

            const midY = (y1 + y2) / 2;

            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
            path.setAttribute('class', 'sk-connector');
            svg.appendChild(path);

            // Arrow
            const arrow = document.createElementNS(svgNS, 'circle');
            arrow.setAttribute('cx', x2);
            arrow.setAttribute('cy', y2);
            arrow.setAttribute('r', 3);
            arrow.setAttribute('class', 'sk-connector-dot');
            svg.appendChild(arrow);
        });
    });
}

// ── Expand node to show topics ──
function toggleNodeExpand(nodeEl, module, moduleIndex){
    const existing = nodeEl.querySelector('.sk-node-topics');
    if(existing){
        existing.remove();
        nodeEl.classList.remove('expanded');
        // Redraw connectors
        const flow = nodeEl.closest('.sk-flow');
        const svg = flow.querySelector('.sk-graph-svg');
        if(flow && svg){
            requestAnimationFrame(()=> drawConnectors(flow, svg, currentRoadmap.modules, computeLevels(currentRoadmap.modules).idMap));
        }
        return;
    }

    nodeEl.classList.add('expanded');

    const topicsWrap = document.createElement('div');
    topicsWrap.className = 'sk-node-topics';

    (module.topics || []).forEach((topic, ti) => {
        const diff = (topic.difficulty || 'intermediate').toLowerCase();
        const diffColors = {beginner:'#22c55e', intermediate:'#f59e0b', advanced:'#ef4444'};
        const dc = diffColors[diff] || '#f59e0b';

        const topicEl = document.createElement('div');
        topicEl.className = 'sk-topic-card';
        topicEl.innerHTML = `
            <div class="sk-topic-top">
                <div class="sk-topic-name">${escHtml(topic.name)}</div>
                <span class="sk-topic-diff" style="color:${dc};border-color:${dc}">${diff}</span>
            </div>
            <div class="sk-topic-desc">${escHtml(topic.description || '')}</div>
            <div class="sk-topic-hint"><i data-lucide="external-link" style="width:10px;height:10px"></i>View Resources</div>
        `;
        topicEl.addEventListener('click', (e)=>{
            e.stopPropagation();
            openSkillModal(moduleIndex, ti);
        });
        topicsWrap.appendChild(topicEl);
    });

    nodeEl.appendChild(topicsWrap);
    lucide.createIcons();

    // Redraw connectors since heights changed
    const flow = nodeEl.closest('.sk-flow');
    const svg = flow.querySelector('.sk-graph-svg');
    if(flow && svg){
        requestAnimationFrame(()=> drawConnectors(flow, svg, currentRoadmap.modules, computeLevels(currentRoadmap.modules).idMap));
    }
}

// ── Modal ──
const modal = document.getElementById('sk-modal');
const modalClose = document.getElementById('sk-modal-close');

if(modalClose){
    modalClose.addEventListener('click', ()=>{ modal.classList.remove('open'); });
}
if(modal){
    modal.addEventListener('click', (e)=>{ if(e.target === modal) modal.classList.remove('open'); });
}

function openSkillModal(moduleIdx, topicIdx){
    if(!currentRoadmap) return;
    const mod = currentRoadmap.modules[moduleIdx];
    if(!mod) return;
    const topic = mod.topics[topicIdx];
    if(!topic) return;

    document.getElementById('sk-modal-topic').textContent = topic.name;
    document.getElementById('sk-modal-desc').textContent = topic.description || '';

    const body = document.getElementById('sk-modal-body');
    let html = '';
    const res = topic.resources || {};

    // Books
    if(res.books && res.books.length){
        html += `<div class="sk-res-section">
            <div class="sk-res-label"><i data-lucide="book-open" style="width:12px;height:12px"></i>Books (OpenLibrary)</div>`;
        res.books.forEach(b => {
            html += `<a class="sk-res-item" href="${escAttr(b.url)}" target="_blank" rel="noopener">
                <div class="sk-res-icon book"><i data-lucide="book-open" style="width:14px;height:14px"></i></div>
                <div class="sk-res-info">
                    <div class="sk-res-title">${escHtml(b.title)}</div>
                    <div class="sk-res-meta">${escHtml(b.author || 'OpenLibrary')}</div>
                </div>
            </a>`;
        });
        html += `</div>`;
    }

    // Courses
    if(res.courses && res.courses.length){
        html += `<div class="sk-res-section">
            <div class="sk-res-label"><i data-lucide="graduation-cap" style="width:12px;height:12px"></i>Free Courses</div>`;
        res.courses.forEach(c => {
            html += `<a class="sk-res-item" href="${escAttr(c.url)}" target="_blank" rel="noopener">
                <div class="sk-res-icon course"><i data-lucide="graduation-cap" style="width:14px;height:14px"></i></div>
                <div class="sk-res-info">
                    <div class="sk-res-title">${escHtml(c.title)}</div>
                    <div class="sk-res-meta">${escHtml(c.platform || '')}</div>
                </div>
            </a>`;
        });
        html += `</div>`;
    }

    // YouTube
    if(res.youtube && res.youtube.length){
        html += `<div class="sk-res-section">
            <div class="sk-res-label"><i data-lucide="play-circle" style="width:12px;height:12px"></i>YouTube</div>`;
        res.youtube.forEach(y => {
            html += `<a class="sk-res-item" href="${escAttr(y.url)}" target="_blank" rel="noopener">
                <div class="sk-res-icon youtube"><i data-lucide="play-circle" style="width:14px;height:14px"></i></div>
                <div class="sk-res-info">
                    <div class="sk-res-title">${escHtml(y.title)}</div>
                    <div class="sk-res-meta">${escHtml(y.channel || '')}</div>
                </div>
            </a>`;
        });
        html += `</div>`;
    }

    if(!html){
        html = '<p style="color:var(--text-dim);font-size:12px;text-align:center;padding:20px">No resources available for this topic.</p>';
    }

    body.innerHTML = html;
    modal.classList.add('open');
    lucide.createIcons();
}
window.openSkillModal = openSkillModal;

// ── Redraw connectors on resize ──
let resizeTimer;
window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(()=>{
        if(!currentRoadmap) return;
        ['sk-flow','mob-sk-flow'].forEach(id => {
            const flow = document.getElementById(id);
            if(!flow) return;
            const svg = flow.querySelector('.sk-graph-svg');
            if(!svg) return;
            const {idMap} = computeLevels(currentRoadmap.modules);
            drawConnectors(flow, svg, currentRoadmap.modules, idMap);
        });
    }, 200);
});

// ── Escape ──
function escHtml(str){
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
function escAttr(str){
    return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

})();
