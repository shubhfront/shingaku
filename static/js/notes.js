    lucide.createIcons();

    /* =============================================
       DATA — loaded from classroom_schema.json
       ============================================= */
    let DB = { subjects: [], chapters: {}, resources: {} };

    let currentSubject = '';
    let currentChapter = '';
    let currentTab = 'notes';

    function getSubject(id) { return DB.subjects.find(s => s.id === id); }
    function getChapter(subId, chapId) { return (DB.chapters[subId] || []).find(c => c.id === chapId); }
    function getResources(subId, chapId) {
        const subRes = DB.resources[subId];
        if (!subRes) return { notes: [], recordings: [], practice: [] };
        return subRes[chapId] || { notes: [], recordings: [], practice: [] };
    }
    function openDriveFile(link, driveId, title) {
        if (driveId) {
            openPdfViewer(driveId, title || 'PDF Viewer');
        } else {
            window.open(link, '_blank');
        }
    }

    let currentViewerDriveId = null;

    function openPdfViewer(driveId, title) {
        const overlay = document.getElementById('pdfViewerOverlay');
        const iframe = document.getElementById('pdfViewerFrame');
        const titleEl = document.getElementById('pdfViewerTitle');
        if (!overlay || !iframe) return;
        currentViewerDriveId = driveId;
        titleEl.textContent = title || 'PDF Viewer';
        iframe.src = '/view_pdf/' + encodeURIComponent(driveId);
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closePdfViewer() {
        const overlay = document.getElementById('pdfViewerOverlay');
        const iframe = document.getElementById('pdfViewerFrame');
        if (!overlay || !iframe) return;
        overlay.classList.remove('open');
        iframe.src = '';
        currentViewerDriveId = null;
        document.body.style.overflow = '';
    }

    function downloadCurrentPdf() {
        if (!currentViewerDriveId) return;
        window.open('/view_pdf/' + encodeURIComponent(currentViewerDriveId) + '?download=1', '_blank');
    }

    const typeColors = {
        'PDF': { bg: 'bg-red-900/20', border: 'border-red-800/20', text: 'text-red-400', icon: 'text-red-400' },
        'IMG': { bg: 'bg-blue-900/20', border: 'border-blue-800/20', text: 'text-blue-400', icon: 'text-blue-400' },
        'DOC': { bg: 'bg-green-900/20', border: 'border-green-800/20', text: 'text-green-400', icon: 'text-green-400' },
        'VID': { bg: 'bg-purple-900/20', border: 'border-purple-800/20', text: 'text-purple-400', icon: 'text-purple-400' },
    };

    /* =============================================
       DESKTOP RENDERING
       ============================================= */
    function dkRenderSubjects() {
        const el = document.getElementById('dkSubjectSidebar');
        if (!el) return;
        el.innerHTML = `<div class="dk-sidebar-label"><span>Subjects</span><button class="sidebar-mini-btn" onclick="toggleSidebar()" title="Toggle Sidebar"><i data-lucide="panel-left-close" class="w-3.5 h-3.5"></i></button></div>` + DB.subjects.map(s => {
            const chapCount = (DB.chapters[s.id] || []).length;
            return `<div class="dk-sub-btn ${s.id === currentSubject ? 'active' : ''}" onclick="dkSelectSubject('${s.id}')" title="${s.name}">
                <div class="dk-sub-icon" style="background:${s.id === currentSubject ? s.color + '22' : 'rgba(255,255,255,0.04)'};">
                    <i data-lucide="${s.icon}" class="w-5 h-5" style="color:${s.id === currentSubject ? s.color : 'var(--text-muted)'};"></i>
                </div>
                <div class="dk-sub-info">
                    <span class="dk-sub-name">${s.name}</span>
                    <span class="dk-sub-meta">${chapCount} chapters</span>
                </div>
            </div>`;
        }).join('');
        lucide.createIcons();
    }

    function dkRenderChapters() {
        const el = document.getElementById('dkChapterList');
        if (!el) return;
        const sub = getSubject(currentSubject);
        const chapters = DB.chapters[currentSubject] || [];
        const search = (document.getElementById('dkChapSearch')?.value || '').toLowerCase();
        const filtered = chapters.filter(c => c.title.toLowerCase().includes(search));

        document.getElementById('dkSubjectTitle').textContent = sub.name;
        document.getElementById('dkChapCount').textContent = chapters.length + ' chapters';

        el.innerHTML = filtered.map((c, i) => {
            const active = c.id === currentChapter;
            return `<div class="dk-chap-item ${active ? 'active' : ''}" onclick="dkSelectChapter('${c.id}')">
                <div class="dk-chap-num">${String(i+1).padStart(2,'0')}</div>
                <div class="flex-1 min-w-0">
                    <p class="text-[13px] font-bold ${active ? 'text-white' : 'text-neutral-300'} leading-snug">${c.title}</p>
                    <span class="text-[10px] text-neutral-500 font-bold mt-1 inline-block">${c.modules} files</span>
                </div>
                <i data-lucide="chevron-right" class="w-4 h-4 ${active ? 'text-[var(--reishi)]' : 'text-neutral-700'}"></i>
            </div>`;
        }).join('');
        if (filtered.length === 0) el.innerHTML = '<div class="p-8 text-center text-neutral-600 text-xs font-bold">No chapters found</div>';
        lucide.createIcons();
    }

    function dkRenderContent() {
        const el = document.getElementById('dkCards');
        if (!el) return;
        const chap = getChapter(currentSubject, currentChapter);
        const sub = getSubject(currentSubject);
        if (!chap || !sub) return;

        document.getElementById('dkContentTitle').textContent = chap.title;
        document.getElementById('dkModuleBadge').textContent = chap.modules + ' files';
        const chapRes = getResources(currentSubject, currentChapter);
        document.getElementById('dkStatNotes').textContent = chapRes.notes.length + ' Files';

        // Breadcrumb
        document.getElementById('dkBreadcrumb').innerHTML = `
            <span class="text-[10px] text-neutral-500 font-bold cursor-pointer hover:text-white transition-colors" onclick="dkBreadSubject()">${sub.name}</span>
            <i data-lucide="chevron-right" class="w-3 h-3 text-neutral-600"></i>
            <span class="text-[10px] text-[var(--getsuga)] font-bold">${chap.title}</span>`;

        const items = chapRes[currentTab] || [];
        const chapterTitle = chap.title;

        // Recordings tab: Allen.in-style list with thumbnails
        if (currentTab === 'recordings') {
            const svgGraph = `<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg"><text x="8" y="16" fill="rgba(255,255,255,0.6)" font-size="6" font-family="monospace">y = a(x - α)(x - β)</text><line x1="10" y1="80" x2="150" y2="80" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/><line x1="20" y1="15" x2="20" y2="90" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/><path d="M 15 70 Q 40 20 70 50 Q 100 80 130 30 Q 145 10 155 15" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/><path d="M 15 60 Q 45 30 75 55 Q 105 75 135 35 Q 148 18 155 22" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1" stroke-dasharray="3,3"/></svg>`;
            el.parentElement.className = 'flex-1 overflow-y-auto px-10 py-8 custom-scroll';
            el.className = 'max-w-2xl';
            el.innerHTML = `<div class="dk-section-title">Live Class Recordings</div>` + items.map((r, i) => {
                return `<div class="dk-rec-card anim-card" style="animation-delay:${i*0.08}s">
                    <div class="dk-rec-thumb">
                        ${svgGraph}
                        <div class="dk-rec-duration">${r.duration || '00:00'}</div>
                        <div class="dk-rec-play"><i data-lucide="play" class="w-5 h-5 text-white"></i></div>
                    </div>
                    <div class="dk-rec-info">
                        <div class="dk-rec-title">${r.title}</div>
                        <div class="dk-rec-date">${r.date}</div>
                    </div>
                </div>`;
            }).join('');
        } else {
            // Notes / Practice: list layout
            const sectionLabel = currentTab === 'notes' ? 'Notes & Study Material' : 'Practice Sheets';
            el.parentElement.className = 'flex-1 overflow-y-auto px-10 py-8 custom-scroll';
            el.className = 'max-w-2xl';
            el.innerHTML = `<div class="dk-section-title">${sectionLabel}</div>` + items.map((r, i) => {
                const tc = typeColors[r.type] || typeColors['PDF'];
                const kindleBtn = r.driveId ? `<div class="dk-card-dl dk-kindle-trigger" style="opacity:1; transform:none; background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.2);" title="Kindle Mode" onclick="event.stopPropagation(); openKindleMode('${r.driveId}', '${(r.title || '').replace(/'/g, "\\'")}')">
                        <i data-lucide="book-open" class="w-4 h-4" style="color:#f59e0b;"></i>
                    </div>` : '';
                return `<div class="dk-note-card anim-card" style="animation-delay:${i*0.06}s">
                    <div class="dk-note-icon ${tc.bg} border ${tc.border}">
                        <i data-lucide="${r.icon}" class="w-5 h-5 ${tc.icon}"></i>
                    </div>
                    <div class="dk-note-info">
                        <div class="dk-note-title">${r.title}</div>
                        <div class="dk-note-meta">
                            <span class="${tc.text}">${r.type}</span>
                            ${r.size ? `<span class="text-neutral-600">&bull;</span><span class="text-neutral-500">${r.size}</span>` : ''}
                            ${r.date ? `<span class="text-neutral-600">&bull;</span><span class="text-neutral-500">${r.date}</span>` : ''}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        ${kindleBtn}
                        <div class="dk-card-dl" style="opacity:1; transform:none; cursor:pointer;" title="${r.driveId ? 'View PDF' : 'Open in Drive'}" onclick="openDriveFile('${r.link || '#'}', ${r.driveId ? "'" + r.driveId + "'" : 'null'}, '${(r.title || '').replace(/'/g, "\\'")}')">
                            <i data-lucide="${r.driveId ? 'eye' : 'external-link'}" class="w-4 h-4"></i>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }
        if (items.length === 0) el.innerHTML = '<div class="col-span-3 text-center py-16 text-neutral-600"><i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3 opacity-30"></i><p class="text-sm font-bold">No resources yet</p></div>';
        lucide.createIcons();
    }

    function dkSelectSubject(id) {
        currentSubject = id;
        currentChapter = DB.chapters[id]?.[0]?.id || null;
        currentTab = 'notes';
        dkResetTabs();
        dkRenderSubjects();
        dkRenderChapters();
        if (currentChapter) dkRenderContent();
    }

    function dkSelectChapter(id) {
        currentChapter = id;
        currentTab = 'notes';
        dkResetTabs();
        dkRenderChapters();
        dkRenderContent();
    }

    function dkSwitchTab(tab, btn) {
        currentTab = tab;
        document.querySelectorAll('.dk-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        dkRenderContent();
    }

    function dkResetTabs() {
        document.querySelectorAll('.dk-tab').forEach((t, i) => {
            t.classList.toggle('active', i === 0);
        });
    }

    function dkChapFilter() { dkRenderChapters(); }

    /* =============================================
       DYNAMIC GLOBAL SEARCH
       ============================================= */
    let dkSearchFocusIdx = -1;

    function highlightMatch(text, query) {
        if (!query) return text;
        const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.replace(new RegExp(`(${esc})`, 'gi'), '<mark>$1</mark>');
    }

    function dkSearchFilter() {
        const input = document.getElementById('dkSearch');
        const dd = document.getElementById('dkSearchDropdown');
        const q = (input?.value || '').trim().toLowerCase();
        dkSearchFocusIdx = -1;

        if (!q) { dd.classList.remove('open'); dd.innerHTML = ''; return; }

        let results = [];

        // Search subjects
        DB.subjects.forEach(s => {
            if (s.name.toLowerCase().includes(q) || s.short.toLowerCase().includes(q)) {
                results.push({ group: 'Subjects', icon: s.icon, color: s.color,
                    title: s.name, meta: (DB.chapters[s.id]||[]).length + ' chapters',
                    badge: null, action: () => { dkSelectSubject(s.id); dkCloseSearch(); }});
            }
        });

        // Search chapters across all subjects
        DB.subjects.forEach(s => {
            (DB.chapters[s.id]||[]).forEach(c => {
                if (c.title.toLowerCase().includes(q)) {
                    results.push({ group: 'Chapters', icon: 'book-open', color: '#00d2ff',
                        title: c.title, meta: s.name + ' · ' + c.modules + ' files',
                        badge: s.short, badgeColor: s.color,
                        action: () => { dkSelectSubject(s.id); dkSelectChapter(c.id); dkCloseSearch(); }});
                }
            });
        });

        // Search resources across all subjects and chapters
        DB.subjects.forEach(s => {
            (DB.chapters[s.id]||[]).forEach(c => {
                const chapRes = getResources(s.id, c.id);
                ['notes','recordings','practice'].forEach(tab => {
                    (chapRes[tab]||[]).forEach(r => {
                        if (r.title.toLowerCase().includes(q) || r.type.toLowerCase().includes(q)) {
                            const tc = typeColors[r.type] || typeColors['PDF'];
                            results.push({ group: 'Resources', icon: r.icon, color: r.type === 'VID' ? '#a855f7' : r.type === 'IMG' ? '#3b82f6' : r.type === 'DOC' ? '#22c55e' : '#ef4444',
                                title: r.title, meta: s.short + ' · ' + c.title + ' · ' + r.type,
                                badge: s.short, badgeColor: s.color,
                                action: () => { dkSelectSubject(s.id); dkSelectChapter(c.id); dkCloseSearch(); }});
                        }
                    });
                });
            });
        });

        // Build dropdown HTML
        if (results.length === 0) {
            dd.innerHTML = `<div class="dk-search-empty">
                <i data-lucide="search-x" class="w-8 h-8 mx-auto block"></i>
                <p>No results for "<strong>${input.value}</strong>"</p>
            </div>`;
        } else {
            let html = '';
            let currentGroup = '';
            results.forEach((r, i) => {
                if (r.group !== currentGroup) {
                    currentGroup = r.group;
                    html += `<div class="dk-search-group-label">${r.group}</div>`;
                }
                const badgeHtml = r.badge ? `<span class="dk-search-item-badge" style="background:${r.badgeColor}15;color:${r.badgeColor};border:1px solid ${r.badgeColor}30;">${r.badge}</span>` : '';
                html += `<div class="dk-search-item" data-idx="${i}" onclick="dkSearchResults[${i}].action()">
                    <div class="dk-search-item-icon" style="background:${r.color}15;border:1px solid ${r.color}25;border-radius:10px;">
                        <i data-lucide="${r.icon}" class="w-4 h-4" style="color:${r.color}"></i>
                    </div>
                    <div class="dk-search-item-text">
                        <div class="dk-search-item-title">${highlightMatch(r.title, input.value)}</div>
                        <div class="dk-search-item-meta">${r.meta}</div>
                    </div>
                    ${badgeHtml}
                </div>`;
            });
            html += `<div class="dk-search-hint">
                <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
                <span><kbd>↵</kbd> select</span>
                <span><kbd>esc</kbd> close</span>
            </div>`;
            dd.innerHTML = html;
        }

        window.dkSearchResults = results;
        dd.classList.add('open');
        lucide.createIcons();
    }

    function dkSearchFocus() {
        const q = (document.getElementById('dkSearch')?.value || '').trim();
        if (q) dkSearchFilter();
    }

    function dkCloseSearch() {
        const dd = document.getElementById('dkSearchDropdown');
        const input = document.getElementById('dkSearch');
        dd.classList.remove('open');
        input.value = '';
        dkSearchFocusIdx = -1;
    }

    function dkSwitchTabByName(tab) {
        currentTab = tab;
        document.querySelectorAll('.dk-tab').forEach(t => {
            const tabName = t.textContent.trim().toLowerCase();
            t.classList.toggle('active', tabName === tab);
        });
        dkRenderContent();
    }

    // Keyboard navigation for search
    document.addEventListener('keydown', function(e) {
        const dd = document.getElementById('dkSearchDropdown');
        if (!dd || !dd.classList.contains('open')) {
            // Ctrl+K or / to focus search
            if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && document.activeElement.tagName !== 'INPUT')) {
                e.preventDefault();
                document.getElementById('dkSearch')?.focus();
            }
            return;
        }

        const items = dd.querySelectorAll('.dk-search-item');
        if (!items.length) return;

        if (e.key === 'Escape') {
            e.preventDefault(); dkCloseSearch(); document.getElementById('dkSearch')?.blur(); return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            dkSearchFocusIdx = Math.min(dkSearchFocusIdx + 1, items.length - 1);
            items.forEach((it, i) => it.classList.toggle('focused', i === dkSearchFocusIdx));
            items[dkSearchFocusIdx]?.scrollIntoView({ block: 'nearest' });
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            dkSearchFocusIdx = Math.max(dkSearchFocusIdx - 1, 0);
            items.forEach((it, i) => it.classList.toggle('focused', i === dkSearchFocusIdx));
            items[dkSearchFocusIdx]?.scrollIntoView({ block: 'nearest' });
        }
        if (e.key === 'Enter' && dkSearchFocusIdx >= 0 && window.dkSearchResults?.[dkSearchFocusIdx]) {
            e.preventDefault();
            window.dkSearchResults[dkSearchFocusIdx].action();
        }
    });

    // Click outside to close
    document.addEventListener('click', function(e) {
        const wrap = e.target.closest('.dk-search-wrap');
        if (!wrap) dkCloseSearch();
    });

    function dkBreadSubject() { /* Focus back on subject */ }

    /* =============================================
       SIDEBAR COLLAPSE (Desktop)
       ============================================= */
    function toggleSidebar() {
        const sidebar = document.getElementById('dkSubjectSidebar');
        const expandBtn = document.getElementById('sidebarExpandBtn');
        if (!sidebar) return;
        sidebar.classList.toggle('collapsed');
        const collapsed = sidebar.classList.contains('collapsed');
        if (expandBtn) expandBtn.classList.toggle('visible', collapsed);
        localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
        lucide.createIcons();
    }

    // Restore sidebar state on load
    function restoreSidebarState() {
        if (localStorage.getItem('sidebarCollapsed') === '1') {
            const sidebar = document.getElementById('dkSubjectSidebar');
            const expandBtn = document.getElementById('sidebarExpandBtn');
            if (sidebar) {
                sidebar.classList.add('collapsed');
                if (expandBtn) expandBtn.classList.add('visible');
            }
        }
    }

    /* =============================================
       MOBILE RENDERING
       ============================================= */
    function mobRenderSubjectGrid() {
        const el = document.getElementById('mobSubjectGrid');
        if (!el) return;
        el.innerHTML = DB.subjects.map(s => {
            const chapCount = (DB.chapters[s.id] || []).length;
            const isActive = s.id === currentSubject;
            return `<div class="mob-sub-card ${isActive ? 'active' : ''}" style="--card-glow:${s.color}15;" onclick="mobSelectSubject('${s.id}')">
                <div class="mob-sub-card-icon" style="background:${s.color}18;border:1px solid ${s.color}30;">
                    <i data-lucide="${s.icon}" class="w-5 h-5" style="color:${s.color}"></i>
                </div>
                <span class="mob-sub-card-name">${s.name}</span>
                <span class="mob-sub-card-meta">${chapCount} chapters</span>
            </div>`;
        }).join('');
        lucide.createIcons();
        mobUpdateActiveBar();
    }

    function mobUpdateActiveBar() {
        const sub = getSubject(currentSubject);
        if (!sub) return;
        const iconEl = document.getElementById('mobActiveSubIcon');
        const labelEl = document.getElementById('mobActiveSubLabel');
        if (iconEl) {
            iconEl.style.background = sub.color + '18';
            iconEl.style.border = '1px solid ' + sub.color + '30';
            iconEl.innerHTML = `<i data-lucide="${sub.icon}" class="w-3.5 h-3.5" style="color:${sub.color}"></i>`;
        }
        if (labelEl) labelEl.textContent = sub.name;
        lucide.createIcons();
    }

    function mobToggleSubjectPicker() {
        const overlay = document.getElementById('mobSubjectOverlay');
        const btn = document.getElementById('mobGridBtn');
        const isOpen = overlay.classList.contains('open');
        if (isOpen) {
            mobCloseSubjectPicker();
        } else {
            overlay.classList.add('open');
            btn.classList.add('open');
        }
    }

    function mobCloseSubjectPicker() {
        document.getElementById('mobSubjectOverlay')?.classList.remove('open');
        document.getElementById('mobGridBtn')?.classList.remove('open');
    }

    function mobRenderChapters() {
        const el = document.getElementById('mobChapterList');
        if (!el) return;
        const sub = getSubject(currentSubject);
        const chapters = DB.chapters[currentSubject] || [];
        const search = (document.getElementById('mobSearchInput')?.value || '').toLowerCase();
        const filtered = chapters.filter(c => c.title.toLowerCase().includes(search));

        document.getElementById('mobSubTitle').textContent = sub.name;
        document.getElementById('mobChapCount').textContent = chapters.length + ' chapters';

        el.innerHTML = filtered.map((c, i) => {
            return `<div class="mob-chap-card anim-card" style="animation-delay:${i*0.05}s" onclick="mobSelectChapter('${c.id}')">
                <div class="mob-chap-num bg-white/[0.04] text-neutral-400">${String(i+1).padStart(2,'0')}</div>
                <div class="flex-1 min-w-0">
                    <p class="text-[13px] font-bold text-white leading-snug">${c.title}</p>
                    <span class="text-[10px] text-neutral-500 font-bold mt-1 inline-block">${c.modules} files</span>
                </div>
                <div class="mob-chap-chevron"><i data-lucide="chevron-right" class="w-4 h-4"></i></div>
            </div>`;
        }).join('');
        if (filtered.length === 0) el.innerHTML = '<div class="text-center py-16 text-neutral-600 text-xs font-bold">No chapters found</div>';
        lucide.createIcons();
    }

    function mobRenderResources() {
        const el = document.getElementById('mobResourceList');
        if (!el) return;
        const chap = getChapter(currentSubject, currentChapter);
        const sub = getSubject(currentSubject);
        if (!chap || !sub) return;

        document.getElementById('mobContentTitle').textContent = chap.title;
        document.getElementById('mobContentSub').textContent = sub.name + ' \u2022 ' + chap.modules + ' files';
        document.getElementById('mobHeroTitle').textContent = chap.title;
        document.getElementById('mobHeroModules').textContent = chap.modules + ' files';

        const chapRes = getResources(currentSubject, currentChapter);
        const items = chapRes[currentTab] || [];
        el.innerHTML = items.map((r, i) => {
            const tc = typeColors[r.type] || typeColors['PDF'];
            const mobKindleBtn = r.driveId ? `<div class="mob-res-kindle" onclick="event.stopPropagation(); openKindleMode('${r.driveId}', '${(r.title || '').replace(/'/g, "\\'")}')">
                    <i data-lucide="book-open" class="w-3.5 h-3.5" style="color:#f59e0b;"></i>
                </div>` : '';
            return `<div class="mob-res-card anim-card" style="animation-delay:${i*0.05}s" onclick="openDriveFile('${r.link || '#'}', ${r.driveId ? "'" + r.driveId + "'" : 'null'}, '${(r.title || '').replace(/'/g, "\\'")}')">
                <div class="mob-res-icon ${tc.bg} border ${tc.border}">
                    <i data-lucide="${r.icon}" class="w-5 h-5 ${tc.icon}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-[13px] font-bold text-white leading-snug">${r.title}</p>
                    <div class="flex items-center gap-2 mt-1">
                        ${r.date ? `<span class="text-[10px] text-neutral-500 font-bold">${r.date}</span><span class="w-1 h-1 rounded-full bg-neutral-700"></span>` : ''}
                        ${r.size ? `<span class="text-[10px] text-neutral-500 font-bold">${r.size}</span>` : ''}
                        <span class="text-[10px] font-bold ${tc.text} ml-1">${r.type}</span>
                    </div>
                </div>
                ${mobKindleBtn}
                <div class="mob-res-dl" title="Open">
                    <i data-lucide="external-link" class="w-4 h-4"></i>
                </div>
            </div>`;
        }).join('');
        if (items.length === 0) el.innerHTML = '<div class="text-center py-16 text-neutral-600"><i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 opacity-30"></i><p class="text-xs font-bold">No resources yet</p></div>';
        lucide.createIcons();
    }

    function mobSelectSubject(id) {
        currentSubject = id;
        currentChapter = DB.chapters[id]?.[0]?.id || null;
        mobCloseSubjectPicker();
        mobRenderSubjectGrid();
        mobRenderChapters();
    }

    function mobSelectChapter(id) {
        currentChapter = id;
        currentTab = 'notes';
        mobResetTabs();
        mobRenderResources();
        // Slide to content screen
        document.getElementById('mobScreenChapters').className = 'mob-screen off-left';
        document.getElementById('mobScreenContent').className = 'mob-screen center';
    }

    function mobGoBack() {
        document.getElementById('mobScreenChapters').className = 'mob-screen center';
        document.getElementById('mobScreenContent').className = 'mob-screen off-right';
    }

    function mobSwitchTab(tab, btn) {
        currentTab = tab;
        document.querySelectorAll('.mob-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        mobRenderResources();
    }

    function mobResetTabs() {
        document.querySelectorAll('.mob-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    }

    function mobToggleSearch() {
        const w = document.getElementById('mobSearchWrap');
        w.classList.toggle('hidden');
        if (!w.classList.contains('hidden')) document.getElementById('mobSearchInput').focus();
    }

    function mobFilterChapters() { mobRenderChapters(); }

    /* =============================================
       INIT
       ============================================= */
    function isMobile() { return window.innerWidth < 768; }

    async function loadDB() {
        try {
            const resp = await fetch('/static/classroom_schema.json');
            const data = await resp.json();
            DB = data;
            currentSubject = DB.subjects[0]?.id || '';
            currentChapter = (DB.chapters[currentSubject] || [])[0]?.id || '';
        } catch (e) {
            console.error('Failed to load classroom schema:', e);
        }
    }

    async function initApp() {
        restoreNotesTheme();
        if (!DB.subjects.length) await loadDB();
        if (isMobile()) {
            mobRenderSubjectGrid();
            mobRenderChapters();
        } else {
            restoreSidebarState();
            restoreChapterPanelState();
            dkRenderSubjects();
            dkRenderChapters();
            dkRenderContent();
        }
    }

    // Expose toggleSidebar globally for onclick
    window.toggleSidebar = toggleSidebar;

    /* =============================================
       THEME TOGGLE (Dark / Light)
       ============================================= */
    function toggleNotesTheme() {
        const isLight = document.body.classList.toggle('light-theme');
        localStorage.setItem('notesTheme', isLight ? 'light' : 'dark');
        updateThemeIcons();
    }

    function updateThemeIcons() {
        const isLight = document.body.classList.contains('light-theme');
        document.querySelectorAll('.notes-icon-sun').forEach(el => el.classList.toggle('hidden', !isLight));
        document.querySelectorAll('.notes-icon-moon').forEach(el => el.classList.toggle('hidden', isLight));
    }

    function restoreNotesTheme() {
        const saved = localStorage.getItem('notesTheme');
        if (saved === 'light') {
            document.body.classList.add('light-theme');
        }
        updateThemeIcons();
    }

    window.toggleNotesTheme = toggleNotesTheme;

    /* =============================================
       CHAPTER PANEL TOGGLE (Desktop)
       ============================================= */
    function toggleChapterPanel() {
        const panel = document.getElementById('dkChapterPanel');
        const expandBtn = document.getElementById('chapterExpandBtn');
        if (!panel) return;
        panel.classList.toggle('collapsed');
        const collapsed = panel.classList.contains('collapsed');
        if (expandBtn) expandBtn.classList.toggle('visible', collapsed);
        localStorage.setItem('chapterPanelCollapsed', collapsed ? '1' : '0');
        lucide.createIcons();
    }

    function restoreChapterPanelState() {
        if (localStorage.getItem('chapterPanelCollapsed') === '1') {
            const panel = document.getElementById('dkChapterPanel');
            const expandBtn = document.getElementById('chapterExpandBtn');
            if (panel) {
                panel.classList.add('collapsed');
                if (expandBtn) expandBtn.classList.add('visible');
            }
        }
    }

    window.toggleChapterPanel = toggleChapterPanel;

    window.addEventListener('resize', initApp);

    // Browser back button for mobile
    window.addEventListener('popstate', () => {
        if (isMobile()) {
            const content = document.getElementById('mobScreenContent');
            if (content && !content.classList.contains('off-right')) {
                mobGoBack();
            }
        }
    });

    window.onload = () => { initApp(); };

    /* =============================================
       FLASHCARD GENERATOR
       ============================================= */
    let fcAllCards = [];
    let fcFiltered = [];
    let fcIndex = 0;
    let fcFlipped = false;
    let fcSwipeStartX = 0;
    let fcSwipeStartY = 0;
    let fcSwiping = false;

    const fcColorMap = {
        orange: { bg: 'linear-gradient(135deg, #ea580c, #fb923c)', glow: 'rgba(234,88,12,0.25)' },
        cyan:   { bg: 'linear-gradient(135deg, #0891b2, #22d3ee)', glow: 'rgba(8,145,178,0.25)' },
        purple: { bg: 'linear-gradient(135deg, #7c3aed, #a78bfa)', glow: 'rgba(124,58,237,0.25)' },
        green:  { bg: 'linear-gradient(135deg, #16a34a, #4ade80)', glow: 'rgba(22,163,74,0.25)' },
        pink:   { bg: 'linear-gradient(135deg, #db2777, #f472b6)', glow: 'rgba(219,39,119,0.25)' },
        blue:   { bg: 'linear-gradient(135deg, #2563eb, #60a5fa)', glow: 'rgba(37,99,235,0.25)' },
        red:    { bg: 'linear-gradient(135deg, #dc2626, #f87171)', glow: 'rgba(220,38,38,0.25)' },
        teal:   { bg: 'linear-gradient(135deg, #0d9488, #2dd4bf)', glow: 'rgba(13,148,136,0.25)' },
    };

    const fcDiffIcon = { easy: '\u{1F7E2}', medium: '\u{1F7E1}', hard: '\u{1F534}' };
    const fcMnemonicLabel = {
        emoji_story: '\u{1F9E0} Memory Aid',
        acronym: '\u{1F524} Acronym',
        analogy: '\u{1F4A1} Analogy',
        rhyme: '\u{1F3B5} Rhyme'
    };

    const FC_LOADING_HTML = `<div class="fc-spinner"></div>
        <p style="font-size:13px; font-weight:700; color:#888; margin-top:16px;">Generating flashcards with Gemini AI...</p>
        <p style="font-size:11px; color:#444; margin-top:6px;">This may take 15-30 seconds per PDF</p>`;

    const KINDLE_LOADING_HTML = `<div class="fc-spinner"></div>
        <p style="font-size:13px; font-weight:700; color:#888; margin-top:16px;">Extracting content with Gemini AI...</p>
        <p style="font-size:11px; color:#444; margin-top:6px;">Reading and structuring the PDF...</p>`;

    /**
     * autoWrapMath(text) — Detects plain-text math and wraps with $...$ delimiters.
     * Handles cases where Gemini outputs equations without LaTeX notation.
     * If text already has $, \( or \[ delimiters, returns it unchanged.
     */
    function autoWrapMath(text) {
        if (!text) return '';
        // Already has LaTeX delimiters — leave it alone
        if (/\$/.test(text) || /\\\(/.test(text) || /\\\[/.test(text)) return text;

        // Pattern to detect equation-like expressions:
        // Must contain = and math-like chars (^, _, /, parentheses with variables)
        // e.g. "ID = Is(e^VD/nVT - 1)", "F = ma", "E = mc^2"
        return text.replace(
            /(?:^|(?<=\s|:|,))([A-Za-zΔαβγδεζηθικλμνξπρστυφχψωΩ∞∑∫√∂∇]+(?:[₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹ₐₑᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]*)\s*=\s*[A-Za-z0-9\^\_\/\(\)\+\-\*\.\,\s\[\]{}ΔαβγδεζηθικλμνξπρστυφχψωΩ∞∑∫√∂∇⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+?)(?=\s*$|\s*[,.]?\s*$|\s+[A-Z🔴🟢🟡📈📉✅❌⚡💡🧠])/gm,
            function(match, eq) {
                return '$' + eq.trim() + '$';
            }
        );
    }

    /**
     * renderMathIn(el) — Scans an element for LaTeX math delimiters and renders them with KaTeX.
     * Supports: $$...$$ and $...$ (dollar), \[...\] and \(...\) (standard LaTeX).
     * Processes all text nodes to avoid breaking existing HTML structure.
     */
    function renderMathIn(el) {
        if (typeof katex === 'undefined' || !el) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        textNodes.forEach(function(node) {
            const text = node.textContent;
            if (!text) return;
            // Quick check — must contain at least one delimiter
            if (!text.includes('$') && !text.includes('\\(') && !text.includes('\\[')) return;

            // Match all 4 delimiter types: $$...$$, $...$, \[...\], \(...\)
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

    /**
     * mathSafeLineBreaks(str) — Replace literal \n with <br> but preserve LaTeX inside delimiters.
     * Prevents \nabla, \nu, etc. from being corrupted.
     */
    function mathSafeLineBreaks(str) {
        if (!str) return '';
        // First auto-wrap plain-text math
        str = autoWrapMath(str);
        const parts = [];
        const regex = /(\$\$[\s\S]+?\$\$|\$(?!\$)[\s\S]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(str)) !== null) {
            // Process non-math text: replace \n with <br>
            parts.push(str.slice(lastIndex, match.index).replace(/\\n/g, '<br>').replace(/\n/g, '<br>'));
            // Keep math as-is
            parts.push(match[0]);
            lastIndex = match.index + match[0].length;
        }
        // Process remaining non-math text
        parts.push(str.slice(lastIndex).replace(/\\n/g, '<br>').replace(/\n/g, '<br>'));
        return parts.join('');
    }

    function openFcSelectModal() {
        const chapRes = getResources(currentSubject, currentChapter);
        const allItems = [...(chapRes.notes || []), ...(chapRes.practice || [])];
        const pdfs = allItems.filter(r => r.driveId);
        const listEl = document.getElementById('fcSelectList');
        if (!listEl) return;

        if (pdfs.length === 0) {
            listEl.innerHTML = '<p style="text-align:center; color:#555; font-size:12px; font-weight:700; padding:32px 0;">No PDFs available in this chapter</p>';
        } else {
            listEl.innerHTML = pdfs.map((r, i) => {
                const tc = typeColors[r.type] || typeColors['PDF'];
                return `<label class="fc-select-item">
                    <input type="checkbox" value="${r.driveId}" data-title="${(r.title || '').replace(/"/g, '&quot;')}" class="fc-pdf-checkbox" checked>
                    <div class="fc-select-icon ${tc.bg} border ${tc.border}">
                        <i data-lucide="file-text" class="w-4 h-4 ${tc.icon}"></i>
                    </div>
                    <span style="font-size:12px; font-weight:700; color:white; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${r.title}</span>
                </label>`;
            }).join('');
        }

        document.getElementById('fcSelectModal').classList.add('open');
        lucide.createIcons();
    }

    function closeFcSelectModal() {
        document.getElementById('fcSelectModal')?.classList.remove('open');
    }

    async function startFlashcardGeneration() {
        const checkboxes = document.querySelectorAll('.fc-pdf-checkbox:checked');
        const driveIds = Array.from(checkboxes).map(cb => cb.value);
        if (driveIds.length === 0) return;

        closeFcSelectModal();

        // Reset filter dropdowns
        const diffSelect = document.getElementById('fcFilterDifficulty');
        const catSelect = document.getElementById('fcFilterCategory');
        if (diffSelect) diffSelect.value = 'all';
        if (catSelect) catSelect.value = 'all';

        // Reset loading state HTML (in case previous attempt errored)
        document.getElementById('flashcardLoading').innerHTML = FC_LOADING_HTML;

        const overlay = document.getElementById('flashcardOverlay');
        overlay.classList.add('open');
        document.getElementById('flashcardLoading').style.display = 'flex';
        document.getElementById('flashcardContainer').style.display = 'none';
        document.getElementById('flashcardNav').style.display = 'none';
        document.body.style.overflow = 'hidden';

        try {
            const resp = await fetch('/generate_flashcards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ driveIds: driveIds })
            });
            const data = await resp.json();

            if (data.status === 'auth_required') {
                closeFlashcardOverlay();
                window.location.href = '/google/auth';
                return;
            }
            if (data.status !== 'success') throw new Error(data.message || 'Generation failed');

            fcAllCards = data.flashcards || [];
            fcFiltered = [...fcAllCards];
            fcIndex = 0;
            fcFlipped = false;

            document.getElementById('flashcardTitle').textContent = data.source_title || 'Flashcards';
            document.getElementById('flashcardLoading').style.display = 'none';
            document.getElementById('flashcardContainer').style.display = 'flex';
            document.getElementById('flashcardNav').style.display = 'flex';

            renderCurrentFlashcard();
            lucide.createIcons();

        } catch (err) {
            console.error('Flashcard generation error:', err);
            document.getElementById('flashcardLoading').innerHTML = `
                <div style="text-align:center;">
                    <i data-lucide="alert-triangle" class="w-12 h-12" style="color:#ef4444; margin:0 auto 12px; display:block;"></i>
                    <p style="font-size:14px; font-weight:700; color:#ef4444;">Failed to generate flashcards</p>
                    <p style="font-size:11px; color:#666; margin-top:6px;">${err.message}</p>
                    <button onclick="closeFlashcardOverlay()" style="margin-top:16px; padding:8px 20px; border-radius:10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:white; font-size:12px; font-weight:700; cursor:pointer;">Close</button>
                </div>`;
            lucide.createIcons();
        }
    }

    function renderCurrentFlashcard() {
        const container = document.getElementById('flashcardContainer');
        const counter = document.getElementById('flashcardCounter');
        const fill = document.getElementById('fcProgressFill');

        if (fcFiltered.length === 0) {
            container.innerHTML = '<p style="color:#666; font-size:13px; font-weight:700;">No flashcards match the current filter.</p>';
            if (counter) counter.textContent = '0 / 0';
            if (fill) fill.style.width = '0%';
            return;
        }

        // Guard index bounds
        if (fcIndex >= fcFiltered.length) fcIndex = fcFiltered.length - 1;
        if (fcIndex < 0) fcIndex = 0;

        const card = fcFiltered[fcIndex];
        const colors = fcColorMap[card.color_theme] || fcColorMap.orange;

        const mnemonicHtml = card.mnemonic ? `
            <div class="fc-mnemonic">
                <span class="fc-mnemonic-label">${fcMnemonicLabel[card.mnemonic.type] || '\u{1F9E0} Hint'}</span>
                <span class="fc-mnemonic-text">${autoWrapMath(card.mnemonic.content)}</span>
            </div>` : '';

        const tagsHtml = (card.tags || []).length > 0 ? `
            <div class="fc-tags">${card.tags.map(t => `<span class="fc-tag">${t}</span>`).join('')}</div>` : '';

        container.innerHTML = `
            <div class="fc-card ${fcFlipped ? 'flipped' : ''}" onclick="flashcardFlip()">
                <div class="fc-card-inner">
                    <div class="fc-card-front" style="background:${colors.bg}; box-shadow:0 20px 60px ${colors.glow};">
                        <div class="fc-badge">${fcDiffIcon[card.difficulty] || ''} ${card.category}</div>
                        <div class="fc-question">${autoWrapMath(card.front)}</div>
                        ${mnemonicHtml}
                        <div class="fc-tap-hint">TAP TO FLIP \u{1F501}</div>
                    </div>
                    <div class="fc-card-back" style="box-shadow:0 20px 60px ${colors.glow};">
                        <div class="fc-badge fc-badge-back">${fcDiffIcon[card.difficulty] || ''} ANSWER</div>
                        <div class="fc-answer">${mathSafeLineBreaks(card.back)}</div>
                        ${tagsHtml}
                        <div class="fc-tap-hint" style="color:rgba(255,255,255,0.25);">TAP TO FLIP BACK \u{1F501}</div>
                    </div>
                </div>
            </div>`;

        if (counter) counter.textContent = (fcIndex + 1) + ' / ' + fcFiltered.length;
        const pct = ((fcIndex + 1) / fcFiltered.length) * 100;
        if (fill) fill.style.width = pct + '%';
        lucide.createIcons();
        renderMathIn(container);
    }

    function flashcardFlip() {
        fcFlipped = !fcFlipped;
        const card = document.querySelector('.fc-card');
        if (card) card.classList.toggle('flipped', fcFlipped);
    }

    function flashcardNext() {
        if (fcFiltered.length === 0) return;
        if (fcIndex < fcFiltered.length - 1) {
            fcIndex++;
            fcFlipped = false;
            const container = document.getElementById('flashcardContainer');
            container.classList.add('fc-slide-left');
            setTimeout(() => { container.classList.remove('fc-slide-left'); renderCurrentFlashcard(); }, 180);
        }
    }

    function flashcardPrev() {
        if (fcFiltered.length === 0) return;
        if (fcIndex > 0) {
            fcIndex--;
            fcFlipped = false;
            const container = document.getElementById('flashcardContainer');
            container.classList.add('fc-slide-right');
            setTimeout(() => { container.classList.remove('fc-slide-right'); renderCurrentFlashcard(); }, 180);
        }
    }

    function flashcardShuffle() {
        if (fcFiltered.length <= 1) return;
        for (let i = fcFiltered.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [fcFiltered[i], fcFiltered[j]] = [fcFiltered[j], fcFiltered[i]];
        }
        fcIndex = 0;
        fcFlipped = false;
        renderCurrentFlashcard();
    }

    function flashcardFilter() {
        const diff = document.getElementById('fcFilterDifficulty').value;
        const cat = document.getElementById('fcFilterCategory').value;
        fcFiltered = fcAllCards.filter(c => {
            if (diff !== 'all' && c.difficulty !== diff) return false;
            if (cat !== 'all' && c.category !== cat) return false;
            return true;
        });
        fcIndex = 0;
        fcFlipped = false;
        renderCurrentFlashcard();
    }

    function closeFlashcardOverlay() {
        document.getElementById('flashcardOverlay')?.classList.remove('open');
        document.body.style.overflow = '';
    }

    // Touch swipe support for flashcards
    function fcTouchStart(e) {
        const fcOverlay = document.getElementById('flashcardOverlay');
        if (!fcOverlay || !fcOverlay.classList.contains('open')) return;
        const touch = e.touches[0];
        fcSwipeStartX = touch.clientX;
        fcSwipeStartY = touch.clientY;
        fcSwiping = true;
    }
    function fcTouchMove(e) {
        if (!fcSwiping) return;
        const touch = e.touches[0];
        const dx = touch.clientX - fcSwipeStartX;
        const dy = touch.clientY - fcSwipeStartY;
        // Only horizontal swipe — if mostly vertical, ignore
        if (Math.abs(dy) > Math.abs(dx)) { fcSwiping = false; return; }
        const card = document.querySelector('.fc-card');
        if (card && Math.abs(dx) > 10) {
            card.style.transition = 'none';
            card.style.transform = 'translateX(' + dx * 0.4 + 'px) rotate(' + dx * 0.02 + 'deg)';
            card.style.opacity = Math.max(0.5, 1 - Math.abs(dx) / 500);
        }
    }
    function fcTouchEnd(e) {
        if (!fcSwiping) return;
        fcSwiping = false;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - fcSwipeStartX;
        const card = document.querySelector('.fc-card');
        if (card) {
            card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            card.style.transform = '';
            card.style.opacity = '';
        }
        if (Math.abs(dx) > 60) {
            if (dx < 0) flashcardNext();
            else flashcardPrev();
        }
    }
    document.addEventListener('touchstart', fcTouchStart, { passive: true });
    document.addEventListener('touchmove', fcTouchMove, { passive: true });
    document.addEventListener('touchend', fcTouchEnd, { passive: true });

    window.openFcSelectModal = openFcSelectModal;
    window.closeFcSelectModal = closeFcSelectModal;
    window.startFlashcardGeneration = startFlashcardGeneration;
    window.flashcardFlip = flashcardFlip;
    window.flashcardNext = flashcardNext;
    window.flashcardPrev = flashcardPrev;
    window.flashcardShuffle = flashcardShuffle;
    window.flashcardFilter = flashcardFilter;
    window.closeFlashcardOverlay = closeFlashcardOverlay;


    /* =============================================
       KINDLE MODE
       ============================================= */
    let kindleFontSize = 16;
    let kindleData = null;
    let kindleScrollHandler = null;

    async function openKindleMode(driveId, title) {
        const overlay = document.getElementById('kindleOverlay');
        overlay.classList.add('open');
        document.getElementById('kindleTitle').textContent = title || 'Kindle Mode';

        // Reset loading state HTML (in case previous attempt errored)
        document.getElementById('kindleLoading').innerHTML = KINDLE_LOADING_HTML;
        document.getElementById('kindleLoading').style.display = 'flex';
        document.getElementById('kindleBody').innerHTML = '';
        document.getElementById('kindleBody').style.display = 'none';
        document.getElementById('kindleFooter').style.display = 'none';
        document.body.style.overflow = 'hidden';

        try {
            const resp = await fetch('/kindle_mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ driveId: driveId })
            });
            const data = await resp.json();

            if (data.status === 'auth_required') {
                closeKindleOverlay();
                window.location.href = '/google/auth';
                return;
            }
            if (data.status !== 'success') throw new Error(data.message || 'Extraction failed');

            kindleData = data.content;

            document.getElementById('kindleLoading').style.display = 'none';
            document.getElementById('kindleBody').style.display = 'block';
            document.getElementById('kindleFooter').style.display = 'flex';

            renderKindleContent();
            lucide.createIcons();

        } catch (err) {
            console.error('Kindle mode error:', err);
            document.getElementById('kindleLoading').innerHTML = `
                <div style="text-align:center;">
                    <i data-lucide="alert-triangle" class="w-12 h-12" style="color:#ef4444; margin:0 auto 12px; display:block;"></i>
                    <p style="font-size:14px; font-weight:700; color:#ef4444;">Failed to extract content</p>
                    <p style="font-size:11px; color:#666; margin-top:6px;">${err.message}</p>
                    <button onclick="closeKindleOverlay()" style="margin-top:16px; padding:8px 20px; border-radius:10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:white; font-size:12px; font-weight:700; cursor:pointer;">Close</button>
                </div>`;
            lucide.createIcons();
        }
    }

    function renderKindleContent() {
        if (!kindleData) return;
        const body = document.getElementById('kindleBody');
        const d = kindleData;

        let html = `<div class="kindle-title-page">
            <h1 class="kindle-doc-title">${d.title || 'Untitled Document'}</h1>
            ${d.author ? `<p class="kindle-doc-author">by ${d.author}</p>` : ''}
            <div class="kindle-doc-meta">${d.total_pages || '?'} pages &bull; ~${d.estimated_read_time_minutes || '?'} min read</div>
            <div class="kindle-divider"></div>
        </div>`;

        (d.chapters || []).forEach(function(chapter) {
            html += `<section class="kindle-chapter">`;
            html += `<h2 class="kindle-chapter-title">${chapter.title || ''}</h2>`;

            (chapter.blocks || []).forEach(function(block) {
                const content = mathSafeLineBreaks(block.content);
                switch (block.type) {
                    case 'heading':
                        html += `<h2 class="kindle-h1">${content}</h2>`;
                        break;
                    case 'subheading':
                        html += `<h3 class="kindle-h2">${content}</h3>`;
                        break;
                    case 'paragraph':
                        html += `<p class="kindle-p">${content}</p>`;
                        break;
                    case 'list':
                        html += `<ul class="kindle-list">${(block.items || []).map(function(li) { return '<li>' + li + '</li>'; }).join('')}</ul>`;
                        break;
                    case 'table':
                        html += '<div class="kindle-table-wrap"><table class="kindle-table">';
                        if (block.headers && block.headers.length > 0) {
                            html += '<thead><tr>' + block.headers.map(function(h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead>';
                        }
                        html += '<tbody>' + (block.rows || []).map(function(row) {
                            return '<tr>' + row.map(function(cell) { return '<td>' + cell + '</td>'; }).join('') + '</tr>';
                        }).join('') + '</tbody></table></div>';
                        break;
                    case 'formula':
                        // Force-wrap entire formula content in $$ if no delimiters present
                        const formulaText = block.content || '';
                        const hasDelimiters = /\$|\\[\(\[]/.test(formulaText);
                        const wrappedFormula = hasDelimiters ? formulaText : '$$' + formulaText + '$$';
                        html += `<div class="kindle-formula">${wrappedFormula}</div>`;
                        break;
                    case 'definition':
                        html += `<div class="kindle-definition">
                            <span class="kindle-def-term">${block.term || ''}</span>
                            <span class="kindle-def-body">${mathSafeLineBreaks(block.definition || block.content)}</span>
                        </div>`;
                        break;
                    case 'example':
                        html += `<div class="kindle-example">
                            <span class="kindle-example-label">\u{1F4DD} Example</span>
                            <div>${content}</div>
                        </div>`;
                        break;
                    case 'note':
                        html += `<div class="kindle-note">\u{1F4CC} ${content}</div>`;
                        break;
                    case 'important':
                        html += `<div class="kindle-important">\u{26A0}\u{FE0F} ${content}</div>`;
                        break;
                    case 'diagram':
                        const diagramImg = block.image ? `<img class="kindle-diagram-img" src="${block.image}" alt="${(block.content || 'Diagram').replace(/"/g, '&quot;')}" loading="lazy">` : '';
                        html += `<div class="kindle-diagram">
                            <span class="kindle-diagram-label">\u{1F4CA} ${block.content || 'Diagram'}</span>
                            ${diagramImg}
                        </div>`;
                        break;
                    case 'diagram_description':
                        html += `<div class="kindle-diagram">
                            <span class="kindle-diagram-label">\u{1F4CA} Diagram</span>
                            <div>${content}</div>
                        </div>`;
                        break;
                    default:
                        html += `<p class="kindle-p">${content}</p>`;
                }
            });

            html += `</section>`;
        });

        body.innerHTML = html;
        body.style.fontSize = kindleFontSize + 'px';
        renderMathIn(body);

        // Remove previous scroll listener to prevent leak
        if (kindleScrollHandler) {
            body.removeEventListener('scroll', kindleScrollHandler);
        }
        kindleScrollHandler = function() {
            const scrollable = body.scrollHeight - body.clientHeight;
            if (scrollable <= 0) return;
            const pct = (body.scrollTop / scrollable) * 100;
            document.getElementById('kindleProgressFill').style.width = pct + '%';
            const totalPages = d.total_pages || 1;
            const currentPage = Math.max(1, Math.ceil((pct / 100) * totalPages));
            document.getElementById('kindlePageInfo').textContent = 'Page ' + currentPage + ' of ' + totalPages;
        };
        body.addEventListener('scroll', kindleScrollHandler);

        document.getElementById('kindlePageInfo').textContent = 'Page 1 of ' + (d.total_pages || '?');
    }

    function kindleChangeFontSize(delta) {
        kindleFontSize = Math.max(12, Math.min(28, kindleFontSize + delta));
        const body = document.getElementById('kindleBody');
        if (body) body.style.fontSize = kindleFontSize + 'px';
        document.getElementById('kindleFontLabel').textContent = kindleFontSize;
    }

    function closeKindleOverlay() {
        const body = document.getElementById('kindleBody');
        if (body && kindleScrollHandler) {
            body.removeEventListener('scroll', kindleScrollHandler);
            kindleScrollHandler = null;
        }
        document.getElementById('kindleOverlay')?.classList.remove('open');
        document.body.style.overflow = '';
    }

    window.openKindleMode = openKindleMode;
    window.kindleChangeFontSize = kindleChangeFontSize;
    window.closeKindleOverlay = closeKindleOverlay;


    /* =============================================
       KEYBOARD SHORTCUTS for overlays
       ============================================= */
    document.addEventListener('keydown', function(e) {
        const fcOverlay = document.getElementById('flashcardOverlay');
        if (fcOverlay && fcOverlay.classList.contains('open')) {
            if (e.key === 'ArrowRight') { e.preventDefault(); flashcardNext(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); flashcardPrev(); }
            else if (e.key === ' ') { e.preventDefault(); flashcardFlip(); }
            else if (e.key === 'Escape') { closeFlashcardOverlay(); }
            return;
        }
        const kindleOv = document.getElementById('kindleOverlay');
        if (kindleOv && kindleOv.classList.contains('open')) {
            if (e.key === 'Escape') { closeKindleOverlay(); }
            return;
        }
    });