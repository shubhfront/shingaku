lucide.createIcons();

/* =============================================
   STATE & DATA
   ============================================= */
let DB = { subjects: [], chapters: {}, resources: {} };
let currentSubject = null;
let currentChapter = 'all';
let uploadedFile = null;
let selectedPdf = null; // { title, link, driveId }
let cbtPdf = null;      // pdfjs doc
let cbtPage = 1;
let cbtTotal = 0;
let cbtTimerInterval = null;
let cbtSeconds = 0;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function getSubject(id) { return DB.subjects.find(s => s.id === id); }

/* Collect test PDFs only (from 'Question Papers' chapters) */
function getPdfsForSubject(subId) {
    const pdfs = [];
    const subRes = DB.resources[subId];
    if (!subRes) return pdfs;
    const chapters = DB.chapters[subId] || [];
    for (const chap of chapters) {
        if (!chap.title.toLowerCase().includes('question paper')) continue;
        const chapRes = subRes[chap.id];
        if (!chapRes) continue;
        const notes = chapRes.notes || [];
        for (const n of notes) {
            if (n.type === 'PDF') {
                pdfs.push({ title: n.title, link: n.link, driveId: n.driveId, chapId: chap.id, chapTitle: chap.title });
            }
        }
    }
    return pdfs;
}

function countPdfs() {
    let total = 0;
    for (const s of DB.subjects) {
        total += getPdfsForSubject(s.id).length;
    }
    return total;
}

/* =============================================
   THEME
   ============================================= */
function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('ts_theme', isLight ? 'light' : 'dark');
    document.querySelectorAll('.icon-sun').forEach(e => e.classList.toggle('hidden', !isLight));
    document.querySelectorAll('.icon-moon').forEach(e => e.classList.toggle('hidden', isLight));
    lucide.createIcons();
}

(function initTheme() {
    if (localStorage.getItem('ts_theme') === 'light') {
        document.body.classList.add('light-theme');
    }
    document.querySelectorAll('.icon-sun').forEach(e => e.classList.toggle('hidden', !document.body.classList.contains('light-theme')));
    document.querySelectorAll('.icon-moon').forEach(e => e.classList.toggle('hidden', document.body.classList.contains('light-theme')));
})();

/* =============================================
   FILE UPLOAD
   ============================================= */
function setupUpload(zoneId, inputId, idleId, activeId, fileNameId, fileSizeId) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const idle = document.getElementById(idleId);
    const active = document.getElementById(activeId);
    if (!zone || !input) return;

    zone.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        input.click();
    });

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault(); zone.classList.remove('dragover');
        const f = e.dataTransfer.files[0];
        if (f && f.type === 'application/pdf') handleFile(f, idle, active, fileNameId, fileSizeId);
    });

    input.addEventListener('change', () => {
        if (input.files[0]) handleFile(input.files[0], idle, active, fileNameId, fileSizeId);
    });
}

function handleFile(f, idle, active, fileNameId, fileSizeId) {
    uploadedFile = f;
    document.getElementById(fileNameId).textContent = f.name;
    document.getElementById(fileSizeId).textContent = (f.size / 1024 / 1024).toFixed(2) + ' MB';
    idle.classList.add('hidden');
    active.classList.remove('hidden');
    // Sync both upload zones
    syncUploadUI();
}

function syncUploadUI() {
    // Desktop
    const dkIdle = document.getElementById('dkUploadIdle');
    const dkActive = document.getElementById('dkUploadActive');
    // Mobile
    const mIdle = document.getElementById('mobUploadIdle');
    const mActive = document.getElementById('mobUploadActive');
    if (uploadedFile) {
        dkIdle?.classList.add('hidden'); dkActive?.classList.remove('hidden');
        mIdle?.classList.add('hidden'); mActive?.classList.remove('hidden');
        ['dkFileName','mobFileName'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = uploadedFile.name; });
        ['dkFileSize','mobFileSize'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = (uploadedFile.size/1024/1024).toFixed(2)+' MB'; });
    } else {
        dkIdle?.classList.remove('hidden'); dkActive?.classList.add('hidden');
        mIdle?.classList.remove('hidden'); mActive?.classList.add('hidden');
    }
}

function clearUpload() {
    uploadedFile = null;
    document.getElementById('dkPdfInput').value = '';
    document.getElementById('mobPdfInput').value = '';
    syncUploadUI();
}

function startCBTFromUpload() {
    if (!uploadedFile) return;
    const formData = new FormData();
    formData.append('pdf', uploadedFile);

    // Show loading state on buttons
    document.querySelectorAll('.dk-btn-primary, .mob-btn-primary').forEach(btn => {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Processing...';
    });
    lucide.createIcons();

    fetch('/pdf_to_cbt', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                try { const j = JSON.parse(text); throw new Error(j.message || 'Failed'); } catch(e) { if (e.message !== 'Failed') throw e; throw new Error(text.slice(0, 200)); }
            });
        }
        return response.text();
    })
    .then(html => {
        document.open();
        document.write(html);
        document.close();
    })
    .catch(err => {
        console.error('PDF to CBT error:', err);
        alert('CBT Error: ' + err.message);
        document.querySelectorAll('.dk-btn-primary, .mob-btn-primary').forEach(btn => {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="zap" class="w-4 h-4"></i> Start CBT';
        });
        lucide.createIcons();
    });
}

/* =============================================
   DESKTOP RENDERING
   ============================================= */
function dkRenderSubjects() {
    const el = document.getElementById('dkSubjectList');
    if (!el) return;
    el.innerHTML = DB.subjects.map((s, i) => `<div class="dk-sub-btn anim-slide ${s.id === currentSubject ? 'active' : ''}" style="animation-delay:${i * 0.04}s" onclick="dkSelectSubject('${s.id}')">
            <div class="dk-sub-icon" style="background:${s.id === currentSubject ? s.color + '22' : 'rgba(255,255,255,0.04)'};">
                <i data-lucide="${s.icon}" class="w-[18px] h-[18px]" style="color:${s.id === currentSubject ? s.color : 'var(--text-muted)'};"></i>
            </div>
            <div class="dk-sub-info">
                <span class="dk-sub-name">${s.short || s.name}</span>
                <span class="dk-sub-meta">${getPdfsForSubject(s.id).length} PDFs</span>
            </div>
        </div>`).join('');
    lucide.createIcons();
}

function dkRenderChapterFilter() {
    // No chapter filter needed — only question papers are shown
}

function dkRenderPdfs() {
    const el = document.getElementById('dkPdfList');
    if (!el || !currentSubject) return;
    const sub = getSubject(currentSubject);
    let pdfs = getPdfsForSubject(currentSubject);
    if (currentChapter !== 'all') pdfs = pdfs.filter(p => p.chapId === currentChapter);

    const countEl = document.getElementById('dkPdfCount2');
    if (countEl) countEl.textContent = pdfs.length;
    const heroBadge = document.getElementById('dkPdfCount');
    if (heroBadge) heroBadge.textContent = pdfs.length + ' PDFs';

    if (pdfs.length === 0) {
        el.innerHTML = `<div class="dk-empty">
            <div class="dk-empty-icon"><i data-lucide="inbox" class="w-7 h-7 text-neutral-600"></i></div>
            <p class="text-sm font-bold text-neutral-500">No PDFs found</p>
            <p class="text-[10px] text-neutral-600 font-bold mt-1">Try a different chapter or subject</p>
        </div>`;
        lucide.createIcons();
        return;
    }

    el.innerHTML = pdfs.map((p, i) => `<div class="dk-pdf-card anim-card" style="animation-delay:${i * 0.04}s" onclick="openModeModal('${encodeURIComponent(JSON.stringify(p))}')">
        <div class="dk-pdf-card-row">
            <div class="dk-pdf-card-icon bg-red-900/20 border border-red-800/20">
                <i data-lucide="file-text" class="w-5 h-5 text-red-400"></i>
            </div>
            <div class="dk-pdf-card-info">
                <div class="dk-pdf-card-title">${p.title}</div>
                <div class="dk-pdf-card-meta">${p.chapTitle} &bull; ${sub.short}</div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 dk-pdf-card-chevron"></i>
        </div>
    </div>`).join('');
    lucide.createIcons();
}

function dkSelectSubject(id) {
    currentSubject = id;
    currentChapter = 'all';
    dkRenderSubjects();
    dkRenderChapterFilter();
    dkRenderPdfs();
}

function dkFilterChapter(id) {
    // No-op, chapter filter removed
}

/* =============================================
   MOBILE RENDERING
   ============================================= */
function mobRenderSubjects() {
    const el = document.getElementById('mobSubjectGrid');
    if (!el) return;
    el.innerHTML = DB.subjects.map((s, i) => {
        const pdfCount = getPdfsForSubject(s.id).length;
        return `<div class="mob-sub-card anim-scale" style="--card-glow:${s.color}33; animation-delay:${i * 0.06}s" onclick="mobSelectSubject('${s.id}')">
            <div class="mob-sub-card-icon" style="background:${s.color}22;">
                <i data-lucide="${s.icon}" class="w-5 h-5" style="color:${s.color}"></i>
            </div>
            <div class="mob-sub-card-name">${s.short || s.name}</div>
            <div class="mob-sub-card-meta">${pdfCount} PDFs</div>
        </div>`;
    }).join('');
    document.getElementById('mobPdfCount').textContent = countPdfs() + ' PDFs';
    lucide.createIcons();
}

function mobSelectSubject(id) {
    currentSubject = id;
    currentChapter = 'all';
    const sub = getSubject(id);
    const pdfs = getPdfsForSubject(id);

    document.getElementById('mobSubjectTitle').textContent = sub.name;
    document.getElementById('mobSubjectMeta').textContent = pdfs.length + ' PDFs';
    document.getElementById('mobSubHeroTitle').textContent = sub.short || sub.name;
    document.getElementById('mobSubHeroCount').textContent = pdfs.length + ' PDFs';
    const iconWrap = document.getElementById('mobSubHeroIcon');
    iconWrap.style.background = sub.color;
    iconWrap.innerHTML = `<i data-lucide="${sub.icon}" class="w-5 h-5 text-black"></i>`;

    mobRenderChapterFilter();
    mobRenderPdfs();
    lucide.createIcons();

    // Transition screens
    document.getElementById('mobScreen1').className = 'mob-screen off-left';
    document.getElementById('mobScreen2').className = 'mob-screen center';
}

function mobGoBack() {
    document.getElementById('mobScreen1').className = 'mob-screen center';
    document.getElementById('mobScreen2').className = 'mob-screen off-right';
}

function mobRenderChapterFilter() {
    // No chapter filter needed — only question papers are shown
}

function mobRenderPdfs() {
    const el = document.getElementById('mobPdfList');
    if (!el || !currentSubject) return;
    const sub = getSubject(currentSubject);
    let pdfs = getPdfsForSubject(currentSubject);
    if (currentChapter !== 'all') pdfs = pdfs.filter(p => p.chapId === currentChapter);

    if (pdfs.length === 0) {
        el.innerHTML = `<div class="mob-empty">
            <div class="mob-empty-icon"><i data-lucide="inbox" class="w-6 h-6 text-neutral-600"></i></div>
            <p class="text-xs font-bold text-neutral-500">No PDFs found</p>
        </div>`;
        lucide.createIcons();
        return;
    }

    el.innerHTML = pdfs.map((p, i) => `<div class="mob-pdf-card anim-card" style="animation-delay:${i * 0.04}s" onclick="openModeModal('${encodeURIComponent(JSON.stringify(p))}')">
        <div class="mob-pdf-icon bg-red-900/20 border border-red-800/20">
            <i data-lucide="file-text" class="w-5 h-5 text-red-400"></i>
        </div>
        <div class="mob-pdf-info">
            <div class="mob-pdf-title">${p.title}</div>
            <div class="mob-pdf-meta">${p.chapTitle}</div>
        </div>
        <i data-lucide="chevron-right" class="w-4 h-4 mob-pdf-chevron"></i>
    </div>`).join('');
    lucide.createIcons();
}

/* =============================================
   MODE MODAL
   ============================================= */
function openModeModal(encoded) {
    selectedPdf = JSON.parse(decodeURIComponent(encoded));
    document.getElementById('modalFileName').textContent = selectedPdf.title;
    document.getElementById('modeModal').classList.add('open');
}

function closeModeModal() {
    document.getElementById('modeModal').classList.remove('open');
    selectedPdf = null;
}

function selectMode(mode) {
    if (!selectedPdf) return;
    const pdf = { ...selectedPdf };
    closeModeModal();
    if (mode === 'pdf') {
        openTsPdfViewer(pdf.driveId, pdf.title);
    } else if (mode === 'download') {
        window.open('/view_pdf/' + encodeURIComponent(pdf.driveId) + '?download=1', '_blank');
    } else if (mode === 'cbt') {
        startCBTFromDrive(pdf.driveId, pdf.title);
    }
}

let tsPdfViewerDriveId = null;

function openTsPdfViewer(driveId, title) {
    const overlay = document.getElementById('tsPdfViewerOverlay');
    const iframe = document.getElementById('tsPdfViewerFrame');
    const titleEl = document.getElementById('tsPdfViewerTitle');
    if (!overlay || !iframe) return;
    tsPdfViewerDriveId = driveId;
    titleEl.textContent = title || 'PDF Viewer';
    iframe.src = '/view_pdf/' + encodeURIComponent(driveId);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeTsPdfViewer() {
    const overlay = document.getElementById('tsPdfViewerOverlay');
    const iframe = document.getElementById('tsPdfViewerFrame');
    if (!overlay || !iframe) return;
    overlay.classList.remove('open');
    iframe.src = '';
    tsPdfViewerDriveId = null;
    document.body.style.overflow = '';
}

function downloadTsPdf() {
    if (!tsPdfViewerDriveId) return;
    window.open('/view_pdf/' + encodeURIComponent(tsPdfViewerDriveId) + '?download=1', '_blank');
}

function startCBTFromDrive(driveId, title) {
    showDriveLoading(title);
    fetch('/drive_to_cbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveId: driveId })
    })
    .then(response => {
        if (response.status === 401) {
            // Need Google auth — redirect to OAuth
            return response.json().then(data => {
                window.location.href = '/google/auth?driveId=' + (data.driveId || driveId);
            });
        }
        if (!response.ok) throw new Error('Failed to process Drive PDF');
        return response.text().then(html => {
            document.open();
            document.write(html);
            document.close();
        });
    })
    .catch(err => {
        console.error('Drive to CBT error:', err);
        hideDriveLoading();
        alert('Failed to convert PDF to CBT. Please try again.');
    });
}

function showDriveLoading(title) {
    const overlay = document.getElementById('driveLoadingOverlay');
    if (overlay) {
        document.getElementById('driveLoadingTitle').textContent = title || 'Processing...';
        overlay.classList.remove('hidden');
    }
}

function hideDriveLoading() {
    const overlay = document.getElementById('driveLoadingOverlay');
    if (overlay) overlay.classList.add('hidden');
}

/* =============================================
   CBT VIEWER
   ============================================= */
function openCBT(data, title) {
    const overlay = document.getElementById('cbtOverlay');
    overlay.classList.remove('hidden');
    document.getElementById('cbtTitle').textContent = title;

    cbtPage = 1;
    cbtSeconds = 0;
    updateTimerDisplay();
    clearInterval(cbtTimerInterval);
    cbtTimerInterval = setInterval(() => { cbtSeconds++; updateTimerDisplay(); }, 1000);

    pdfjsLib.getDocument({ data }).promise.then(pdf => {
        cbtPdf = pdf;
        cbtTotal = pdf.numPages;
        document.getElementById('cbtTotalPages').textContent = cbtTotal;
        renderCBTPage();
    }).catch(err => {
        console.error('PDF parse error:', err);
        exitCBT();
        alert('Failed to parse PDF.');
    });
}

function renderCBTPage() {
    if (!cbtPdf) return;
    document.getElementById('cbtCurrentPage').textContent = cbtPage;
    document.getElementById('cbtProgress').textContent = `Page ${cbtPage} of ${cbtTotal}`;
    document.getElementById('cbtPrevBtn').disabled = cbtPage <= 1;

    cbtPdf.getPage(cbtPage).then(page => {
        const canvas = document.getElementById('cbtCanvas');
        const ctx = canvas.getContext('2d');
        const vp = page.getViewport({ scale: 2 });
        canvas.width = vp.width;
        canvas.height = vp.height;
        page.render({ canvasContext: ctx, viewport: vp });
    });
}

function cbtPrevPage() {
    if (cbtPage > 1) { cbtPage--; renderCBTPage(); }
}

function cbtNextPage() {
    if (cbtPage < cbtTotal) { cbtPage++; renderCBTPage(); }
}

function exitCBT() {
    document.getElementById('cbtOverlay').classList.add('hidden');
    clearInterval(cbtTimerInterval);
    cbtPdf = null;
}

function updateTimerDisplay() {
    const m = String(Math.floor(cbtSeconds / 60)).padStart(2, '0');
    const s = String(cbtSeconds % 60).padStart(2, '0');
    document.getElementById('cbtTimerText').textContent = m + ':' + s;
}

/* =============================================
   INIT
   ============================================= */
fetch('/static/classroom_schema.json')
    .then(r => r.json())
    .then(data => {
        DB.subjects = data.subjects || [];
        DB.chapters = data.chapters || {};
        DB.resources = data.resources || {};

        // Auto-select first subject
        if (DB.subjects.length > 0) {
            currentSubject = DB.subjects[0].id;
        }

        dkRenderSubjects();
        dkRenderChapterFilter();
        dkRenderPdfs();
        mobRenderSubjects();
    });

// Setup upload zones
setupUpload('dkUploadZone', 'dkPdfInput', 'dkUploadIdle', 'dkUploadActive', 'dkFileName', 'dkFileSize');
setupUpload('mobUploadZone2', 'mobPdfInput', 'mobUploadIdle', 'mobUploadActive', 'mobFileName', 'mobFileSize');

// Auto-start CBT after Google OAuth redirect
(function checkAutoCBT() {
    const params = new URLSearchParams(window.location.search);
    const autoCBT = params.get('autoCBT');
    if (autoCBT) {
        history.replaceState({}, '', window.location.pathname);
        startCBTFromDrive(autoCBT, 'Loading...');
    }
})();

/* =============================================
   SIDEBAR TOGGLE
   ============================================= */
function toggleSidebar() {
    const sidebar = document.getElementById('dkSidebar');
    const expandBtn = document.getElementById('sidebarExpandBtn');
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed');
    const collapsed = sidebar.classList.contains('collapsed');
    if (expandBtn) expandBtn.classList.toggle('visible', collapsed);
    lucide.createIcons();
}

// Keyboard: Escape to close modal/CBT
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!document.getElementById('analysisOverlay').classList.contains('hidden')) {
            closeAnalysis();
        } else if (!document.getElementById('cbtOverlay').classList.contains('hidden')) {
            exitCBT();
        } else if (document.getElementById('modeModal').classList.contains('open')) {
            closeModeModal();
        }
    }
    // Arrow keys for CBT
    if (!document.getElementById('cbtOverlay').classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') cbtPrevPage();
        if (e.key === 'ArrowRight') cbtNextPage();
    }
});

/* =============================================
   TAB SWITCHING
   ============================================= */
let currentTab = 'papers';

function switchTab(tab) {
    currentTab = tab;
    // Desktop: toggle panels
    document.getElementById('dkPdfList')?.classList.toggle('hidden', tab !== 'papers');
    document.getElementById('dkHistoryList')?.classList.toggle('hidden', tab !== 'history');
    document.getElementById('dkLiveTestsList')?.classList.toggle('hidden', tab !== 'live');
    // Desktop: highlight navbar buttons
    const navBtn = document.getElementById('navHistoryBtn');
    if (navBtn) navBtn.classList.toggle('dk-nav-link-active', tab === 'history');
    const liveBtn = document.getElementById('navLiveBtn');
    if (liveBtn) liveBtn.classList.toggle('dk-nav-link-active', tab === 'live');
    // Mobile tabs
    document.getElementById('mobTabPapers')?.classList.toggle('active', tab === 'papers');
    document.getElementById('mobTabHistory')?.classList.toggle('active', tab === 'history');
    document.getElementById('mobTabLive')?.classList.toggle('active', tab === 'live');
    document.getElementById('mobPapersContent')?.classList.toggle('hidden', tab !== 'papers');
    document.getElementById('mobHistoryContent')?.classList.toggle('hidden', tab !== 'history');
    document.getElementById('mobLiveTestsContent')?.classList.toggle('hidden', tab !== 'live');
    if (tab === 'live') loadLiveTests();
    lucide.createIcons();
}

/* =============================================
   TEST HISTORY
   ============================================= */
let historyData = [];

function formatTimeTaken(seconds) {
    if (!seconds && seconds !== 0) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
    return `${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

function formatDate(ts) {
    const d = new Date(ts * 1000);
    const day = String(d.getDate()).padStart(2,'0');
    const mon = d.toLocaleString('default',{month:'short'});
    const yr = d.getFullYear();
    const hr = String(d.getHours()).padStart(2,'0');
    const min = String(d.getMinutes()).padStart(2,'0');
    return `${day} ${mon} ${yr}, ${hr}:${min}`;
}

function gradeColor(grade) {
    const map = { S:'#fbbf24', A:'#ff6b00', B:'#00d2ff', C:'#a855f7', D:'#ef4444' };
    return map[grade] || '#999';
}

function renderHistoryCard(item, i, originalIndex) {
    const gc = gradeColor(item.grade);
    const pct = (item.percentage || 0).toFixed(1);
    const timeTaken = formatTimeTaken(item.time_taken_seconds);
    const date = formatDate(item.timestamp);
    return `<div class="hist-card anim-card" style="animation-delay:${i * 0.04}s;" onclick="openAnalysis(${originalIndex})">
        <div class="hist-card-left">
            <div class="hist-grade" style="background:${gc}15; border-color:${gc}30; color:${gc}">${item.grade || 'D'}</div>
        </div>
        <div class="hist-card-body">
            <div class="hist-card-title">${item.exam_title || 'Untitled Exam'}</div>
            <div class="hist-card-stats">
                <span class="hist-stat" style="color:var(--getsuga); font-weight:800;">${pct}%</span>
                <span class="hist-stat-sep"></span>
                <span class="hist-stat">${item.total_score || 0}/${item.max_score || 0}</span>
                <span class="hist-stat-sep"></span>
                <span class="hist-stat hist-stat-correct">${item.correct_count || 0}<i data-lucide="check" class="w-3 h-3"></i></span>
                <span class="hist-stat hist-stat-wrong">${item.wrong_count || 0}<i data-lucide="x" class="w-3 h-3"></i></span>
                <span class="hist-stat hist-stat-skip">${item.unattempted_count || 0}<i data-lucide="minus" class="w-3 h-3"></i></span>
            </div>
            <div class="hist-card-footer">
                <span class="hist-rank" style="color:${gc}">${item.rank_title || 'Academy Student'}</span>
                <span class="hist-time"><i data-lucide="clock" class="w-3 h-3"></i>${timeTaken}</span>
                <span class="hist-date">${date}</span>
            </div>
        </div>
        <button class="hist-delete-btn" onclick="event.stopPropagation(); deleteTest(${originalIndex})" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        <div class="hist-card-arrow"><i data-lucide="chevron-right" class="w-4 h-4"></i></div>
    </div>`;
}

function renderMobHistoryCard(item, i, originalIndex) {
    const gc = gradeColor(item.grade);
    const pct = (item.percentage || 0).toFixed(1);
    const timeTaken = formatTimeTaken(item.time_taken_seconds);
    const date = formatDate(item.timestamp);
    return `<div class="mob-hist-card anim-card" style="animation-delay:${i * 0.04}s;" onclick="openAnalysis(${originalIndex})">
        <div class="mob-hist-top">
            <div class="mob-hist-grade" style="background:${gc}15; border-color:${gc}30; color:${gc}">${item.grade || 'D'}</div>
            <div class="mob-hist-info">
                <div class="mob-hist-title">${item.exam_title || 'Untitled Exam'}</div>
                <div class="mob-hist-rank" style="color:${gc}">${item.rank_title || 'Academy Student'}</div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4" style="color:var(--text-muted); flex-shrink:0;"></i>
        </div>
        <div class="mob-hist-bottom">
            <div class="mob-hist-chip pct" style="color:var(--getsuga); border-color:rgba(255,123,0,0.2); background:var(--getsuga-glow);">${pct}%</div>
            <div class="mob-hist-chip">${item.total_score || 0}/${item.max_score || 0}</div>
            <div class="mob-hist-chip correct">${item.correct_count || 0}<i data-lucide="check" class="w-2.5 h-2.5"></i></div>
            <div class="mob-hist-chip wrong">${item.wrong_count || 0}<i data-lucide="x" class="w-2.5 h-2.5"></i></div>
            <div class="mob-hist-chip skip">${item.unattempted_count || 0}<i data-lucide="minus" class="w-2.5 h-2.5"></i></div>
        </div>
        <div class="mob-hist-meta">
            <span><i data-lucide="clock" class="w-3 h-3"></i>${timeTaken}</span>
            <span>${date}</span>
        </div>
        <button class="hist-delete-btn mob" onclick="event.stopPropagation(); deleteTest(${originalIndex})" title="Delete"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    </div>`;
}

function renderHistoryEmpty(isMobile) {
    if (isMobile) {
        return `<div style="text-align:center; padding:40px 20px;">
            <div style="width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px;"><i data-lucide="scroll-text" class="w-5 h-5 text-neutral-600"></i></div>
            <p class="text-xs font-bold text-neutral-500">No test history yet</p>
            <p class="text-[10px] text-neutral-600 font-bold mt-1">Complete a CBT to see results here</p>
        </div>`;
    }
    return `<div class="dk-empty" style="padding:32px 16px; text-align:center;">
        <div class="dk-empty-icon" style="margin:0 auto 8px;"><i data-lucide="scroll-text" class="w-7 h-7 text-neutral-600"></i></div>
        <p class="text-sm font-bold text-neutral-500">No test history yet</p>
        <p class="text-[10px] text-neutral-600 font-bold mt-1">Complete a CBT to see your results here</p>
    </div>`;
}

function loadTestHistory() {
    fetch('/test_history')
        .then(r => r.json())
        .then(data => {
            if (data.status !== 'success') return;
            historyData = (data.history || []);
            const reversed = [...historyData].reverse();
            const dkEl = document.getElementById('dkHistoryList');
            const mobEl = document.getElementById('mobHistoryList');
            if (dkEl) {
                dkEl.innerHTML = reversed.length === 0
                    ? renderHistoryEmpty(false)
                    : reversed.map((h, i) => renderHistoryCard(h, i, historyData.length - 1 - i)).join('');
            }
            if (mobEl) {
                mobEl.innerHTML = reversed.length === 0
                    ? renderHistoryEmpty(true)
                    : reversed.map((h, i) => renderMobHistoryCard(h, i, historyData.length - 1 - i)).join('');
            }
            const countEl = document.getElementById('dkHistoryCount');
            if (countEl) countEl.textContent = historyData.length;
            lucide.createIcons();
        })
        .catch(err => console.error('Failed to load test history:', err));
}

loadTestHistory();

/* =============================================
   LIVE TESTS
   ============================================= */
let liveTestsData = [];
let liveTestsLoaded = false;

function loadLiveTests() {
    fetch('/live_tests/available')
        .then(r => r.json())
        .then(data => {
            if (data.status !== 'success') return;
            liveTestsData = data.tests || [];
            liveTestsLoaded = true;
            renderLiveTests();
        })
        .catch(err => console.error('Failed to load live tests:', err));
}

function liveTestStatus(t) {
    const now = Date.now() / 1000;
    const start = t.schedule?.start_time || 0;
    const end = t.schedule?.window_end || 0;
    if (t.already_attempted && (t.attempt_status === 'submitted' || t.attempt_status === 'cheating')) return 'attempted';
    if (now >= start && now <= end) return 'active';
    if (now < start) return 'upcoming';
    return 'expired';
}

function liveTestStatusBadge(status) {
    const map = {
        active: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)', color: '#22c55e', label: 'LIVE NOW' },
        upcoming: { bg: 'rgba(0,210,255,0.08)', border: 'rgba(0,210,255,0.2)', color: '#00d2ff', label: 'UPCOMING' },
        attempted: { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.2)', color: '#8b5cf6', label: 'ATTEMPTED' },
        expired: { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.06)', color: '#666', label: 'ENDED' }
    };
    const s = map[status] || map.expired;
    return `<span style="font-size:9px;font-weight:800;padding:2px 8px;border-radius:10px;background:${s.bg};border:1px solid ${s.border};color:${s.color};text-transform:uppercase;letter-spacing:0.05em;flex-shrink:0;white-space:nowrap;">${s.label}</span>`;
}

function formatLiveDate(ts) {
    if (!ts) return '--';
    const d = new Date(ts * 1000);
    const day = String(d.getDate()).padStart(2,'0');
    const mon = d.toLocaleString('default',{month:'short'});
    const hr = String(d.getHours()).padStart(2,'0');
    const min = String(d.getMinutes()).padStart(2,'0');
    return `${day} ${mon}, ${hr}:${min}`;
}

function formatCountdownShort(seconds) {
    if (seconds <= 0) return 'now';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
}

function renderLiveTestCard(t, i) {
    const status = liveTestStatus(t);
    const badge = liveTestStatusBadge(status);
    const startDate = formatLiveDate(t.schedule?.start_time);
    const dur = t.schedule?.duration_minutes || 0;
    let action = '';
    if (status === 'active' && !t.already_attempted) {
        action = `<a href="/live_tests/exam/${t._id}" class="dk-btn-primary" style="text-decoration:none;padding:6px 16px;font-size:11px;display:inline-flex;align-items:center;gap:4px;"><i data-lucide="zap" class="w-3.5 h-3.5"></i> Start</a>`;
    } else if (status === 'active' && t.attempt_status === 'in_progress') {
        action = `<a href="/live_tests/exam/${t._id}" class="dk-btn-primary" style="text-decoration:none;padding:6px 16px;font-size:11px;display:inline-flex;align-items:center;gap:4px;"><i data-lucide="play" class="w-3.5 h-3.5"></i> Resume</a>`;
    } else if (status === 'upcoming') {
        const diff = (t.schedule?.start_time || 0) - Date.now() / 1000;
        action = `<span style="font-size:10px;color:var(--reishi);font-weight:700;">Starts in ${formatCountdownShort(diff)}</span>`;
    }
    return `<div class="dk-pdf-card anim-card" style="animation-delay:${i * 0.04}s;">
        <div class="dk-pdf-card-row" style="align-items:center;">
            <div class="dk-pdf-card-icon" style="background:${status === 'active' ? 'rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.2)' : status === 'upcoming' ? 'rgba(0,210,255,0.08);border-color:rgba(0,210,255,0.2)' : 'rgba(139,92,246,0.06);border-color:rgba(139,92,246,0.15)'};">
                <i data-lucide="${status === 'active' ? 'radio' : status === 'upcoming' ? 'clock' : 'check-circle'}" class="w-5 h-5" style="color:${status === 'active' ? '#22c55e' : status === 'upcoming' ? '#00d2ff' : '#8b5cf6'}"></i>
            </div>
            <div class="dk-pdf-card-info" style="flex:1;min-width:0;">
                <div class="dk-pdf-card-title">${t.title}</div>
                <div class="dk-pdf-card-meta">${t.question_count} Q &bull; ${dur} min &bull; ${t.total_marks} marks &bull; ${startDate}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                ${badge}
                ${action}
            </div>
        </div>
    </div>`;
}

function renderMobLiveTestCard(t, i) {
    const status = liveTestStatus(t);
    const badge = liveTestStatusBadge(status);
    const startDate = formatLiveDate(t.schedule?.start_time);
    const dur = t.schedule?.duration_minutes || 0;
    let action = '';
    if (status === 'active' && !t.already_attempted) {
        action = `<a href="/live_tests/exam/${t._id}" style="text-decoration:none;font-size:10px;font-weight:800;color:#000;background:var(--getsuga);padding:5px 14px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;"><i data-lucide="zap" class="w-3 h-3"></i>Start</a>`;
    } else if (status === 'active' && t.attempt_status === 'in_progress') {
        action = `<a href="/live_tests/exam/${t._id}" style="text-decoration:none;font-size:10px;font-weight:800;color:#000;background:var(--getsuga);padding:5px 14px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;"><i data-lucide="play" class="w-3 h-3"></i>Resume</a>`;
    } else if (status === 'upcoming') {
        const diff = (t.schedule?.start_time || 0) - Date.now() / 1000;
        action = `<span style="font-size:10px;color:var(--reishi);font-weight:700;">${formatCountdownShort(diff)}</span>`;
    }
    return `<div class="mob-hist-card anim-card" style="animation-delay:${i * 0.04}s;">
        <div class="mob-hist-top">
            <div class="mob-hist-grade" style="background:${status === 'active' ? 'rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.3);color:#22c55e' : status === 'upcoming' ? 'rgba(0,210,255,0.08);border-color:rgba(0,210,255,0.2);color:#00d2ff' : 'rgba(139,92,246,0.08);border-color:rgba(139,92,246,0.2);color:#8b5cf6'};">
                <i data-lucide="${status === 'active' ? 'radio' : status === 'upcoming' ? 'clock' : 'check-circle'}" class="w-4 h-4"></i>
            </div>
            <div class="mob-hist-info" style="flex:1;min-width:0;">
                <div class="mob-hist-title">${t.title}</div>
                <div class="mob-hist-rank" style="color:#888;">${t.question_count} Q &bull; ${dur} min &bull; ${t.total_marks} marks</div>
            </div>
            ${badge}
        </div>
        <div class="mob-hist-bottom" style="justify-content:space-between;">
            <span style="font-size:10px;color:#666;font-weight:600;"><i data-lucide="calendar" class="w-3 h-3" style="display:inline;vertical-align:-2px;margin-right:3px;"></i>${startDate}</span>
            ${action}
        </div>
    </div>`;
}

function renderLiveTestsEmpty(isMobile) {
    const icon = 'radio';
    if (isMobile) {
        return `<div style="text-align:center; padding:40px 20px;">
            <div style="width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px;"><i data-lucide="${icon}" class="w-5 h-5 text-neutral-600"></i></div>
            <p class="text-xs font-bold text-neutral-500">No live tests available</p>
            <p class="text-[10px] text-neutral-600 font-bold mt-1">Check back later for scheduled exams</p>
        </div>`;
    }
    return `<div class="dk-empty" style="padding:32px 16px; text-align:center;">
        <div class="dk-empty-icon" style="margin:0 auto 8px;"><i data-lucide="${icon}" class="w-7 h-7 text-neutral-600"></i></div>
        <p class="text-sm font-bold text-neutral-500">No live tests available</p>
        <p class="text-[10px] text-neutral-600 font-bold mt-1">Check back later for scheduled exams</p>
    </div>`;
}

function renderLiveTests() {
    const dkEl = document.getElementById('dkLiveTestsList');
    const mobEl = document.getElementById('mobLiveTestsList');
    // Sort: active first, then upcoming, then attempted, then expired
    const order = { active: 0, upcoming: 1, attempted: 2, expired: 3 };
    const sorted = [...liveTestsData].sort((a, b) => (order[liveTestStatus(a)] ?? 9) - (order[liveTestStatus(b)] ?? 9));
    if (dkEl) {
        dkEl.innerHTML = sorted.length === 0
            ? renderLiveTestsEmpty(false)
            : sorted.map((t, i) => renderLiveTestCard(t, i)).join('');
    }
    if (mobEl) {
        mobEl.innerHTML = sorted.length === 0
            ? renderLiveTestsEmpty(true)
            : sorted.map((t, i) => renderMobLiveTestCard(t, i)).join('');
    }
    lucide.createIcons();
}

/* =============================================
   DETAILED ANALYSIS
   ============================================= */
function openAnalysis(index) {
    const overlay = document.getElementById('analysisOverlay');
    const body = document.getElementById('analysisBody');
    overlay.classList.remove('hidden');
    body.innerHTML = `<div style="text-align:center; padding:60px 20px;">
        <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3" style="display:inline-flex;">
            <i data-lucide="loader" class="w-5 h-5 animate-spin" style="color:var(--getsuga)"></i>
        </div>
        <p class="text-sm font-bold text-neutral-500">Loading analysis...</p>
    </div>`;
    lucide.createIcons();

    fetch('/test_history/' + index)
        .then(r => r.json())
        .then(data => {
            if (data.status !== 'success') {
                body.innerHTML = '<p class="text-sm text-red-400 text-center" style="padding:40px;">Failed to load details</p>';
                return;
            }
            renderAnalysis(data.test);
        })
        .catch(() => {
            body.innerHTML = '<p class="text-sm text-red-400 text-center" style="padding:40px;">Failed to load details</p>';
        });
}

function closeAnalysis() {
    document.getElementById('analysisOverlay').classList.add('hidden');
}

function deleteTest(index) {
    if (!confirm('Delete this test from history?')) return;
    fetch('/test_history/' + index, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                closeAnalysis();
                loadTestHistory();
            } else {
                alert('Failed to delete test');
            }
        })
        .catch(() => alert('Failed to delete test'));
}

let currentAnalysisTest = null;
let analysisInnerTab = 'analysis';

function renderAnalysis(test) {
    currentAnalysisTest = test;
    analysisInnerTab = 'analysis';
    const title = document.getElementById('analysisTitle');
    const subtitle = document.getElementById('analysisSubtitle');
    title.textContent = test.exam_title || 'Test Analysis';
    subtitle.textContent = formatDate(test.timestamp);
    renderAnalysisContent();
}

function switchAnalysisTab(tab) {
    analysisInnerTab = tab;
    renderAnalysisContent();
}

function renderAnalysisContent() {
    const body = document.getElementById('analysisBody');
    const test = currentAnalysisTest;
    if (!test) return;

    const gc = gradeColor(test.grade);
    const pct = (test.percentage || 0).toFixed(1);
    const questions = test.questions || [];

    let html = '';

    // Summary bar (always visible)
    html += `<div class="analysis-topbar">
        <div class="analysis-grade-compact" style="background:${gc}15; border-color:${gc}30;">
            <span class="analysis-grade-letter-sm" style="color:${gc}">${test.grade || 'D'}</span>
            <span class="analysis-grade-rank-sm" style="color:${gc}">${test.rank_title || 'Academy Student'}</span>
        </div>
        <div class="analysis-topbar-stats">
            <div class="analysis-topbar-stat"><span class="analysis-topbar-val" style="color:var(--getsuga)">${pct}%</span><span class="analysis-topbar-lbl">Score</span></div>
            <div class="analysis-topbar-stat"><span class="analysis-topbar-val">${test.total_score || 0}<small>/${test.max_score || 0}</small></span><span class="analysis-topbar-lbl">Marks</span></div>
            <div class="analysis-topbar-stat"><span class="analysis-topbar-val">${formatTimeTaken(test.time_taken_seconds)}</span><span class="analysis-topbar-lbl">Time</span></div>
        </div>
    </div>`;

    // Stat pills row
    html += `<div class="analysis-pills">
        <div class="analysis-pill correct"><i data-lucide="check" class="w-3.5 h-3.5"></i>${test.correct_count || 0} Correct</div>
        <div class="analysis-pill wrong"><i data-lucide="x" class="w-3.5 h-3.5"></i>${test.wrong_count || 0} Wrong</div>
        <div class="analysis-pill skip"><i data-lucide="minus" class="w-3.5 h-3.5"></i>${test.unattempted_count || 0} Skipped</div>
    </div>`;

    // Inner tab bar
    html += `<div class="analysis-inner-tabs">
        <button class="analysis-inner-tab ${analysisInnerTab === 'analysis' ? 'active' : ''}" onclick="switchAnalysisTab('analysis')">
            <i data-lucide="list-checks" class="w-3.5 h-3.5"></i> Analysis
        </button>
        <button class="analysis-inner-tab ${analysisInnerTab === 'weaknesses' ? 'active' : ''}" onclick="switchAnalysisTab('weaknesses')">
            <i data-lucide="shield-alert" class="w-3.5 h-3.5"></i> Weaknesses
        </button>
    </div>`;

    if (analysisInnerTab === 'analysis') {
        html += renderAnalysisTab(questions);
    } else {
        html += renderWeaknessesTab(questions, test);
    }

    body.innerHTML = html;
    lucide.createIcons();
    renderMathIn(body);

    // Re-attach collapsible listeners after render
    requestAnimationFrame(() => initCollapsibles());
}

/* --- Collapsible section logic --- */
function initCollapsibles() {
    document.querySelectorAll('.collapsible-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.closest('.collapsible-section');
            if (!section) return;
            const body = section.querySelector('.collapsible-body');
            const icon = btn.querySelector('.collapse-icon');
            const isOpen = section.classList.contains('open');
            if (isOpen) {
                body.style.maxHeight = body.scrollHeight + 'px';
                requestAnimationFrame(() => { body.style.maxHeight = '0'; });
                section.classList.remove('open');
            } else {
                body.style.maxHeight = body.scrollHeight + 'px';
                section.classList.add('open');
                body.addEventListener('transitionend', () => {
                    if (section.classList.contains('open')) body.style.maxHeight = 'none';
                }, { once: true });
            }
        });
    });
}

function toggleQCard(el) {
    const card = el.closest('.analysis-q-card');
    if (!card) return;
    const detail = card.querySelector('.q-card-detail');
    if (!detail) return;
    const isOpen = card.classList.contains('expanded');
    if (isOpen) {
        detail.style.maxHeight = detail.scrollHeight + 'px';
        requestAnimationFrame(() => { detail.style.maxHeight = '0'; });
        card.classList.remove('expanded');
    } else {
        detail.style.maxHeight = detail.scrollHeight + 'px';
        card.classList.add('expanded');
        detail.addEventListener('transitionend', () => {
            if (card.classList.contains('expanded')) detail.style.maxHeight = 'none';
        }, { once: true });
    }
}

let analysisFilter = 'all'; // all, correct, wrong, unattempted

function setAnalysisFilter(f) {
    analysisFilter = f;
    renderAnalysisContent();
}

function renderAnalysisTab(questions) {
    if (questions.length === 0) {
        return `<div style="text-align:center; padding:32px; color:var(--text-muted); font-size:13px; font-weight:600;">
            No detailed question data available for this test.
        </div>`;
    }

    // Filter bar
    const counts = { all: questions.length, correct: 0, wrong: 0, unattempted: 0 };
    questions.forEach(q => { counts[getQStatus(q)]++; });

    let html = `<div class="analysis-filter-bar">
        <button class="analysis-filter-btn ${analysisFilter === 'all' ? 'active' : ''}" onclick="setAnalysisFilter('all')">All <span>${counts.all}</span></button>
        <button class="analysis-filter-btn correct ${analysisFilter === 'correct' ? 'active' : ''}" onclick="setAnalysisFilter('correct')"><i data-lucide="check" class="w-3 h-3"></i>${counts.correct}</button>
        <button class="analysis-filter-btn wrong ${analysisFilter === 'wrong' ? 'active' : ''}" onclick="setAnalysisFilter('wrong')"><i data-lucide="x" class="w-3 h-3"></i>${counts.wrong}</button>
        <button class="analysis-filter-btn skip ${analysisFilter === 'unattempted' ? 'active' : ''}" onclick="setAnalysisFilter('unattempted')"><i data-lucide="minus" class="w-3 h-3"></i>${counts.unattempted}</button>
    </div>`;

    const filtered = analysisFilter === 'all' ? questions : questions.filter(q => getQStatus(q) === analysisFilter);

    if (filtered.length === 0) {
        html += `<div style="text-align:center; padding:24px; color:var(--text-muted); font-size:12px; font-weight:600;">
            No questions match this filter.
        </div>`;
        return html;
    }

    html += '<div class="analysis-q-list">';
    filtered.forEach((q, i) => {
        const status = getQStatus(q);
        const icon = status === 'correct' ? 'check' : status === 'wrong' ? 'x' : 'minus';
        const marks = q.marks_awarded || 0;
        const marksClass = marks > 0 ? 'positive' : marks < 0 ? 'negative' : 'zero';
        const marksStr = marks > 0 ? '+' + marks : marks.toString();
        const userAns = q.user_answer !== null && q.user_answer !== undefined && q.user_answer !== ''
            ? (Array.isArray(q.user_answer) ? q.user_answer.join(', ') : q.user_answer)
            : 'Not attempted';
        const correctAns = Array.isArray(q.correct_answer) ? q.correct_answer.join(', ') : (q.correct_answer || '--');
        const topicTag = q.topic ? `<span class="analysis-q-topic">${escapeHtml(q.topic)}</span>` : '';

        html += `<div class="analysis-q-card ${status} anim-card" style="animation-delay:${i * 0.03}s" onclick="toggleQCard(this)">
            <div class="analysis-q-header">
                <div class="analysis-q-badge ${status}"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i></div>
                <span class="analysis-q-num">Q${q.id || i + 1}</span>
                ${topicTag}
                <span class="analysis-q-marks ${marksClass}">${marksStr}</span>
                <i data-lucide="chevron-down" class="w-3.5 h-3.5 q-card-chevron"></i>
            </div>
            <div class="q-card-detail">
                <div class="analysis-answer-row">
                    <span class="analysis-answer-tag user">Your: ${escapeHtml(userAns)}</span>
                    <span class="analysis-answer-tag correct-tag">Correct: ${escapeHtml(correctAns)}</span>
                </div>
                ${q.explanation ? `<div class="analysis-explanation">${escapeHtml(q.explanation)}</div>` : ''}
            </div>
        </div>`;
    });
    html += '</div>';
    return html;
}

function renderWeaknessesTab(questions, test) {
    const weaknesses = test.weaknesses || [];
    const wrongQs = questions.filter(q => getQStatus(q) === 'wrong');
    const skippedQs = questions.filter(q => getQStatus(q) === 'unattempted');

    if (weaknesses.length === 0 && wrongQs.length === 0 && skippedQs.length === 0) {
        return `<div class="weakness-perfect anim-scale">
            <div class="weakness-perfect-icon"><i data-lucide="trophy" class="w-8 h-8" style="color:#fbbf24"></i></div>
            <p style="font-size:16px; font-weight:800; color:var(--text-main); margin-top:8px;">Perfect Score!</p>
            <p style="font-size:12px; color:var(--text-muted); margin-top:4px;">No weaknesses found — you nailed every question.</p>
        </div>`;
    }

    let html = '';

    // Summary overview
    const totalWrong = wrongQs.length;
    const totalSkipped = skippedQs.length;
    const totalQ = questions.length;
    const wrongPct = totalQ > 0 ? ((totalWrong / totalQ) * 100).toFixed(0) : 0;
    const skippedPct = totalQ > 0 ? ((totalSkipped / totalQ) * 100).toFixed(0) : 0;
    const marksPenalty = wrongQs.reduce((sum, q) => sum + (q.marks_awarded < 0 ? q.marks_awarded : 0), 0);

    html += `<div class="weakness-overview anim-card">
        <div class="weakness-overview-item wrong">
            <div class="weakness-overview-ring" style="--ring-color:#ef4444; --ring-pct:${wrongPct};">
                <span>${totalWrong}</span>
            </div>
            <div>
                <div style="font-size:12px; font-weight:700; color:#ef4444;">Wrong Answers</div>
                <div style="font-size:10px; color:var(--text-muted);">${wrongPct}% of questions${marksPenalty < 0 ? ' • ' + marksPenalty + ' penalty' : ''}</div>
            </div>
        </div>
        <div class="weakness-overview-item skip">
            <div class="weakness-overview-ring" style="--ring-color:var(--text-muted); --ring-pct:${skippedPct};">
                <span>${totalSkipped}</span>
            </div>
            <div>
                <div style="font-size:12px; font-weight:700; color:var(--text-dim);">Skipped</div>
                <div style="font-size:10px; color:var(--text-muted);">${skippedPct}% of questions</div>
            </div>
        </div>
    </div>`;

    // Topic-wise weakness cards (collapsible)
    if (weaknesses.length > 0) {
        html += `<div class="analysis-section-title anim-card" style="margin-top:20px;"><i data-lucide="brain" class="w-4 h-4" style="color:var(--getsuga)"></i> Weak Topics</div>`;
        weaknesses.forEach((w, wi) => {
            const sources = w.sources || [];
            const ytPlaylists = w.youtube_playlists || [];
            html += `<div class="weakness-topic-card anim-card" style="animation-delay:${wi * 0.05}s">
                <div class="weakness-topic-header">
                    <div class="weakness-topic-name">${escapeHtml(w.topic)}</div>
                    <div class="weakness-topic-stats">
                        ${w.wrong_count ? `<span class="weakness-topic-chip wrong">${w.wrong_count} wrong</span>` : ''}
                        ${w.skipped_count ? `<span class="weakness-topic-chip skip">${w.skipped_count} skipped</span>` : ''}
                        <span class="weakness-topic-chip total">${w.total_in_topic || '?'} total</span>
                    </div>
                </div>
                ${w.suggestion ? `<div class="weakness-topic-suggestion">${escapeHtml(w.suggestion)}</div>` : ''}
                ${ytPlaylists.length > 0 ? `<div class="weakness-topic-sources" style="margin-bottom:6px;">
                    <div class="weakness-sources-label"><i data-lucide="youtube" class="w-3 h-3" style="color:#ef4444"></i> YouTube Playlists</div>
                    ${ytPlaylists.map(p => `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="weakness-source-link" style="border-color:rgba(239,68,68,.15);"><i data-lucide="play-circle" class="w-3 h-3" style="color:#ef4444"></i>${escapeHtml(p.title)}</a>`).join('')}
                </div>` : ''}
                ${sources.length > 0 ? `<div class="weakness-topic-sources">
                    <div class="weakness-sources-label"><i data-lucide="book-open" class="w-3 h-3"></i> Learn from</div>
                    ${sources.map(s => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="weakness-source-link"><i data-lucide="external-link" class="w-3 h-3"></i>${escapeHtml(s.title)}</a>`).join('')}
                </div>` : ''}
            </div>`;
        });
    }

    // Collapsible Wrong + Skipped sections
    if (wrongQs.length > 0) {
        html += `<div class="collapsible-section open">
            <button class="collapsible-toggle">
                <div class="analysis-section-title" style="margin:0;"><i data-lucide="x-circle" class="w-4 h-4" style="color:#ef4444"></i> Wrong Answers <span class="collapsible-count">${wrongQs.length}</span></div>
                <i data-lucide="chevron-down" class="w-4 h-4 collapse-icon"></i>
            </button>
            <div class="collapsible-body" style="max-height:none;">
                <div class="analysis-q-list">`;
        wrongQs.forEach((q, i) => {
            const userAns = q.user_answer !== null && q.user_answer !== undefined && q.user_answer !== ''
                ? (Array.isArray(q.user_answer) ? q.user_answer.join(', ') : q.user_answer)
                : '--';
            const correctAns = Array.isArray(q.correct_answer) ? q.correct_answer.join(', ') : (q.correct_answer || '--');
            const marks = q.marks_awarded || 0;
            const topicTag = q.topic ? `<span class="analysis-q-topic">${escapeHtml(q.topic)}</span>` : '';
            html += `<div class="analysis-q-card wrong anim-card" style="animation-delay:${i * 0.03}s" onclick="toggleQCard(this)">
                <div class="analysis-q-header">
                    <div class="analysis-q-badge wrong"><i data-lucide="x" class="w-3.5 h-3.5"></i></div>
                    <span class="analysis-q-num">Q${q.id || '?'}</span>
                    ${topicTag}
                    <span class="analysis-q-marks ${marks < 0 ? 'negative' : 'zero'}">${marks < 0 ? marks : 0}</span>
                    <i data-lucide="chevron-down" class="w-3.5 h-3.5 q-card-chevron"></i>
                </div>
                <div class="q-card-detail">
                    <div class="analysis-answer-row">
                        <span class="analysis-answer-tag user">Your: ${escapeHtml(userAns)}</span>
                        <span class="analysis-answer-tag correct-tag">Correct: ${escapeHtml(correctAns)}</span>
                    </div>
                    ${q.explanation ? `<div class="analysis-explanation">${escapeHtml(q.explanation)}</div>` : ''}
                </div>
            </div>`;
        });
        html += `</div></div></div>`;
    }

    if (skippedQs.length > 0) {
        html += `<div class="collapsible-section open">
            <button class="collapsible-toggle">
                <div class="analysis-section-title" style="margin:0;"><i data-lucide="minus-circle" class="w-4 h-4" style="color:var(--text-muted)"></i> Skipped Questions <span class="collapsible-count">${skippedQs.length}</span></div>
                <i data-lucide="chevron-down" class="w-4 h-4 collapse-icon"></i>
            </button>
            <div class="collapsible-body" style="max-height:none;">
                <div class="analysis-q-list">`;
        skippedQs.forEach((q, i) => {
            const correctAns = Array.isArray(q.correct_answer) ? q.correct_answer.join(', ') : (q.correct_answer || '--');
            const topicTag = q.topic ? `<span class="analysis-q-topic">${escapeHtml(q.topic)}</span>` : '';
            html += `<div class="analysis-q-card unattempted anim-card" style="animation-delay:${i * 0.03}s" onclick="toggleQCard(this)">
                <div class="analysis-q-header">
                    <div class="analysis-q-badge unattempted"><i data-lucide="minus" class="w-3.5 h-3.5"></i></div>
                    <span class="analysis-q-num">Q${q.id || '?'}</span>
                    ${topicTag}
                    <span class="analysis-q-marks zero">0</span>
                    <i data-lucide="chevron-down" class="w-3.5 h-3.5 q-card-chevron"></i>
                </div>
                <div class="q-card-detail">
                    <div class="analysis-answer-row">
                        <span class="analysis-answer-tag correct-tag">Answer: ${escapeHtml(correctAns)}</span>
                    </div>
                    ${q.explanation ? `<div class="analysis-explanation">${escapeHtml(q.explanation)}</div>` : ''}
                </div>
            </div>`;
        });
        html += `</div></div></div>`;
    }

    return html;
}

function getQStatus(q) {
    if (q.is_correct) return 'correct';
    if (q.user_answer === null || q.user_answer === undefined || q.user_answer === '' || (Array.isArray(q.user_answer) && q.user_answer.length === 0)) return 'unattempted';
    return 'wrong';
}

function escapeHtml(str) {
    if (typeof str !== 'string') str = String(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * renderMathIn(el) — Scans an element for LaTeX math delimiters and renders them with KaTeX.
 * Supports: $$...$$ and $...$ (dollar), \[...\] and \(...\) (standard LaTeX).
 */
function renderMathIn(el) {
    if (typeof katex === 'undefined' || !el) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(function(node) {
        const text = node.textContent;
        if (!text) return;
        if (!text.includes('$') && !text.includes('\\(') && !text.includes('\\[')) return;

        const mathRegex = /(\$\$[\s\S]+?\$\$|\$(?!\$)[\s\S]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
        if (!mathRegex.test(text)) return;
        mathRegex.lastIndex = 0;

        const frag = document.createDocumentFragment();
        let lastIndex = 0;
        let match;

        while ((match = mathRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            const raw = match[0];
            let isDisplay, latex;
            if (raw.startsWith('$$')) {
                isDisplay = true; latex = raw.slice(2, -2).trim();
            } else if (raw.startsWith('$')) {
                isDisplay = false; latex = raw.slice(1, -1).trim();
            } else if (raw.startsWith('\\[')) {
                isDisplay = true; latex = raw.slice(2, -2).trim();
            } else {
                isDisplay = false; latex = raw.slice(2, -2).trim();
            }

            const span = document.createElement('span');
            span.className = isDisplay ? 'math-display' : 'math-inline';

            try {
                katex.render(latex, span, {
                    throwOnError: false,
                    displayMode: isDisplay,
                    trust: true
                });
            } catch (e) {
                span.textContent = raw;
            }

            frag.appendChild(span);
            lastIndex = match.index + raw.length;
        }

        if (lastIndex < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        node.parentNode.replaceChild(frag, node);
    });
}