  const STAGES = ['backlog', 'in_progress', 'done'];
  const STAGE_LABELS = { backlog: 'Backlog', in_progress: 'In Progress', done: 'Done' };
  const STAGE_EMPTY = {
    backlog: 'Nothing here yet. Add a task above ↑',
    in_progress: 'Drag a backlog task here when you start it.',
    done: 'Tasks you complete will land here.',
  };
  const emptyMarkup = stage => `<li class="col-empty">${STAGE_EMPTY[stage]}</li>`;
  const COLOR_PALETTE = ['#4285F4','#34A853','#EA4335','#FBBC05','#8B5CF6','#F59E0B','#10B981','#EC4899'];

  let categories = [];
  let activeFilter = null;
  let todayFilter = false;
  let selectedColor = COLOR_PALETTE[0];
  let myId = null;
  let myName = '';
  let boardMembers = [];
  let memberships = [];
  let myBoards = [];
  let currentBoard = null; // { id, name, ownerId } — null = default board
  let sidebarOpen = true;
  let currentTab = 'today';
  let todayTasks = [];
  let todayFilterMode = 'all';

  function boardParam() { return currentBoard ? `?board=${currentBoard.id}` : ''; }
  function boardBody()  { return currentBoard ? { boardId: currentBoard.id } : {}; }

  /* ── Boot cache: paints last-seen tasks instantly while the network refresh runs ── */
  const BOOT_CACHE_KEY = 'boot_cache_v1';
  function readBootCache(boardKey) {
    try {
      const raw = localStorage.getItem(BOOT_CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      return c && c.boardKey === boardKey ? c : null;
    } catch { return null; }
  }
  function writeBootCache(payload) {
    try { localStorage.setItem(BOOT_CACHE_KEY, JSON.stringify({ ...payload, ts: Date.now() })); } catch {}
  }
  function clearTaskColumns() {
    STAGES.forEach(s => { getList(s).innerHTML = emptyMarkup(s); });
  }

  /* ── Theme ── */
  function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (theme === 'dark') {
      icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    } else {
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    }
  }

  /* ── Sidebar toggle ── */
  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768) {
      const visible = sidebar.classList.toggle('mobile-visible');
      document.getElementById('sidebar-overlay').classList.toggle('visible', visible);
    } else {
      sidebarOpen = !sidebarOpen;
      sidebar.classList.toggle('collapsed', !sidebarOpen);
    }
  }

  function closeSidebarMobile() {
    document.getElementById('sidebar').classList.remove('mobile-visible');
    document.getElementById('sidebar-overlay').classList.remove('visible');
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  async function apiFetch(method, url, body) {
    const headers = { 'X-Requested-With': 'fetch' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    if (!res.ok && method === 'POST') throw new Error(`Request failed: ${res.status}`);
    if (method !== 'GET' && (url.startsWith('/api/tasks') || url.startsWith('/api/categories'))) {
      try { localStorage.removeItem(BOOT_CACHE_KEY); } catch {}
    }
    return (method === 'POST') ? res.json() : null;
  }

  const apiPost = (url, body) => apiFetch('POST', url, body);
  const apiPut = (url, body) => apiFetch('PUT', url, body);
  const apiDelete = (url) => apiFetch('DELETE', url);

  function getList(stage) { return document.getElementById('list-' + stage); }
  function getCategoryById(id) { return categories.find(c => c.id === Number(id)); }

  function getCardPayload(card) {
    return {
      status: card.querySelector('textarea.status-area').value,
      owners: [...card.querySelectorAll('.chip')].map(c => c.dataset.email),
      cal_start: card.querySelector('.cal-start').value,
      cal_end: card.querySelector('.cal-end').value,
      category_id: card.dataset.categoryId ? Number(card.dataset.categoryId) : null,
      due_date: card.querySelector('.due-date-input').value,
      priority: card.dataset.priority || 'none',
      recurrence: card.querySelector('.recurrence-sel').value,
      subtasks: JSON.parse(card.dataset.subtasks || '[]'),
      assigned_to_user_id: card.dataset.assignedToUserId ? Number(card.dataset.assignedToUserId) : null,
      // boardId handled by boardBody() spread below
      ...boardBody(),
    };
  }

  function updateCounts() {
    STAGES.forEach(stage => {
      const list = getList(stage);
      const visible = [...list.querySelectorAll('.task-card')].filter(c => c.style.display !== 'none').length;
      document.getElementById('count-' + stage).textContent = visible;
      const mtab = document.getElementById('mtab-count-' + stage);
      if (mtab) mtab.textContent = visible;
    });
    const today = new Date().toISOString().split('T')[0];
    const todayCount = [...document.querySelectorAll('.task-card')].filter(c => c.dataset.dueDate === today).length;
    document.getElementById('nav-count-today').textContent = todayCount;
    const allCount = [...document.querySelectorAll('.task-card')].length;
    document.getElementById('nav-count-all').textContent = allCount;
    STAGES.forEach(stage => {
      const list = getList(stage);
      const empty = list.querySelector('.col-empty');
      const hasTasks = list.querySelectorAll('.task-card').length > 0;
      if (empty) empty.style.display = hasTasks ? 'none' : 'block';
    });
    updateBoardHead();
  }

  function currentBoardId() {
    return currentBoard ? currentBoard.id : (myBoards[0] && myBoards[0].id);
  }
  function updateBoardHead() {
    const counts = STAGES.map(s => (getList(s)?.querySelectorAll('.task-card').length) || 0);
    const total = counts.reduce((a, b) => a + b, 0);
    const donePct = total ? Math.round((counts[2] / total) * 100) : 0;
    const pill = document.getElementById('tk-done-pill');
    const fill = document.getElementById('tk-board-bar-fill');
    const nameEl = document.getElementById('tk-board-name');
    if (pill) pill.textContent = donePct + '% done';
    if (fill) fill.style.width = donePct + '%';
    if (nameEl) nameEl.textContent = currentBoard ? currentBoard.name : 'My Board';
  }

  function applyFilter() {
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('.task-card').forEach(card => {
      if (todayFilter) {
        card.style.display = card.dataset.dueDate === today ? '' : 'none';
      } else {
        card.style.display = (!activeFilter || Number(card.dataset.categoryId) === activeFilter) ? '' : 'none';
      }
    });
    updateCounts();
  }

  function setFilter(catId) {
    activeFilter = catId;
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.id === (catId ? String(catId) : 'all'));
    });
    applyFilter();
    updateNavActive();
  }

  function filterToday() {
    closeSidebarMobile();
    exitArchivedView();
    exitDashboardView();
    todayFilter = true;
    activeFilter = null;
    applyFilter();
    document.getElementById('nav-all').classList.remove('active');
    document.getElementById('nav-today').classList.add('active');
    document.querySelectorAll('#sidebar-categories .filter-btn').forEach(b => b.classList.remove('active'));
  }

  function clearTodayFilter() {
    exitArchivedView();
    exitDashboardView();
    todayFilter = false;
    document.getElementById('nav-today').classList.remove('active');
    document.getElementById('nav-all').classList.add('active');
  }

  function updateNavActive() {
    document.getElementById('nav-all').classList.toggle('active', !todayFilter && !activeFilter);
    document.getElementById('nav-today').classList.toggle('active', todayFilter);
  }

  async function renderToday() {
    const el = document.getElementById('screen-today');
    if (!el) return;
    try {
      const res = await fetch('/api/tasks/today', { headers: { 'X-Requested-With': 'fetch' } });
      todayTasks = res.ok ? await res.json() : [];
    } catch { todayTasks = []; }
    paintToday();
  }

  // Re-render from the already-loaded todayTasks without a network round-trip
  // (used by filter chips so switching All/Active/Done feels instant).
  function paintToday() {
    const el = document.getElementById('screen-today');
    if (!el) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueToday = todayTasks.filter(t => t.due_date === todayStr);
    const doneToday = dueToday.filter(t => t.stage === 'done').length;
    const pct = dueToday.length ? Math.round((doneToday / dueToday.length) * 100) : 0;
    const dateLabel = new Date().toLocaleDateString(undefined,
      { weekday: 'long', month: 'long', day: 'numeric' });

    const visible = todayTasks.filter(t =>
      todayFilterMode === 'all' ? true :
      todayFilterMode === 'done' ? t.stage === 'done' : t.stage !== 'done');

    const counts = {
      all: todayTasks.length,
      active: todayTasks.filter(t => t.stage !== 'done').length,
      done: todayTasks.filter(t => t.stage === 'done').length,
    };
    const chip = (mode, label) =>
      `<button class="tk-filter-chip ${todayFilterMode === mode ? 'active' : ''}"
         data-action="setTodayFilter" data-args='["${mode}"]'>${label}
         <span style="opacity:.8;font-size:11px">${counts[mode]}</span></button>`;

    el.innerHTML = `
      <div class="tk-today-head">
        <div>
          <p class="tk-eyebrow">${dateLabel}</p>
          <h1 class="tk-h1">Today</h1>
        </div>
        <div class="tk-ring-wrap">${progressRing(pct, 80, 6)}
          <div class="tk-ring-label"><div class="tk-ring-pct">${pct}%</div>
            <div class="tk-ring-sub">done</div></div></div>
      </div>
      <div class="tk-chip-row">${chip('all','All')}${chip('active','Active')}${chip('done','Done')}</div>
      <div class="tk-today-list">
        ${visible.map(t => todayRow(t, todayStr)).join('') ||
          '<div class="tk-empty">Nothing for today 🎉</div>'}
      </div>
      <button class="tk-add-row" data-action="openQuickAdd">+ Add task…</button>`;
  }

  function todayRow(t, todayStr) {
    const done = t.stage === 'done';
    const overdue = !done && t.due_date && t.due_date !== '' && t.due_date < todayStr;
    return `<div class="tk-task-row ${done ? 'is-done' : ''}">
      <button class="tk-check ${done ? 'on' : ''}" style="${done ? '' : 'border-color:' + prioColor(t.priority)}"
        data-action="toggleTaskDone" data-args='[${t.id},"${done ? 'backlog' : 'done'}",${t.board_id}]'></button>
      <div class="tk-task-main" data-action="openTaskSheet" data-args='[${t.id}]'>
        <div class="tk-task-title">${escapeHtml(t.text)}</div>
        <div class="tk-task-meta">
          <span class="tk-due ${overdue ? 'overdue' : ''}">${t.due_date ? formatDueDate(t.due_date) : ''}</span>
          ${tagChip(t.cat_name, t.cat_color)}
          <span class="tk-board-tag">${escapeHtml(t.board_name || '')}</span>
        </div>
      </div>
      <span class="tk-prio-dot" style="background:${prioColor(t.priority)}"></span>
    </div>`;
  }

  function setTodayFilter(mode) { todayFilterMode = mode; paintToday(); }

  let taskSheetId = null;
  const normSubs = s => Array.isArray(s) ? s : (() => { try { return JSON.parse(s || '[]'); } catch { return []; } })();

  function openTaskSheet(id) {
    const task = todayTasks.find(t => t.id === id);
    if (!task) return;
    taskSheetId = id;
    const subs = normSubs(task.subtasks);
    const prios = ['none', 'low', 'medium', 'high'];
    const body = document.querySelector('#task-sheet .tk-sheet-body');
    body.innerHTML = `
      <div class="tk-sheet-head">
        <div class="tk-sheet-title">${escapeHtml(task.text)}</div>
        <button class="tk-sheet-x" data-action="closeTaskSheet" aria-label="Close">×</button>
      </div>
      <div class="tk-sheet-chips">
        <span class="tk-sheet-chip">${escapeHtml(task.board_name || '')}</span>
        ${tagChip(task.cat_name, task.cat_color)}
      </div>
      <div class="tk-sheet-field has-due">
        <span class="tk-sheet-label">Due</span>
        <input type="hidden" class="due-date-input" value="${task.due_date || ''}">
        <button class="date-trigger ${task.due_date ? '' : 'empty'}" data-action="openDatePicker">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span class="date-trigger-label">${task.due_date ? formatTriggerDate(task.due_date) : 'Set due date…'}</span>
          <span class="date-clear-x" data-action="clearDueDate"${task.due_date ? '' : ' hidden'}>×</span>
        </button>
      </div>
      <div class="tk-sheet-field">
        <span class="tk-sheet-label">Priority</span>
        <div class="tk-prio-seg">
          ${prios.map(p => `<button class="tk-prio-opt ${task.priority === p ? 'active' : ''}" data-action="setSheetPriority" data-args='["${p}"]'>${p}</button>`).join('')}
        </div>
      </div>
      <div class="tk-sheet-field">
        <span class="tk-sheet-label">Note</span>
        <input type="text" class="tk-sheet-note" placeholder="Add a note…" value="${escapeHtml(task.status || '')}">
      </div>
      <div class="tk-sheet-subs">
        <p class="tk-sheet-label">Subtasks · ${subs.filter(s => s.done).length}/${subs.length}</p>
        <div class="tk-sheet-sublist">${subs.map(sheetSubRow).join('')}</div>
        <div class="tk-sheet-addsub">
          <input type="text" class="tk-sheet-subinput" placeholder="Add subtask…">
          <button class="tk-sheet-subadd" data-action="addSheetSub">+</button>
        </div>
      </div>`;
    const due = body.querySelector('.due-date-input');
    due.addEventListener('change', () => persistSheet({ due_date: due.value }));
    const note = body.querySelector('.tk-sheet-note');
    note.addEventListener('change', () => persistSheet({ status: note.value }));
    const si = body.querySelector('.tk-sheet-subinput');
    si.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSheetSub(); } });
    document.getElementById('task-sheet').style.display = 'flex';
  }
  function closeTaskSheet() { document.getElementById('task-sheet').style.display = 'none'; taskSheetId = null; }
  function sheetSubRow(s) {
    return `<div class="tk-sheet-sub ${s.done ? 'done' : ''}">
      <button class="tk-sheet-sub-check" data-action="toggleSheetSub" data-args='[${s.id}]'></button>
      <span>${escapeHtml(s.text)}</span>
      <button class="tk-sheet-sub-x" data-action="removeSheetSub" data-args='[${s.id}]'>×</button>
    </div>`;
  }

  function addSheetSub() {
    const input = document.querySelector('#task-sheet .tk-sheet-subinput');
    const text = input.value.trim();
    if (!text) return;
    const task = todayTasks.find(t => t.id === taskSheetId);
    const subs = normSubs(task.subtasks);
    const maxId = subs.length ? Math.max(...subs.map(s => s.id)) : 0;
    subs.push({ id: maxId + 1, text, done: false });
    task.subtasks = subs;
    persistSheet({ subtasks: subs });
    openTaskSheet(taskSheetId);
    document.querySelector('#task-sheet .tk-sheet-subinput')?.focus();
  }
  function toggleSheetSub(subId) {
    const task = todayTasks.find(t => t.id === taskSheetId);
    const subs = normSubs(task.subtasks);
    const s = subs.find(x => x.id === subId); if (!s) return;
    s.done = !s.done;
    task.subtasks = subs;
    persistSheet({ subtasks: subs });
    openTaskSheet(taskSheetId);
  }
  function removeSheetSub(subId) {
    const task = todayTasks.find(t => t.id === taskSheetId);
    const subs = normSubs(task.subtasks).filter(x => x.id !== subId);
    task.subtasks = subs;
    persistSheet({ subtasks: subs });
    openTaskSheet(taskSheetId);
  }

  async function persistSheet(patch) {
    const task = todayTasks.find(t => t.id === taskSheetId);
    if (!task) return;
    Object.assign(task, patch);
    await apiPut(`/api/tasks/${task.id}?board=${task.board_id}`, { ...patch, boardId: task.board_id });
    paintToday();
  }
  function setSheetPriority(p) {
    const task = todayTasks.find(t => t.id === taskSheetId);
    if (!task) return;
    persistSheet({ priority: p });
    openTaskSheet(taskSheetId);
  }

  async function toggleTaskDone(taskId, newStage, boardId) {
    await apiPut(`/api/tasks/${taskId}?board=${boardId}`, { stage: newStage, boardId });
    // apiFetch() already clears boot_cache_v1 on non-GET to /api/tasks — no manual cache call needed.
    renderToday();
  }

  function openQuickAdd() {
    const m = document.getElementById('quickadd-modal');
    m.style.display = 'flex';
    const inp = document.getElementById('quickadd-input');
    inp.value = '';
    if (!inp.dataset.bound) {
      inp.dataset.bound = '1';
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') submitQuickAdd(); });
    }
    setTimeout(() => inp.focus(), 30);
  }
  function closeQuickAdd() { document.getElementById('quickadd-modal').style.display = 'none'; }
  async function submitQuickAdd() {
    const text = document.getElementById('quickadd-input').value.trim();
    if (!text) return;
    const today = new Date().toISOString().slice(0, 10);
    await apiPost('/api/tasks', { text, stage: 'backlog', due_date: today }); // lands on default board
    closeQuickAdd();
    renderToday();
  }

  async function renderProfile() {
  const el = document.getElementById('screen-profile');
  if (!el) return;
  let d = {};
  try {
    const res = await fetch('/api/dashboard', { headers: { 'X-Requested-With': 'fetch' } });
    d = res.ok ? await res.json() : {};
  } catch { d = {}; }
  const s = d.stats || {};
  const counts = d.counts || {};
  const stat = (val, label) =>
    `<div class="tk-stat tk-card"><div class="tk-stat-val">${val ?? 0}</div>
       <div class="tk-stat-label">${label}</div></div>`;
  const initial = (myName || '?')[0].toUpperCase();
  const row = (label, action, args) =>
    `<button class="tk-set-row" data-action="${action}" ${args ? `data-args='${args}'` : ''}>
       <span>${label}</span>
       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
     </button>`;

  el.innerHTML = `
    <h1 class="tk-h1" style="margin-bottom:24px">Profile</h1>
    <div class="tk-profile-card tk-card">
      <span class="user-avatar large">${initial}</span>
      <div><div class="tk-profile-name">${escapeHtml(myName || '')}</div></div>
    </div>
    <div class="tk-stat-grid">
      ${stat(s.done_total, 'Done')}
      ${stat(s.completed_week, 'This week')}
      ${stat(counts.open, 'Open')}
      ${stat(counts.overdue, 'Overdue')}
    </div>
    <div class="tk-settings tk-card">
      <p class="tk-settings-head">Settings</p>
      ${row('Appearance', 'toggleTheme')}
      ${row('Notifications', 'openDigestPicker')}
      ${row('Boards', 'gotoTab', '["board"]')}
      ${row('Search', 'openSearch')}
      <a class="tk-set-row" href="/api/export"><span>Export data</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></a>
      ${row('About &amp; help', 'openHelpModal')}
      <a class="tk-set-row danger" href="/auth/logout"><span>Sign out</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></a>
    </div>`;
}
  function showTab(tab) {
    currentTab = tab;
    const tt = document.getElementById('topbar-title');
    if (tt) tt.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
    ['today', 'board', 'profile'].forEach(t => {
      const screen = document.getElementById('screen-' + t);
      if (screen) screen.classList.toggle('active', t === tab);
      const navItem = document.getElementById('tab-' + t);
      if (navItem) navItem.classList.toggle('active', t === tab);
    });
    document.querySelectorAll('.tk-tabbar-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });
    if (tab === 'today') renderToday();
    if (tab === 'profile') renderProfile();
    closeSidebarMobile();
  }
  function gotoTab(tab) { showTab(tab); }

  function saveOrder(...stages) {
    const toSave = stages.length ? stages : STAGES;
    toSave.forEach(stage => {
      const ids = [...getList(stage).querySelectorAll('.task-card')].map(c => Number(c.dataset.taskId));
      if (ids.length) apiPost('/api/reorder', { order: ids, ...boardBody() });
    });
  }

  function daysOpen(createdAt) {
    const created = new Date(createdAt);
    const days = Math.floor((Date.now() - created) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return '1d';
    return `${days}d`;
  }

  /* ── Sidebar render ── */
  function renderFilterBar() {
    const sidebar = document.getElementById('sidebar-categories');
    sidebar.innerHTML = '';
    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'sidebar-nav-item filter-btn' + (activeFilter === cat.id ? ' active' : '');
      btn.dataset.id = String(cat.id);
      btn.innerHTML = `<span class="sidebar-dot" style="background:${safeColor(cat.color)}"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(cat.name)}</span><button class="sidebar-cat-remove" data-action="deleteCategory" data-args="[${cat.id}]">×</button>`;
      btn.addEventListener('click', e => {
        if (!e.target.classList.contains('sidebar-cat-remove')) {
          clearTodayFilter();
          setFilter(activeFilter === cat.id ? null : cat.id);
        }
      });
      sidebar.appendChild(btn);
    });
  }

  function renderSidebarBoards() {
    const el = document.getElementById('sidebar-boards');
    const boardIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="12"/></svg>`;
    const boardArgs = obj => escapeHtml(JSON.stringify([obj]));
    const myBoardBtns = myBoards.map((b, i) => `
      <button class="sidebar-nav-item${currentBoard?.id === b.id || (!currentBoard && i === 0) ? ' active' : ''}"
        data-action="switchBoard" data-args="${boardArgs({id:b.id,name:b.name,ownerId:myId})}">
        ${boardIcon} ${escapeHtml(b.name)}
      </button>`).join('');
    const sharedBtns = memberships.map(b => `
      <button class="sidebar-nav-item${currentBoard?.id === b.id ? ' active' : ''}"
        data-action="switchBoard" data-args="${boardArgs({id:b.id,name:b.name,ownerId:b.owner_user_id})}">
        ${boardIcon} ${escapeHtml(b.name)} <span style="font-size:0.68rem;opacity:0.55;margin-left:2px;">· ${escapeHtml(b.owner_username || b.owner_email)}</span>
      </button>`).join('');
    el.innerHTML = myBoardBtns +
      (memberships.length ? `<div style="font-size:0.67rem;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:0.08em;padding:8px 8px 2px;">Shared</div>${sharedBtns}` : '') +
      `<button class="sidebar-nav-item" data-action="openCreateBoardModal" style="color:var(--primary);">${boardIcon} + New board</button>`;
  }

  function toggleNewCatForm() {
    const form = document.getElementById('new-cat-form');
    form.classList.toggle('open');
    if (form.classList.contains('open')) document.getElementById('new-cat-name').focus();
  }

  function renderColorPalette() {
    const el = document.getElementById('color-palette');
    el.innerHTML = '';
    COLOR_PALETTE.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch' + (color === selectedColor ? ' selected' : '');
      swatch.style.background = color;
      swatch.addEventListener('click', () => {
        selectedColor = color;
        el.querySelector('.color-swatch.selected')?.classList.remove('selected');
        swatch.classList.add('selected');
      });
      el.appendChild(swatch);
    });
  }

  async function saveNewCategory() {
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name) return;
    const cat = await apiPost('/api/categories', { name, color: selectedColor, ...boardBody() });
    categories.push(cat);
    renderFilterBar();
    document.getElementById('new-cat-name').value = '';
    toggleNewCatForm();
    document.querySelectorAll('.cat-selector').forEach(sel => renderCatSelector(sel, sel.closest('.task-card')));
  }

  async function deleteCategory(catId, e) {
    e.stopPropagation();
    if (!confirm('Delete this category? Tasks will become uncategorised.')) return;
    await apiDelete(`/api/categories/${catId}` + boardParam());
    categories = categories.filter(c => c.id !== catId);
    if (activeFilter === catId) setFilter(null);
    renderFilterBar();
    document.querySelectorAll(`.task-card[data-category-id="${catId}"]`).forEach(card => {
      card.dataset.categoryId = '';
      updateCardBadge(card);
    });
    document.querySelectorAll('.cat-selector').forEach(sel => renderCatSelector(sel, sel.closest('.task-card')));
  }

  function renderCatSelector(selectorEl, card) {
    selectorEl.innerHTML = '';
    const noneOpt = document.createElement('button');
    noneOpt.className = 'cat-option none' + (!card.dataset.categoryId ? ' selected' : '');
    noneOpt.textContent = 'None';
    noneOpt.addEventListener('click', () => assignCategory(card, null, selectorEl));
    selectorEl.appendChild(noneOpt);
    categories.forEach(cat => {
      const opt = document.createElement('button');
      opt.className = 'cat-option' + (Number(card.dataset.categoryId) === cat.id ? ' selected' : '');
      opt.style.background = cat.color;
      opt.textContent = cat.name;
      opt.addEventListener('click', () => assignCategory(card, cat.id, selectorEl));
      selectorEl.appendChild(opt);
    });
  }

  function assignCategory(card, catId, selectorEl) {
    card.dataset.categoryId = catId || '';
    updateCardBadge(card);
    renderCatSelector(selectorEl, card);
    apiPut(`/api/tasks/${card.dataset.taskId}`, getCardPayload(card));
    applyFilter();
  }

  function updateCardBadge(card) {
    const badgesEl = card.querySelector('.task-badges');
    const cat = getCategoryById(card.dataset.categoryId);
    const existing = badgesEl.querySelector('.category-pill');
    if (existing) existing.remove();
    if (cat) {
      const pill = document.createElement('span');
      pill.className = 'category-pill';
      pill.style.background = cat.color;
      pill.textContent = cat.name;
      badgesEl.prepend(pill);
    }
  }

  /* ── Init ── */
  async function init() {
    initTheme();

    // Paint last-seen tasks synchronously so the board appears instantly,
    // then refresh from the network in the background.
    const boardKey = '';
    const cached = readBootCache(boardKey);
    let cachedRendered = false;
    if (cached && Array.isArray(cached.tasks) && Array.isArray(cached.categories)) {
      categories = cached.categories;
      renderFilterBar();
      cached.tasks.forEach(t => createTaskCard(t));
      updateCounts();
      cachedRendered = true;
    }

    try {
      // Fire every bootstrap request in parallel — previously this was a
      // four-step waterfall (user → boards → categories → tasks).
      const [user, boards, memberships_, members, cats, tasks, notifs] = await Promise.all([
        fetch('/api/user').then(r => r.json()),
        fetch('/api/boards').then(r => r.json()).catch(() => []),
        fetch('/api/boards/memberships').then(r => r.json()).catch(() => []),
        fetch('/api/boards/members').then(r => r.json()).catch(() => []),
        fetch('/api/categories').then(r => r.json()).catch(() => []),
        fetch('/api/tasks').then(r => r.json()).catch(() => []),
        fetch('/api/notifications').then(r => r.json()).catch(() => []),
      ]);

      if (!user) {
        localStorage.removeItem(BOOT_CACHE_KEY);
        location.href = '/login';
        return;
      }

      // If the cache belonged to a different account, wipe the optimistic render.
      if (cachedRendered && cached.userId !== user.id) {
        clearTaskColumns();
        cachedRendered = false;
      }

      myId = user.id;
      myName = user.name || user.email;
      const displayName = user.username ? `@${user.username}` : myName;
      const initial = (user.username || myName)[0].toUpperCase();
      document.getElementById('user-name').textContent = displayName;
      document.getElementById('user-avatar').textContent = initial;
      document.getElementById('sidebar-avatar').textContent = initial;
      document.getElementById('sidebar-name').textContent = displayName;
      document.getElementById('account-avatar').textContent = initial;
      document.getElementById('account-name').textContent = displayName;
      document.getElementById('account-email').textContent = user.email || '';

      myBoards = boards;
      memberships = memberships_;
      boardMembers = members;
      renderBoardMenu();
      renderSidebarBoards();
      loadNotifications(notifs);

      categories = cats;
      renderColorPalette();
      renderFilterBar();

      // Only repaint the board if the server data differs from what we already painted.
      const newJson = JSON.stringify(tasks);
      const cachedJson = cachedRendered ? JSON.stringify(cached.tasks) : null;
      if (newJson !== cachedJson) {
        clearTaskColumns();
        tasks.forEach(t => createTaskCard(t));
        updateCounts();
      }
      writeBootCache({ userId: user.id, boardKey, categories: cats, tasks });

      initSortable();
      loadArchivedCount();

      const digestSel = document.getElementById('digest-frequency');
      if (user.digest_frequency) digestSel.value = user.digest_frequency;
    } catch (err) {
      console.error('Failed to load:', err);
    }
    showTab('today');
  }

  /* ── Board switching ── */
  function renderBoardMenu() {
    document.getElementById('my-board-item').textContent = (myBoards[0]?.name || 'My Board') + (currentBoard ? '' : ' ✓');
    document.getElementById('my-board-item').classList.toggle('active', !currentBoard);

    const boardArgs = obj => escapeHtml(JSON.stringify([obj]));
    const myExtra = myBoards.slice(1).map(b =>
      `<div class="board-menu-item${currentBoard?.id === b.id ? ' active' : ''}" data-action="switchBoard" data-args="${boardArgs({id:b.id,name:b.name,ownerId:myId})}">${currentBoard?.id === b.id ? '✓ ' : ''}${escapeHtml(b.name)}</div>`
    ).join('');

    const sharedBoards = memberships.map(b =>
      `<div class="board-menu-item${currentBoard?.id === b.id ? ' active' : ''}" data-action="switchBoard" data-args="${boardArgs({id:b.id,name:b.name,ownerId:b.owner_user_id})}">${escapeHtml(b.name)} <span style="font-size:0.72rem;opacity:0.6;">· ${escapeHtml(b.owner_username || b.owner_email)}</span></div>`
    ).join('');

    document.getElementById('board-menu-memberships').innerHTML =
      myExtra +
      (memberships.length ? `<div class="board-menu-sep"></div><div style="padding:6px 14px;font-size:0.7rem;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:0.06em;">Shared with me</div>${sharedBoards}` : '') +
      `<div class="board-menu-sep"></div><div class="board-menu-item" data-action="closeBoardMenuAndCreateBoard">+ Create board</div>`;
  }

  function toggleBoardMenu() {
    const menu = document.getElementById('board-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }

  function closeBoardMenu() {
    document.getElementById('board-menu').style.display = 'none';
  }

  async function switchBoard(board) {
    closeBoardMenu();
    exitArchivedView();
    exitDashboardView();
    currentBoard = board;
    const defaultName = myBoards[0]?.name || 'My Board';
    document.getElementById('board-label').textContent = board ? board.name : defaultName;
    const banner = document.getElementById('viewing-banner');
    const isOwn = !board || board.ownerId === myId;
    if (!isOwn) { banner.textContent = `Viewing shared board`; banner.style.display = 'inline'; }
    else { banner.style.display = 'none'; }

    STAGES.forEach(s => { getList(s).innerHTML = emptyMarkup(s); });
    activeFilter = null; todayFilter = false;

    [boardMembers, categories] = await Promise.all([
      fetch('/api/boards/members' + boardParam()).then(r => r.json()).catch(() => []),
      fetch('/api/categories' + boardParam()).then(r => r.json()).catch(() => []),
    ]);
    if (!Array.isArray(boardMembers)) boardMembers = [];
    if (!Array.isArray(categories)) categories = [];
    renderFilterBar();
    renderBoardMenu();
    renderSidebarBoards();

    const tasks = await fetch('/api/tasks' + boardParam()).then(r => r.json()).catch(() => []);
    (Array.isArray(tasks) ? tasks : []).forEach(t => createTaskCard(t));
    updateCounts();
    loadArchivedCount();
  }

  /* ── Create board ── */
  function openCreateBoardModal() {
    document.getElementById('create-board-modal').style.display = 'flex';
    document.getElementById('new-board-name').value = '';
    document.getElementById('create-board-msg').textContent = '';
    setTimeout(() => document.getElementById('new-board-name').focus(), 50);
  }
  function closeCreateBoardModal() { document.getElementById('create-board-modal').style.display = 'none'; }
  async function createBoard() {
    const name = document.getElementById('new-board-name').value.trim();
    const msg = document.getElementById('create-board-msg');
    if (!name) { msg.style.color = '#EF4444'; msg.textContent = 'Please enter a name.'; return; }
    const res = await fetch('/api/boards', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ name }) });
    const board = await res.json();
    if (!res.ok) { msg.style.color = '#EF4444'; msg.textContent = board.error || 'Error'; return; }
    myBoards.push(board);
    closeCreateBoardModal();
    await switchBoard({ id: board.id, name: board.name, ownerId: myId });
  }

  /* ── Members modal ── */
  async function openMembersModal() {
    document.getElementById('members-modal').style.display = 'flex';
    document.getElementById('invite-msg').textContent = '';
    document.getElementById('invite-email').value = '';
    renderMembersList();
    await loadPendingInvites();
  }

  function closeMembersModal() {
    document.getElementById('members-modal').style.display = 'none';
  }

  function renderMembersList() {
    const el = document.getElementById('members-list');
    if (!boardMembers.length) { el.innerHTML = '<p class="no-members">No members yet. Invite someone below.</p>'; return; }
    el.innerHTML = boardMembers.map(m => `
      <div class="member-item">
        <div class="member-avatar">${escapeHtml((m.name || m.email)[0].toUpperCase())}</div>
        <div class="member-info">
          <div class="member-name">${escapeHtml(m.name || m.email)}</div>
          <div class="member-email">${escapeHtml(m.email)}</div>
        </div>
        <button class="member-remove" data-action="removeMember" data-args="[${m.id}]">Remove</button>
      </div>`).join('');
  }

  async function inviteMember() {
    const email = document.getElementById('invite-email').value.trim();
    const msgEl = document.getElementById('invite-msg');
    msgEl.textContent = ''; msgEl.className = 'invite-msg';
    if (!email) return;
    try {
      const res = await fetch('/api/boards/invite', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (!res.ok) { msgEl.textContent = data.error; msgEl.classList.add('error'); return; }
      document.getElementById('invite-email').value = '';
      if (data.joined) {
        boardMembers.push(data);
        renderMembersList();
        msgEl.textContent = `${data.name || data.email} added!`;
        msgEl.classList.add('success');
      } else {
        await loadPendingInvites();
        msgEl.innerHTML = data.emailSent
          ? `Invite sent to <strong>${email}</strong>!`
          : `No account found — <a href="#" data-action="copyInviteLink" data-args="${escapeHtml(JSON.stringify([data.inviteLink]))}" style="color:var(--primary);font-weight:600;">copy invite link</a> to share manually.`;
        msgEl.classList.add('success');
      }
    } catch { msgEl.textContent = 'Something went wrong.'; msgEl.classList.add('error'); }
  }

  async function loadPendingInvites() {
    const invites = await fetch('/api/boards/invites').then(r => r.json());
    const container = document.getElementById('pending-invites');
    if (!invites.length) { container.innerHTML = ''; return; }
    container.innerHTML = `<div style="font-size:0.75rem;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:0.06em;margin:14px 0 6px;">Pending Invites</div>` +
      invites.map(inv => `
        <div class="member-item">
          <div class="member-avatar" style="background:var(--border);color:var(--text-muted);">?</div>
          <div class="member-info">
            <div class="member-name">${escapeHtml(inv.invitee_email)}</div>
            <div class="member-email">Invite pending</div>
          </div>
          <button data-action="copyInviteLink" data-args="${escapeHtml(JSON.stringify([buildInviteLink(inv.token, inv.invitee_email)]))}" style="background:none;border:1px solid var(--border);border-radius:var(--r-sm);padding:3px 8px;font-size:0.72rem;color:var(--text-muted);cursor:pointer;margin-right:4px;">Copy link</button>
          <button class="member-remove" data-action="revokeInvite" data-args="[${inv.id}]">Revoke</button>
        </div>`).join('');
  }

  function buildInviteLink(token, email) {
    return `${location.origin}/login?invite=${token}&email=${encodeURIComponent(email)}`;
  }

  async function copyInviteLink(link) {
    await navigator.clipboard.writeText(link).catch(() => prompt('Copy this invite link:', link));
    const msgEl = document.getElementById('invite-msg');
    msgEl.className = 'invite-msg success';
    msgEl.textContent = '✓ Link copied to clipboard!';
    setTimeout(() => { msgEl.textContent = ''; }, 3000);
  }

  async function revokeInvite(id) {
    await fetch(`/api/boards/invites/${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'fetch' } });
    await loadPendingInvites();
  }

  async function removeMember(userId) {
    await fetch(`/api/boards/members/${userId}`, { method: 'DELETE', headers: { 'X-Requested-With': 'fetch' } });
    boardMembers = boardMembers.filter(m => m.id !== userId);
    renderMembersList();
  }

  /* ── Notifications ── */
  async function loadNotifications(preloaded) {
    const notifs = preloaded || await fetch('/api/notifications').then(r => r.json());
    const unread = notifs.filter(n => !n.read).length;
    const badge = document.getElementById('notif-badge');
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'block' : 'none';
    const list = document.getElementById('notif-list');
    if (!notifs.length) { list.innerHTML = '<div class="notif-empty">No notifications</div>'; return; }
    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        <div>${escapeHtml(n.message)}</div>
        <div class="notif-time">${new Date(n.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      </div>`).join('');
  }

  async function toggleNotifications() {
    const dropdown = document.getElementById('notif-dropdown');
    const open = dropdown.style.display === 'none';
    dropdown.style.display = open ? 'block' : 'none';
    if (open) {
      closeAccountMenu();
      await fetch('/api/notifications/read', { method: 'POST', headers: { 'X-Requested-With': 'fetch' } });
      document.getElementById('notif-badge').style.display = 'none';
    }
  }

  function toggleAccountMenu() {
    const dropdown = document.getElementById('account-dropdown');
    const btn = document.getElementById('account-btn');
    const open = dropdown.style.display === 'none';
    dropdown.style.display = open ? 'block' : 'none';
    btn.setAttribute('aria-expanded', String(open));
    if (open) document.getElementById('notif-dropdown').style.display = 'none';
  }
  function closeAccountMenu() {
    document.getElementById('account-dropdown').style.display = 'none';
    document.getElementById('account-btn').setAttribute('aria-expanded', 'false');
  }

  /* ── Assign to ── */
  function populateAssignSelect(selectEl, currentAssigneeId) {
    const people = currentBoard
      ? [{ id: currentBoard.id, name: currentBoard.name, email: currentBoard.email }, ...boardMembers]
      : [{ id: myId, name: myName, email: '' }, ...boardMembers];
    selectEl.innerHTML = '<option value="">Unassigned</option>' +
      people.map(u => `<option value="${u.id}" ${currentAssigneeId == u.id ? 'selected' : ''}>${escapeHtml(u.name || u.email)}</option>`).join('');
  }

  function clearAssign(taskId, e) {
    e.stopPropagation();
    const card = e.target.closest('.task-card');
    card.dataset.assignedToUserId = '';
    card.querySelector('.assign-chip-row').innerHTML = '';
    updateAssigneeBadge(card, null);
    apiPut(`/api/tasks/${taskId}`, getCardPayload(card));
  }

  function populateShareSelect(selectEl) {
    const people = [...boardMembers];
    memberships.forEach(m => { if (!people.find(p => p.id === m.id)) people.push(m); });
    const targets = people.filter(u => u.id !== myId);
    if (!targets.length) {
      selectEl.innerHTML = '<option value="">No connections yet</option>';
      selectEl.disabled = true;
    } else {
      selectEl.disabled = false;
      selectEl.innerHTML = '<option value="">Share with…</option>' +
        targets.map(u => `<option value="${u.id}">${escapeHtml(u.name || u.username || u.email)}</option>`).join('');
    }
  }

  function updateAssigneeBadge(card, userId) {
    const badgesEl = card.querySelector('.task-badges');
    const existing = badgesEl.querySelector('.assignee-badge');
    if (existing) existing.remove();
    if (!userId) return;
    const people = currentBoard
      ? [{ id: currentBoard.id, name: currentBoard.name, email: currentBoard.email }, ...boardMembers]
      : [{ id: myId, name: myName, email: '' }, ...boardMembers];
    const person = people.find(u => u.id == userId);
    if (person) {
      const badge = document.createElement('span');
      badge.className = 'assignee-badge';
      badge.textContent = `👤 ${person.name || person.email}`;
      badgesEl.insertBefore(badge, badgesEl.querySelector('.task-age'));
    }
  }

  /* ── Import ── */
  function openImport() {
    const m = document.getElementById('tk-overflow-menu'); if (m) m.style.display = 'none';
    document.getElementById('import-modal').style.display = 'flex';
  }
  function closeImport() { document.getElementById('import-modal').style.display = 'none'; }

  function clearImport() {
    document.getElementById('import-json').value = '';
    document.getElementById('import-error').style.display = 'none';
    document.getElementById('import-success').style.display = 'none';
  }

  async function importTasks() {
    const errEl = document.getElementById('import-error');
    const okEl = document.getElementById('import-success');
    errEl.style.display = 'none'; okEl.style.display = 'none';
    let data;
    try { data = JSON.parse(document.getElementById('import-json').value.trim()); }
    catch { errEl.textContent = 'Invalid JSON — check the format and try again.'; errEl.style.display = 'block'; return; }
    if (!Array.isArray(data) || !data.length) { errEl.textContent = 'Expected a non-empty JSON array.'; errEl.style.display = 'block'; return; }
    let count = 0;
    for (const item of data) {
      if (!item.text) continue;
      const owners = item.owner ? [item.owner] : (Array.isArray(item.owners) ? item.owners : []);
      const task = await apiPost('/api/tasks', { text: item.text, status: item.status || '', owners, ...boardBody() });
      createTaskCard(task);
      count++;
    }
    updateCounts();
    okEl.textContent = `${count} task${count !== 1 ? 's' : ''} imported.`;
    okEl.style.display = 'block';
    document.getElementById('import-json').value = '';
  }

  /* ── Add task ── */
  async function addTask() {
    const input = document.getElementById('task-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const task = await apiPost('/api/tasks', { text, stage: 'backlog', ...boardBody() });
    createTaskCard(task);
    updateCounts();
    input.focus();
  }

  /* ── Task card ── */
  function createTaskCard(task) {
    const stage = task.stage || 'backlog';
    const list = getList(stage);
    const emptyEl = list.querySelector('.col-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    const card = document.createElement('li');
    card.className = 'task-card';
    card.dataset.taskId = task.id;
    card.dataset.stage = stage;
    card.dataset.categoryId = task.category_id || '';
    card.dataset.priority = task.priority || 'none';
    card.dataset.recurrence = task.recurrence || '';
    card.dataset.dueDate = task.due_date || '';
    card.dataset.subtasks = JSON.stringify(task.subtasks || []);
    card.dataset.assignedToUserId = task.assigned_to_user_id || '';

    const stageIdx = STAGES.indexOf(stage);
    const prevStage = stageIdx > 0 ? STAGES[stageIdx - 1] : null;
    const nextStage = stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null;

    card.innerHTML = `
      <div class="task-item">
        <div class="task-top">
          <div class="task-main">
            <div class="task-text">${escapeHtml(task.text)}</div>
            <div class="task-badges">
              ${task.priority && task.priority !== 'none' ? `<span class="priority-dot ${task.priority}"></span>` : ''}
              ${task.due_date ? `<span class="due-badge ${getDueBadgeClass(task.due_date)}">${formatDueDate(task.due_date)}</span>` : ''}
              ${(task.subtasks && task.subtasks.length) ? `<span class="subtask-count">${task.subtasks.filter(s=>s.done).length}/${task.subtasks.length}</span>` : ''}
              ${task.assigned_to_user_id ? `<span class="assignee-badge">👤 ${escapeHtml(task.assigned_to_name || task.assigned_to_email || '?')}</span>` : ''}
              <span class="repeat-badge" title="Repeats — a new copy is created when marked Done"${task.recurrence ? '' : ' hidden'}>🔁</span>
              <span class="task-age">${daysOpen(task.created_at)}</span>
            </div>
            <div class="task-meta">
              <span class="task-status-preview"></span>
              <span class="task-owner-preview"></span>
            </div>
          </div>
          <div class="card-actions">
            <button class="icon-btn delete" title="Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
        <div class="stage-btns">
          ${prevStage ? `<button class="stage-btn back" data-target="${prevStage}">← ${STAGE_LABELS[prevStage]}</button>` : ''}
          ${nextStage ? `<button class="stage-btn forward" data-target="${nextStage}">${STAGE_LABELS[nextStage]} →</button>` : ''}
        </div>
      </div>
      <div class="status-panel">
        <label>Due date</label>
        <button type="button" class="date-trigger ${task.due_date ? '' : 'empty'}" data-action="openDatePicker">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF6B47" stroke-width="1.9"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span class="date-trigger-label">${task.due_date ? formatTriggerDate(task.due_date) : 'Set due date…'}</span>
          <span class="date-clear-x" data-action="clearDueDate"${task.due_date ? '' : ' hidden'}>×</span>
        </button>
        <input type="hidden" class="due-date-input" value="${task.due_date || ''}" />

        <label>Priority</label>
        <div class="priority-selector">
          <button class="priority-opt none ${(!task.priority || task.priority === 'none') ? 'selected' : ''}" data-value="none">None</button>
          <button class="priority-opt low ${task.priority === 'low' ? 'selected' : ''}" data-value="low">Low</button>
          <button class="priority-opt medium ${task.priority === 'medium' ? 'selected' : ''}" data-value="medium">Medium</button>
          <button class="priority-opt high ${task.priority === 'high' ? 'selected' : ''}" data-value="high">High</button>
        </div>

        <label>Repeat</label>
        <select class="recurrence-sel">
          <option value="" ${!task.recurrence ? 'selected' : ''}>No repeat</option>
          <option value="daily" ${task.recurrence === 'daily' ? 'selected' : ''}>Daily</option>
          <option value="weekly" ${task.recurrence === 'weekly' ? 'selected' : ''}>Weekly</option>
          <option value="monthly" ${task.recurrence === 'monthly' ? 'selected' : ''}>Monthly</option>
          <option value="after:3" ${task.recurrence === 'after:3' ? 'selected' : ''}>3 days after done</option>
          <option value="after:7" ${task.recurrence === 'after:7' ? 'selected' : ''}>7 days after done</option>
          <option value="after:14" ${task.recurrence === 'after:14' ? 'selected' : ''}>14 days after done</option>
          <option value="after:30" ${task.recurrence === 'after:30' ? 'selected' : ''}>30 days after done</option>
        </select>

        <label>Category</label>
        <div class="cat-selector"></div>
        <button class="add-cat-inline-btn" type="button">+ New category</button>
        <div class="inline-cat-form">
          <input type="text" class="inline-cat-name" placeholder="Category name…" maxlength="30" />
          <div class="inline-cat-palette"></div>
          <div class="inline-cat-actions">
            <button type="button" class="btn-save-icat">Add</button>
            <button type="button" class="btn-cancel-icat">Cancel</button>
          </div>
        </div>

        <label>Subtasks</label>
        <div class="subtask-list"></div>
        <div class="add-subtask-row">
          <input type="text" class="subtask-input" placeholder="Add subtask…" />
          <button class="add-subtask-btn">+</button>
        </div>

        <label>Assigned to</label>
        <div class="user-search-wrap">
          <input type="text" class="assign-search" placeholder="Search @username or email…" autocomplete="off" />
          <div class="user-search-results assign-results" style="display:none"></div>
        </div>
        <div class="assign-chip-row"></div>

        <label>Notes</label>
        <textarea class="status-area" placeholder="Add notes or a status update…" rows="2"></textarea>

        <label>Calendar guests (Gmail)</label>
        <div class="owner-row">
          <input type="email" class="owner-input" placeholder="name@gmail.com" />
          <button class="owner-add-btn">+ Add</button>
        </div>
        <div class="owner-chips"></div>

        <label>Share to someone's board</label>
        <div class="user-search-wrap">
          <input type="text" class="share-search" placeholder="Search @username or email…" autocomplete="off" />
          <div class="user-search-results share-results" style="display:none"></div>
        </div>

        <label>Add to Google Calendar</label>
        <div class="cal-row">
          <div class="field"><label>Start</label><input type="datetime-local" class="cal-start" /></div>
          <div class="field"><label>End</label><input type="datetime-local" class="cal-end" /></div>
          <button type="button" class="open-cal-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5C3.9 4 3 4.9 3 6v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
            Calendar
          </button>
        </div>

        <div class="panel-save-row">
          <button type="button" class="archive-btn">Archive</button>
          <button type="button" class="close-panel-btn">Close</button>
          <button type="button" class="save-task-btn">Save</button>
        </div>
      </div>`;

    const panel = card.querySelector('.status-panel');
    const deleteBtn = card.querySelector('.icon-btn.delete');
    const textarea = card.querySelector('textarea.status-area');
    const statusPreview = card.querySelector('.task-status-preview');
    const ownerPreview = card.querySelector('.task-owner-preview');
    const ownerInput = card.querySelector('.owner-input');
    const ownerAddBtn = card.querySelector('.owner-add-btn');
    const chipsEl = card.querySelector('.owner-chips');
    const calStartEl = card.querySelector('.cal-start');
    const calEndEl = card.querySelector('.cal-end');
    const catSelector = card.querySelector('.cat-selector');

    textarea.value = task.status || '';
    calStartEl.value = task.cal_start || '';
    calEndEl.value = task.cal_end || '';
    (task.owners || []).forEach(email => addOwnerChip(email, chipsEl, ownerPreview));
    renderCatSelector(catSelector, card);
    updateCardBadge(card);
    renderSubtasks(card);
    updateSubtaskCount(card);
    updateStatusPreview();

    // Assign-to search
    const assignSearch = card.querySelector('.assign-search');
    const assignResults = card.querySelector('.assign-results');
    const assignChipRow = card.querySelector('.assign-chip-row');

    if (task.assigned_to_user_id) {
      const label = task.assigned_to_name || task.assigned_to_username || task.assigned_to_email || '?';
      renderAssignChip(card, task.assigned_to_user_id, label, task.id);
    }

    let assignTimer;
    assignSearch.addEventListener('input', () => {
      clearTimeout(assignTimer);
      const q = assignSearch.value.trim();
      if (!q) { assignResults.style.display = 'none'; return; }
      assignTimer = setTimeout(async () => {
        const users = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`).then(r => r.json());
        if (!users.length) { assignResults.innerHTML = '<div class="user-result-empty">No users found</div>'; assignResults.style.display = 'block'; return; }
        assignResults.innerHTML = users.map(u => `
          <div class="user-result" data-id="${u.id}" data-name="${escapeHtml(u.name || u.username || u.email)}">
            <div class="user-result-avatar">${escapeHtml((u.name || u.username || u.email)[0].toUpperCase())}</div>
            <div class="user-result-info">
              <div class="user-result-name">${escapeHtml(u.name || u.username)}</div>
              <div class="user-result-sub">@${escapeHtml(u.username || '')} · ${escapeHtml(u.email)}</div>
            </div>
          </div>`).join('');
        assignResults.style.display = 'block';
        assignResults.querySelectorAll('.user-result').forEach(row => {
          row.addEventListener('click', () => {
            const uid = Number(row.dataset.id);
            const name = row.dataset.name;
            card.dataset.assignedToUserId = uid;
            assignSearch.value = '';
            assignResults.style.display = 'none';
            renderAssignChip(card, uid, name, task.id);
            apiPut(`/api/tasks/${task.id}`, getCardPayload(card));
          });
        });
      }, 280);
    });
    assignSearch.addEventListener('blur', () => setTimeout(() => { assignResults.style.display = 'none'; }, 200));

    function renderAssignChip(card, uid, name, taskId) {
      const row = card.querySelector('.assign-chip-row');
      row.innerHTML = uid ? `<div class="assign-chip">👤 ${escapeHtml(name)}<button data-action="clearAssign" data-args="[${Number(taskId)}]">×</button></div>` : '';
      updateAssigneeBadge(card, uid);
    }

    // Share search
    const shareSearch = card.querySelector('.share-search');
    const shareResults = card.querySelector('.share-results');
    let shareTimer;
    shareSearch.addEventListener('input', () => {
      clearTimeout(shareTimer);
      const q = shareSearch.value.trim();
      if (!q) { shareResults.style.display = 'none'; return; }
      shareTimer = setTimeout(async () => {
        const users = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`).then(r => r.json());
        if (!users.length) { shareResults.innerHTML = '<div class="user-result-empty">No users found</div>'; shareResults.style.display = 'block'; return; }
        shareResults.innerHTML = users.map(u => `
          <div class="user-result" data-id="${u.id}" data-name="${escapeHtml(u.name || u.username || u.email)}">
            <div class="user-result-avatar">${escapeHtml((u.name || u.username || u.email)[0].toUpperCase())}</div>
            <div class="user-result-info">
              <div class="user-result-name">${escapeHtml(u.name || u.username)}</div>
              <div class="user-result-sub">@${escapeHtml(u.username || '')} · ${escapeHtml(u.email)}</div>
            </div>
          </div>`).join('');
        shareResults.style.display = 'block';
        shareResults.querySelectorAll('.user-result').forEach(row => {
          row.addEventListener('click', async () => {
            const uid = Number(row.dataset.id);
            const name = row.dataset.name;
            shareResults.style.display = 'none';
            shareSearch.value = `Sharing to ${name}…`;
            shareSearch.disabled = true;
            await fetch(`/api/tasks/${task.id}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ recipient_user_id: uid, ...boardBody() }) });
            shareSearch.value = `✓ Shared with ${name}`;
            setTimeout(() => { shareSearch.value = ''; shareSearch.disabled = false; }, 2500);
          });
        });
      }, 280);
    });
    shareSearch.addEventListener('blur', () => setTimeout(() => { shareResults.style.display = 'none'; }, 200));

    // Save button
    const saveBtn = card.querySelector('.save-task-btn');
    saveBtn.addEventListener('click', e => {
      e.stopPropagation();
      apiPut(`/api/tasks/${task.id}`, getCardPayload(card));
      saveBtn.textContent = '✓ Saved';
      saveBtn.classList.add('saved');
      setTimeout(() => {
        saveBtn.textContent = 'Save';
        saveBtn.classList.remove('saved');
        panel.classList.remove('open');
      }, 800);
    });

    card.querySelector('.close-panel-btn').addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.remove('open');
    });

    const archiveBtn = card.querySelector('.archive-btn');
    archiveBtn.addEventListener('click', async e => {
      e.stopPropagation();
      await apiPut(`/api/tasks/${task.id}`, { ...getCardPayload(card), archived: true });
      card.remove();
      updateCounts();
      loadArchivedCount();
    });

    // Inline new category
    const addCatBtn = card.querySelector('.add-cat-inline-btn');
    const inlineCatForm = card.querySelector('.inline-cat-form');
    const inlineCatName = card.querySelector('.inline-cat-name');
    const inlinePalette = card.querySelector('.inline-cat-palette');
    let inlineColor = COLOR_PALETTE[0];

    COLOR_PALETTE.forEach(color => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (color === inlineColor ? ' selected' : '');
      sw.style.cssText = `width:16px;height:16px;border-radius:50%;background:${color};cursor:pointer;border:2px solid transparent;flex-shrink:0;`;
      sw.addEventListener('click', e => {
        e.stopPropagation();
        inlineColor = color;
        inlinePalette.querySelectorAll('div').forEach(s => s.style.borderColor = 'transparent');
        sw.style.borderColor = 'var(--text)';
      });
      inlinePalette.appendChild(sw);
    });

    addCatBtn.addEventListener('click', e => { e.stopPropagation(); inlineCatForm.classList.toggle('open'); if (inlineCatForm.classList.contains('open')) inlineCatName.focus(); });
    card.querySelector('.btn-cancel-icat').addEventListener('click', e => { e.stopPropagation(); inlineCatForm.classList.remove('open'); inlineCatName.value = ''; });
    card.querySelector('.btn-save-icat').addEventListener('click', async e => {
      e.stopPropagation();
      const name = inlineCatName.value.trim();
      if (!name) return;
      const cat = await apiPost('/api/categories', { name, color: inlineColor, ...boardBody() });
      categories.push(cat);
      renderFilterBar();
      inlineCatName.value = '';
      inlineCatForm.classList.remove('open');
      document.querySelectorAll('.cat-selector').forEach(sel => renderCatSelector(sel, sel.closest('.task-card')));
    });
    inlineCatName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); card.querySelector('.btn-save-icat').click(); } e.stopPropagation(); });

    const dueDateInput = card.querySelector('.due-date-input');
    dueDateInput.addEventListener('change', () => {
      card.dataset.dueDate = dueDateInput.value;
      updateDueBadge(card);
      apiPut(`/api/tasks/${task.id}`, getCardPayload(card));
    });

    card.querySelector('.priority-selector').querySelectorAll('.priority-opt').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        card.querySelector('.priority-selector').querySelectorAll('.priority-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        card.dataset.priority = btn.dataset.value;
        updatePriorityDot(card);
        apiPut(`/api/tasks/${task.id}`, getCardPayload(card));
      });
    });

    card.querySelector('.recurrence-sel').addEventListener('change', () => {
      const val = card.querySelector('.recurrence-sel').value;
      card.dataset.recurrence = val;
      const badge = card.querySelector('.repeat-badge');
      if (badge) badge.hidden = !val;
      apiPut(`/api/tasks/${task.id}`, getCardPayload(card));
    });

    const subtaskInput = card.querySelector('.subtask-input');
    card.querySelector('.add-subtask-btn').addEventListener('click', e => { e.stopPropagation(); doAddSubtask(); });
    subtaskInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAddSubtask(); } });
    function doAddSubtask() {
      const text = subtaskInput.value.trim();
      if (!text) return;
      const subtasks = JSON.parse(card.dataset.subtasks || '[]');
      const maxId = subtasks.length ? Math.max(...subtasks.map(s => s.id)) : 0;
      subtasks.push({ id: maxId + 1, text, done: false });
      card.dataset.subtasks = JSON.stringify(subtasks);
      subtaskInput.value = '';
      renderSubtasks(card);
      updateSubtaskCount(card);
      apiPut(`/api/tasks/${task.id}`, getCardPayload(card));
    }

    if (activeFilter && Number(card.dataset.categoryId) !== activeFilter) card.style.display = 'none';

    const debouncedSave = debounce(() => apiPut(`/api/tasks/${task.id}`, getCardPayload(card)), 500);

    const taskTextEl = card.querySelector('.task-text');
    taskTextEl.addEventListener('click', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.className = 'task-text-input';
      input.value = taskTextEl.textContent;
      taskTextEl.replaceWith(input);
      input.focus(); input.select();
      function saveText() {
        const newText = input.value.trim();
        if (newText && newText !== taskTextEl.textContent) {
          taskTextEl.textContent = newText;
          apiPut(`/api/tasks/${task.id}`, { ...getCardPayload(card), text: newText });
        }
        input.replaceWith(taskTextEl);
      }
      input.addEventListener('blur', saveText);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); saveText(); }
        if (e.key === 'Escape') { input.replaceWith(taskTextEl); }
      });
    });

    card.querySelector('.task-item').addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      if (open) textarea.focus();
    });

    deleteBtn.addEventListener('click', e => {
      e.stopPropagation();
      card.classList.add('completing');
      card.addEventListener('transitionend', () => {
        card.remove();
        updateCounts();
        apiDelete(`/api/tasks/${task.id}` + boardParam());
      }, { once: true });
    });

    card.querySelectorAll('.stage-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); moveToStage(card, task.id, btn.dataset.target); });
    });

    function updateStatusPreview() {
      statusPreview.textContent = textarea.value.trim() ? '↳ ' + textarea.value.trim().slice(0, 60) : '';
    }

    textarea.addEventListener('input', () => { updateStatusPreview(); debouncedSave(); });
    calStartEl.addEventListener('change', () => apiPut(`/api/tasks/${task.id}`, getCardPayload(card)));
    calEndEl.addEventListener('change', () => apiPut(`/api/tasks/${task.id}`, getCardPayload(card)));

    function doAddOwner() {
      const email = ownerInput.value.trim().toLowerCase();
      if (!email || !email.includes('@')) return;
      const existing = [...chipsEl.querySelectorAll('.chip')].map(c => c.dataset.email);
      if (existing.includes(email)) { ownerInput.value = ''; return; }
      addOwnerChip(email, chipsEl, ownerPreview, () => apiPut(`/api/tasks/${task.id}`, getCardPayload(card)));
      ownerInput.value = '';
      apiPut(`/api/tasks/${task.id}`, getCardPayload(card));
    }

    ownerAddBtn.addEventListener('click', e => { e.stopPropagation(); doAddOwner(); });
    ownerInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAddOwner(); } });
    panel.addEventListener('mousedown', e => e.stopPropagation());

    card.querySelector('.open-cal-btn').addEventListener('click', e => {
      e.stopPropagation();
      const taskTitle = card.querySelector('.task-text').textContent;
      const status = textarea.value.trim();
      const guestEmails = [...chipsEl.querySelectorAll('.chip')].map(c => c.dataset.email);
      let url = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
      url += '&text=' + encodeURIComponent(taskTitle);
      if (status) url += '&details=' + encodeURIComponent(status);
      if (calStartEl.value) url += '&dates=' + toGCalDate(calStartEl.value) + '/' + (calEndEl.value ? toGCalDate(calEndEl.value) : toGCalDate(calStartEl.value, 60));
      if (guestEmails.length) url += '&add=' + guestEmails.map(encodeURIComponent).join(',');
      window.open(url, '_blank');
    });

    list.appendChild(card);
  }

  function moveToStage(card, taskId, newStage) {
    const oldStage = card.dataset.stage;
    card.dataset.stage = newStage;
    getList(newStage).appendChild(card);
    apiPut(`/api/tasks/${taskId}`, { ...getCardPayload(card), stage: newStage });
    rebuildStageButtons(card, taskId, newStage);
    if (newStage === 'done' && card.dataset.recurrence) spawnRecurringTask(card);
    updateCounts();
    announce(`${(card.querySelector('.task-text')?.textContent || 'Task')} moved to ${STAGE_LABELS[newStage]} from ${STAGE_LABELS[oldStage]}`);
    saveOrder(oldStage, newStage);
  }

  function announce(msg) {
    const el = document.getElementById('a11y-live');
    if (el) el.textContent = msg;
  }

  let sortables = [];
  function initSortable() {
    sortables.forEach(s => s.destroy());
    sortables = STAGES.map(stage => {
      const list = getList(stage);
      return Sortable.create(list, {
        group: 'kanban',
        animation: 150,
        delay: 150,
        delayOnTouchOnly: true,
        filter: '.stage-btn, .icon-btn, button, input, select, textarea, .status-panel, a',
        preventOnFilter: false,
        forceFallback: true,
        fallbackOnBody: true,
        onEnd: handleSortEnd,
      });
    });
  }

  function handleSortEnd(evt) {
    const card = evt.item;
    const taskId = Number(card.dataset.taskId);
    const fromStage = evt.from.closest('.column').dataset.stage;
    const toStage = evt.to.closest('.column').dataset.stage;
    if (toStage !== card.dataset.stage) {
      card.dataset.stage = toStage;
      apiPut(`/api/tasks/${taskId}`, { ...getCardPayload(card), stage: toStage });
      rebuildStageButtons(card, taskId, toStage);
      if (toStage === 'done' && card.dataset.recurrence) spawnRecurringTask(card);
      announce(`${(card.querySelector('.task-text')?.textContent || 'Task')} moved to ${STAGE_LABELS[toStage]} from ${STAGE_LABELS[fromStage]}`);
      saveOrder(fromStage, toStage);
    } else {
      saveOrder(toStage);
    }
    updateCounts();
  }

  function rebuildStageButtons(card, taskId, stage) {
    const stageIdx = STAGES.indexOf(stage);
    const prevStage = stageIdx > 0 ? STAGES[stageIdx - 1] : null;
    const nextStage = stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null;
    const stageBtns = card.querySelector('.stage-btns');
    stageBtns.innerHTML = `
      ${prevStage ? `<button class="stage-btn back" data-target="${prevStage}">← ${STAGE_LABELS[prevStage]}</button>` : ''}
      ${nextStage ? `<button class="stage-btn forward" data-target="${nextStage}">${STAGE_LABELS[nextStage]} →</button>` : ''}`;
    stageBtns.querySelectorAll('.stage-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); moveToStage(card, taskId, btn.dataset.target); });
    });
  }

  function addOwnerChip(email, chipsEl, ownerPreview, onRemove) {
    const chip = document.createElement('div');
    chip.className = 'chip'; chip.dataset.email = email;
    chip.innerHTML = `<span>👤 ${escapeHtml(email)}</span><button title="Remove">×</button>`;
    chip.querySelector('button').addEventListener('click', e => {
      e.stopPropagation(); chip.remove();
      updateOwnerPreview(chipsEl, ownerPreview);
      if (onRemove) onRemove();
    });
    chipsEl.appendChild(chip);
    updateOwnerPreview(chipsEl, ownerPreview);
  }

  function updateOwnerPreview(chipsEl, ownerPreview) {
    const emails = [...chipsEl.querySelectorAll('.chip')].map(c => c.dataset.email);
    ownerPreview.textContent = emails.length ? '👤 ' + emails.join(', ') : '';
  }

  function toGCalDate(dtLocal, addMinutes = 0) {
    const d = new Date(dtLocal);
    d.setMinutes(d.getMinutes() + addMinutes);
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  // Validate before interpolating into a style="" attribute. Anything that
  // isn't a plain hex color falls back to neutral so a malicious value
  // can't break out of the attribute.
  function safeColor(c) {
    return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#94A3B8';
  }

  function prioColor(p) {
    return p === 'high' ? 'var(--tk-prio-high)'
         : p === 'medium' ? 'var(--tk-prio-med)'
         : p === 'low' ? 'var(--tk-prio-low)'
         : 'var(--tk-prio-low)';
  }
  function tagChip(name, color) {
    if (!name) return '';
    const c = safeColor(color || '#888');
    // 6-digit hex → append alpha for a ~10% tint; anything else → neutral tint
    const bg = /^#[0-9a-fA-F]{6}$/.test(c) ? `${c}1a` : 'rgba(30,30,46,.06)';
    return `<span class="tk-chip" style="background:${bg};color:${c}">${escapeHtml(name)}</span>`;
  }
  function progressRing(pct, size = 80, stroke = 6) {
    const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
    const off = circ * (1 - (pct || 0) / 100);
    return `<svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(0,0,0,.07)" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--tk-accent)" stroke-width="${stroke}"
      stroke-dasharray="${circ}" stroke-dashoffset="${off}" stroke-linecap="round"
      style="transition:stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)"/></svg>`;
  }

  /* ── Calendar date picker (replaces the native yyyy-mm-dd input) ── */
  let dpInput = null, dpTrigger = null, dpMonth = null;
  function dpPad(n) { return String(n).padStart(2, '0'); }
  function dpYmd(d) { return `${d.getFullYear()}-${dpPad(d.getMonth() + 1)}-${dpPad(d.getDate())}`; }
  function dpParse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function formatTriggerDate(s) {
    return dpParse(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function openDatePicker(e) {
    const trigger = (this && this.classList && this.classList.contains('date-trigger'))
      ? this : (e && e.target.closest('.date-trigger'));
    if (!trigger) return;
    dpTrigger = trigger;
    dpInput = trigger.closest('.task-card, #task-sheet').querySelector('.due-date-input');
    const cur = dpInput.value ? dpParse(dpInput.value) : new Date();
    dpMonth = { y: cur.getFullYear(), m: cur.getMonth() };
    renderCalendar();
    const pop = document.getElementById('date-picker');
    pop.style.display = 'block';
    const r = trigger.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.top = Math.min(r.bottom + 6, window.innerHeight - 380) + 'px';
    pop.style.left = Math.min(r.left, window.innerWidth - 316) + 'px';
  }
  function renderCalendar() {
    const pop = document.getElementById('date-picker');
    const { y, m } = dpMonth;
    const today = dpYmd(new Date());
    const sel = dpInput ? dpInput.value : '';
    const startDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    pop.querySelector('.dp-title').textContent =
      new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    let cells = '';
    for (let i = 0; i < startDow; i++) cells += `<span class="dp-day muted"></span>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${dpPad(m + 1)}-${dpPad(d)}`;
      const cls = ['dp-day'];
      if (ds === today) cls.push('today');
      if (ds === sel) cls.push('sel');
      cells += `<button type="button" class="${cls.join(' ')}" data-action="pickDate" data-args='["${ds}"]'>${d}</button>`;
    }
    pop.querySelector('.dp-grid').innerHTML = cells;
  }
  function dpNav(delta) {
    let { y, m } = dpMonth; m += delta;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    dpMonth = { y, m }; renderCalendar();
  }
  function pickDate(ds) {
    if (!dpInput) return;
    dpInput.value = ds;
    dpInput.dispatchEvent(new Event('change'));
    if (dpTrigger) {
      dpTrigger.classList.remove('empty');
      dpTrigger.querySelector('.date-trigger-label').textContent = formatTriggerDate(ds);
      const x = dpTrigger.querySelector('.date-clear-x'); if (x) x.hidden = false;
    }
    closeDatePicker();
  }
  function clearDueDate() {
    const t = (this && this.closest && this.closest('.date-trigger')) || dpTrigger;
    if (!t) return;
    const input = t.closest('.task-card, #task-sheet').querySelector('.due-date-input');
    input.value = '';
    input.dispatchEvent(new Event('change'));
    t.classList.add('empty');
    t.querySelector('.date-trigger-label').textContent = 'Set due date…';
    const x = t.querySelector('.date-clear-x'); if (x) x.hidden = true;
    closeDatePicker();
  }
  function dpQuick(which) {
    const d = new Date();
    if (which === 'tomorrow') d.setDate(d.getDate() + 1);
    if (which === 'week') d.setDate(d.getDate() + 7);
    pickDate(dpYmd(d));
  }
  function closeDatePicker() {
    const pop = document.getElementById('date-picker');
    if (pop) pop.style.display = 'none';
    dpInput = null; dpTrigger = null;
  }

  function getDueBadgeClass(dueDate) {
    if (!dueDate) return '';
    const today = new Date().toISOString().split('T')[0];
    if (dueDate < today) return 'overdue';
    if (dueDate === today) return 'today';
    return 'soon';
  }

  function formatDueDate(dueDate) {
    if (!dueDate) return '';
    const [y, m, d] = dueDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((date - today) / 86400000);
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 7) return date.toLocaleDateString('en', { weekday: 'short' });
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }

  function updateDueBadge(card) {
    const badgesEl = card.querySelector('.task-badges');
    const existing = badgesEl.querySelector('.due-badge');
    if (existing) existing.remove();
    const dueDate = card.dataset.dueDate;
    if (dueDate) {
      const badge = document.createElement('span');
      badge.className = `due-badge ${getDueBadgeClass(dueDate)}`;
      badge.textContent = formatDueDate(dueDate);
      badgesEl.insertBefore(badge, badgesEl.querySelector('.task-age'));
    }
  }

  function updatePriorityDot(card) {
    const badgesEl = card.querySelector('.task-badges');
    const existing = badgesEl.querySelector('.priority-dot');
    if (existing) existing.remove();
    const priority = card.dataset.priority;
    if (priority && priority !== 'none') {
      const dot = document.createElement('span');
      dot.className = `priority-dot ${priority}`;
      badgesEl.prepend(dot);
    }
  }

  function renderSubtasks(card) {
    const list = card.querySelector('.subtask-list');
    const taskId = card.dataset.taskId;
    list.innerHTML = '';
    const subtasks = JSON.parse(card.dataset.subtasks || '[]');
    subtasks.forEach(subtask => {
      const item = document.createElement('div');
      item.className = 'subtask-item';
      item.innerHTML = `<input type="checkbox" class="subtask-check" ${subtask.done ? 'checked' : ''} /><span class="${subtask.done ? 'done' : ''}">${escapeHtml(subtask.text)}</span><button class="subtask-remove">×</button>`;
      item.querySelector('.subtask-check').addEventListener('change', e => {
        subtask.done = e.target.checked;
        item.querySelector('span').className = subtask.done ? 'done' : '';
        const all = JSON.parse(card.dataset.subtasks || '[]');
        const idx = all.findIndex(s => s.id === subtask.id);
        if (idx >= 0) all[idx].done = subtask.done;
        card.dataset.subtasks = JSON.stringify(all);
        updateSubtaskCount(card);
        apiPut(`/api/tasks/${taskId}`, getCardPayload(card));
      });
      item.querySelector('.subtask-remove').addEventListener('click', e => {
        e.stopPropagation();
        const all = JSON.parse(card.dataset.subtasks || '[]').filter(s => s.id !== subtask.id);
        card.dataset.subtasks = JSON.stringify(all);
        renderSubtasks(card);
        updateSubtaskCount(card);
        apiPut(`/api/tasks/${taskId}`, getCardPayload(card));
      });
      list.appendChild(item);
    });
  }

  function updateSubtaskCount(card) {
    const badgesEl = card.querySelector('.task-badges');
    const existing = badgesEl.querySelector('.subtask-count');
    if (existing) existing.remove();
    const subtasks = JSON.parse(card.dataset.subtasks || '[]');
    if (subtasks.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'subtask-count';
      badge.textContent = `${subtasks.filter(s => s.done).length}/${subtasks.length}`;
      badgesEl.insertBefore(badge, badgesEl.querySelector('.task-age'));
    }
  }

  function getNextDueDate(currentDueDate, recurrence) {
    const base = currentDueDate ? new Date(currentDueDate + 'T00:00:00') : new Date();
    if (recurrence === 'daily') base.setDate(base.getDate() + 1);
    else if (recurrence === 'weekly') base.setDate(base.getDate() + 7);
    else if (recurrence === 'monthly') base.setMonth(base.getMonth() + 1);
    else if (recurrence.startsWith('after:')) {
      const days = parseInt(recurrence.split(':')[1], 10);
      const now = new Date(); now.setDate(now.getDate() + days);
      return now.toISOString().split('T')[0];
    }
    return base.toISOString().split('T')[0];
  }

  function spawnRecurringTask(card) {
    const nextDue = getNextDueDate(card.dataset.dueDate, card.dataset.recurrence);
    const text = card.querySelector('.task-text').textContent;
    apiPost('/api/tasks', {
      text, stage: 'backlog', due_date: nextDue,
      priority: card.dataset.priority || 'none',
      recurrence: card.dataset.recurrence,
      category_id: card.dataset.categoryId ? Number(card.dataset.categoryId) : null,
      ...boardBody(),
    }).then(newTask => { createTaskCard(newTask); updateCounts(); });
  }

  /* ── Archive ── */
  let viewingArchived = false;

  async function loadArchivedCount() {
    try {
      const sep = boardParam() ? '&' : '?';
      const { count } = await fetch('/api/tasks/count' + boardParam() + sep + 'archived=true').then(r => r.json());
      document.getElementById('nav-count-archived').textContent = count;
    } catch(e) {}
  }

  async function viewArchived() {
    closeSidebarMobile();
    viewingArchived = true;
    document.getElementById('nav-all').classList.remove('active');
    document.getElementById('nav-today').classList.remove('active');
    document.getElementById('nav-archived').classList.add('active');
    document.querySelector('.board-scroll').style.display = 'none';
    document.querySelector('.tk-quick-add').style.display = 'none';
    const archivedView = document.getElementById('archived-view');
    archivedView.classList.add('active');

    const list = document.getElementById('archived-list');
    list.innerHTML = '<div class="archived-empty">Loading…</div>';
    const sep = boardParam() ? '&' : '?';
    const tasks = await (await fetch('/api/tasks' + boardParam() + sep + 'archived=true')).json();

    if (!tasks.length) {
      list.innerHTML = '<div class="archived-empty">No archived tasks yet.</div>';
      return;
    }
    list.innerHTML = tasks.map(t => `
      <div class="archived-item">
        <div class="archived-info">
          <div class="archived-text">${escapeHtml(t.text)}</div>
          <div class="archived-meta">Was ${(t.stage||'').replace('_',' ')} · archived ${t.archived_at ? new Date(t.archived_at).toLocaleDateString('en',{month:'short',day:'numeric'}) : ''}</div>
        </div>
        <button class="restore-btn" data-action="restoreTask" data-args="[${t.id}]">Restore</button>
      </div>
    `).join('');
  }

  async function restoreTask(id) {
    const btn = this;
    btn.textContent = '…';
    btn.disabled = true;
    await apiPut(`/api/tasks/${id}`, { archived: false, ...boardBody() });
    btn.closest('.archived-item').remove();
    loadArchivedCount();
    const list = document.getElementById('archived-list');
    if (!list.querySelector('.archived-item')) {
      list.innerHTML = '<div class="archived-empty">No archived tasks yet.</div>';
    }
  }

  function exitArchivedView() {
    if (!viewingArchived) return;
    viewingArchived = false;
    document.getElementById('nav-archived').classList.remove('active');
    document.querySelector('.board-scroll').style.display = '';
    document.querySelector('.tk-quick-add').style.display = '';
    document.getElementById('archived-view').classList.remove('active');
  }

  /* ── Pull to refresh ── */
  (function() {
    const indicator = document.getElementById('ptr-indicator');
    let startY = 0, pulling = false, triggered = false;
    const THRESHOLD = 70;

    document.addEventListener('touchstart', e => {
      if (window.scrollY === 0 && !document.querySelector('.task-card.dragging')) {
        startY = e.touches[0].clientY;
        pulling = true;
        triggered = false;
      }
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 10) {
        indicator.classList.add('visible');
        const rotate = Math.min(dy / THRESHOLD, 1) * 180;
        indicator.querySelector('svg').style.transform = `rotate(${rotate}deg)`;
        if (dy >= THRESHOLD && !triggered) triggered = true;
      }
    }, { passive: true });

    document.addEventListener('touchend', async () => {
      if (!pulling) return;
      pulling = false;
      if (triggered) {
        indicator.classList.add('spinning');
        await loadAll();
        setTimeout(() => { indicator.classList.remove('visible', 'spinning'); }, 400);
      } else {
        indicator.classList.remove('visible');
      }
    });
  })();

  async function loadAll() {
    document.querySelectorAll('.task-card').forEach(c => c.remove());
    STAGES.forEach(s => {
      const empty = getList(s).querySelector('.col-empty');
      if (empty) empty.style.display = 'block';
    });
    [myBoards, memberships, boardMembers] = await Promise.all([
      fetch('/api/boards').then(r => r.json()),
      fetch('/api/boards/memberships').then(r => r.json()),
      fetch('/api/boards/members' + boardParam()).then(r => r.json()),
    ]);
    renderBoardMenu();
    renderSidebarBoards();
    categories = await (await fetch('/api/categories' + boardParam())).json();
    renderFilterBar();
    const tasks = await (await fetch('/api/tasks' + boardParam())).json();
    tasks.forEach(t => createTaskCard(t));
    updateCounts();
    loadArchivedCount();
  }

  /* ── Dashboard ── */
  let viewingDashboard = false;

  function exitDashboardView() {
    if (!viewingDashboard) return;
    viewingDashboard = false;
    document.getElementById('nav-dashboard').classList.remove('active');
    document.querySelector('.board-scroll').style.display = '';
    document.querySelector('.tk-quick-add').style.display = '';
    document.getElementById('dashboard-view').classList.remove('active');
  }

  async function viewDashboard() {
    closeSidebarMobile();
    exitArchivedView();
    viewingDashboard = true;
    document.getElementById('nav-all').classList.remove('active');
    document.getElementById('nav-today').classList.remove('active');
    document.getElementById('nav-archived').classList.remove('active');
    document.getElementById('nav-dashboard').classList.add('active');
    document.querySelector('.board-scroll').style.display = 'none';
    document.querySelector('.tk-quick-add').style.display = 'none';
    document.getElementById('dashboard-view').classList.add('active');
    await renderDashboard();
  }

  async function renderDashboard() {
    const data = await (await fetch('/api/dashboard')).json();
    const s = data.stats || {};
    const statsEl = document.getElementById('dash-stats');
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-label">Open tasks</div><div class="stat-value">${s.open || 0}</div></div>
      <div class="stat-card in-progress"><div class="stat-label">In Progress</div><div class="stat-value">${s.in_progress || 0}</div></div>
      <div class="stat-card overdue"><div class="stat-label">Overdue</div><div class="stat-value">${s.overdue || 0}</div></div>
      <div class="stat-card done"><div class="stat-label">Completed this week</div><div class="stat-value">${s.completed_week || 0}</div></div>
    `;

    // Build 7-day trend
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const found = (data.trend || []).find(t => t.day && t.day.startsWith(key));
      days.push({ label: d.toLocaleDateString('en', { weekday: 'short' }), count: found ? Number(found.count) : 0, key });
    }
    const maxCount = Math.max(...days.map(d => d.count), 1);
    const trendHtml = days.map(d => `
      <div class="trend-bar-wrap">
        <div class="trend-count">${d.count || ''}</div>
        <div class="trend-bar ${d.count === 0 ? 'empty' : ''}" style="height:${Math.round((d.count / maxCount) * 70) + 10}px"></div>
        <div class="trend-day">${d.label}</div>
      </div>`).join('');

    // Priority breakdown
    const priorityColors = { high: '#EF4444', medium: '#F59E0B', low: '#3B82F6', none: '#94A3B8' };
    const priorityOrder = ['high', 'medium', 'low', 'none'];
    const priorities = data.priorities || [];
    const maxP = Math.max(...priorities.map(p => Number(p.count)), 1);
    const priorityHtml = priorityOrder.map(p => {
      const row = priorities.find(x => x.priority === p);
      const count = row ? Number(row.count) : 0;
      return `<div class="breakdown-row">
        <span class="breakdown-label">${p}</span>
        <div class="breakdown-track"><div class="breakdown-fill" style="width:${Math.round((count/maxP)*100)}%;background:${priorityColors[p]}"></div></div>
        <span class="breakdown-count">${count}</span>
      </div>`;
    }).join('');

    // Category breakdown
    const cats = data.categories || [];
    const maxC = Math.max(...cats.map(c => Number(c.count)), 1);
    const catsHtml = cats.length ? cats.map(c => `
      <div class="breakdown-row">
        <span class="breakdown-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
        <div class="breakdown-track"><div class="breakdown-fill" style="width:${Math.round((Number(c.count)/maxC)*100)}%;background:${safeColor(c.color)}"></div></div>
        <span class="breakdown-count">${c.count}</span>
      </div>`).join('') : '<div class="dash-empty">No categories yet</div>';

    document.getElementById('dash-panels').innerHTML = `
      <div class="dash-panel">
        <div class="dash-panel-title">Completed — last 7 days</div>
        <div class="trend-bars">${trendHtml}</div>
      </div>
      <div class="dash-panel">
        <div class="dash-panel-title">Open by priority</div>
        ${priorities.length ? priorityHtml : '<div class="dash-empty">No open tasks</div>'}
      </div>
      <div class="dash-panel" style="grid-column: 1 / -1;">
        <div class="dash-panel-title">Open by category</div>
        ${catsHtml}
      </div>
    `;
  }

  /* ── Global search ── */
  let searchActive = 0; // index of active result

  function openSearch() {
    document.getElementById('search-overlay').classList.add('open');
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    searchActive = -1;
    setTimeout(() => document.getElementById('search-input').focus(), 50);
  }

  function closeSearch() {
    document.getElementById('search-overlay').classList.remove('open');
  }

  const doSearch = debounce(async () => {
    const q = document.getElementById('search-input').value.trim();
    const resultsEl = document.getElementById('search-results');
    if (q.length < 2) { resultsEl.innerHTML = ''; searchActive = -1; return; }
    const results = await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json();
    searchActive = -1;
    if (!results.length) { resultsEl.innerHTML = '<div class="search-empty">No tasks found</div>'; return; }
    resultsEl.innerHTML = results.map((r, i) => `
      <div class="search-result" data-idx="${i}" data-board-id="${r.board_id}" data-board-name="${escapeHtml(r.board_name)}" data-board-owner="${r.board_owner_id}" data-task-id="${r.id}">
        <div class="search-result-info">
          <div class="search-result-text">${escapeHtml(r.text)}</div>
          <div class="search-result-meta">${escapeHtml(r.board_name)}${r.cat_name ? ' · <span style="color:' + safeColor(r.cat_color) + '">' + escapeHtml(r.cat_name) + '</span>' : ''}${r.due_date ? ' · ' + escapeHtml(r.due_date) : ''}</div>
        </div>
        <span class="search-result-stage ${r.stage}">${r.stage.replace('_', ' ')}</span>
      </div>`).join('');
    resultsEl.querySelectorAll('.search-result').forEach(row => {
      row.addEventListener('click', () => navigateToTask(row));
    });
  }, 280);

  async function navigateToTask(row) {
    const boardId = Number(row.dataset.boardId);
    const boardName = row.dataset.boardName;
    const boardOwner = Number(row.dataset.boardOwner);
    const taskId = Number(row.dataset.taskId);
    closeSearch();
    exitDashboardView();
    exitArchivedView();
    if (!currentBoard || currentBoard.id !== boardId) {
      await switchBoard({ id: boardId, name: boardName, ownerId: boardOwner });
    }
    setTimeout(() => {
      const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('search-highlight');
        setTimeout(() => card.classList.remove('search-highlight'), 2000);
      }
    }, 300);
  }

  document.getElementById('search-input').addEventListener('input', doSearch);
  document.getElementById('search-input').addEventListener('keydown', e => {
    const rows = [...document.querySelectorAll('.search-result')];
    if (e.key === 'ArrowDown') { e.preventDefault(); searchActive = Math.min(searchActive + 1, rows.length - 1); rows.forEach((r, i) => r.classList.toggle('active', i === searchActive)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); searchActive = Math.max(searchActive - 1, 0); rows.forEach((r, i) => r.classList.toggle('active', i === searchActive)); }
    else if (e.key === 'Enter' && searchActive >= 0) navigateToTask(rows[searchActive]);
    else if (e.key === 'Escape') closeSearch();
  });

  document.addEventListener('keydown', e => {
    const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !inField) {
      e.preventDefault();
      const input = document.getElementById('task-input');
      if (input) input.focus();
      return;
    }
    if (e.key === '?' && !inField) { e.preventDefault(); openHelpModal(); return; }
    if (e.key === 'Escape') {
      closeDatePicker();
      closeSearch(); closeHelpModal(); closeMembersModal(); closeCreateBoardModal(); closeBoardMenu(); closeAccountMenu();
    }
  });

  /* ── Help modal ── */
  function openHelpModal() { document.getElementById('help-modal').style.display = 'flex'; }
  function closeHelpModal() { document.getElementById('help-modal').style.display = 'none'; }

  /* ── Email digest ── */
  async function saveDigestFrequency(value) {
    await apiFetch('PUT', '/api/user/digest', { frequency: value });
  }
  function openDigestPicker() {
    const choice = prompt('Email digest: none / daily / weekly / fortnightly');
    if (!choice) return;
    const v = choice.trim().toLowerCase();
    if (!['none', 'daily', 'weekly', 'fortnightly'].includes(v)) { alert('Invalid option'); return; }
    saveDigestFrequency(v);
  }

  document.getElementById('new-cat-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveNewCategory(); });
  document.getElementById('task-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
  document.getElementById('invite-email').addEventListener('keydown', e => { if (e.key === 'Enter') inviteMember(); });
  document.getElementById('new-board-name').addEventListener('keydown', e => { if (e.key === 'Enter') createBoard(); });
  document.addEventListener('click', e => {
    if (!document.getElementById('board-switcher').contains(e.target)) closeBoardMenu();
    if (!document.getElementById('notif-btn').closest('.notif-wrap').contains(e.target)) {
      document.getElementById('notif-dropdown').style.display = 'none';
    }
    if (!document.getElementById('account-btn').closest('.account-wrap').contains(e.target)) {
      closeAccountMenu();
    }
    const overflow = document.getElementById('tk-overflow-menu');
    if (overflow && overflow.style.display === 'block' &&
        !overflow.contains(e.target) &&
        !e.target.closest('[data-action="openBoardOverflow"]')) {
      overflow.style.display = 'none';
    }
    const dp = document.getElementById('date-picker');
    if (dp && dp.style.display === 'block' && !dp.contains(e.target) && !e.target.closest('.date-trigger')) {
      closeDatePicker();
    }
  });

  function jumpToStage(stage) {
    if (!STAGES.includes(stage)) return;
    const col = document.querySelector(`.column[data-stage="${stage}"]`);
    if (col) col.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveStageTab(stage);
  }
  function setActiveStageTab(stage) {
    document.querySelectorAll('.mobile-stage-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.stage === stage);
    });
  }
  // While the user scrolls, keep the active tab in sync with whichever
  // column is closest to the top of the viewport.
  if ('IntersectionObserver' in window) {
    const tabs = document.getElementById('mobile-stage-tabs');
    if (tabs) {
      const io = new IntersectionObserver(entries => {
        const onScreen = entries.filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (onScreen) setActiveStageTab(onScreen.target.dataset.stage);
      }, { rootMargin: '-140px 0px -50% 0px' });
      STAGES.forEach(s => {
        const col = document.querySelector(`.column[data-stage="${s}"]`);
        if (col) io.observe(col);
      });
    }
  }

  /* ── Event delegation: replaces inline onclick handlers so CSP can ban inline JS ── */
  function openBoardOverflow() {
    const m = document.getElementById('tk-overflow-menu');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
  }
  async function renameCurrentBoard() {
    document.getElementById('tk-overflow-menu').style.display = 'none';
    const id = currentBoardId();
    if (!id) { alert('No board to rename.'); return; }
    const current = currentBoard ? currentBoard.name : 'My Board';
    const name = prompt('Rename board', current);
    if (!name || !name.trim()) return;
    await apiPut(`/api/boards/${id}`, { name: name.trim() });
    location.reload();
  }
  async function deleteCurrentBoard() {
    document.getElementById('tk-overflow-menu').style.display = 'none';
    if (!currentBoard) { alert('You can\'t delete your default board.'); return; }
    if (!confirm(`Delete board "${currentBoard.name}"? This cannot be undone.`)) return;
    await apiDelete(`/api/boards/${currentBoard.id}`);
    location.reload();
  }

  const __actions = {
    gotoTab,
    toggleSidebar, toggleBoardMenu, switchBoard, closeBoardMenu, openMembersModal,
    toggleTheme, toggleNotifications, toggleAccountMenu, closeAccountMenu,
    openSearch, openHelpModal, closeHelpModal,
    clearTodayFilter, setFilter, filterToday, viewDashboard, viewArchived,
    toggleNewCatForm, saveNewCategory, saveDigestFrequency, openDigestPicker, addTask, openImport, closeImport,
    importTasks, clearImport, closeSidebarMobile, closeSearch,
    openCreateBoardModal, closeCreateBoardModal, createBoard, closeMembersModal,
    inviteMember, removeMember, revokeInvite, copyInviteLink,
    deleteCategory, clearAssign, restoreTask, jumpToStage,
    setTodayFilter, toggleTaskDone, openQuickAdd, closeQuickAdd, submitQuickAdd,
    openBoardOverflow, renameCurrentBoard, deleteCurrentBoard,
    openMembersFromBoardMenu: () => { closeBoardMenu(); openMembersModal(); },
    closeBoardMenuAndCreateBoard: () => { closeBoardMenu(); openCreateBoardModal(); },
    clearTodayAndFilter: () => { clearTodayFilter(); setFilter(null); },
    closeAccountAndOpenSearch: () => { closeAccountMenu(); openSearch(); },
    closeAccountAndOpenHelp: () => { closeAccountMenu(); openHelpModal(); },
    openTaskSheet, closeTaskSheet, setSheetPriority, addSheetSub, toggleSheetSub, removeSheetSub,
    openDatePicker, clearDueDate, pickDate,
    dpPrev: () => dpNav(-1),
    dpNext: () => dpNav(1),
    dpToday: () => dpQuick('today'),
    dpTomorrow: () => dpQuick('tomorrow'),
    dpWeek: () => dpQuick('week'),
    dpClear: clearDueDate,
  };
  function __parseArgs(el) {
    if (!el.dataset.args) return [];
    try { return JSON.parse(el.dataset.args); } catch { return []; }
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const name = el.dataset.action;
    if (name === 'stop') { e.stopPropagation(); return; }
    if (name === 'noop') { e.preventDefault(); return; }
    const fn = __actions[name];
    if (!fn) { console.warn('No action registered for', name); return; }
    fn.call(el, ...__parseArgs(el), e);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-onchange]');
    if (!el) return;
    const fn = __actions[el.dataset.onchange];
    if (fn) fn.call(el, el.value, e);
  });

  init();
