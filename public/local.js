  const STAGES = ['backlog','in_progress','done'];
  const STAGE_LABELS = { backlog:'Backlog', in_progress:'In Progress', done:'Done' };
  const COLOR_PALETTE = ['#4285F4','#34A853','#EA4335','#FBBC05','#8B5CF6','#F59E0B','#10B981','#EC4899'];
  const DEFAULT_CATEGORIES = [
    {name:'Household',color:'#34A853'},{name:'Financial',color:'#FBBC05'},
    {name:'Health',color:'#EA4335'},{name:'Learning',color:'#4285F4'},
    {name:'Travel',color:'#8B5CF6'},{name:'Development',color:'#10B981'},
  ];
  const STORE_KEY = 'tasks_app_local';

  let categories = [];
  let activeFilter = null;
  let todayFilter = false;
  let selectedColor = COLOR_PALETTE[0];
  let dragSrc = null, dragSrcStage = null, touchDragInProgress = false;
  let sidebarOpen = true;

  /* ── localStorage CRUD ── */
  function getStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {tasks:[],categories:[],seq:1}; }
    catch { return {tasks:[],categories:[],seq:1}; }
  }
  function setStore(s) { localStorage.setItem(STORE_KEY, JSON.stringify(s)); }
  function genId() { const s=getStore(); const id=s.seq||1; s.seq=id+1; setStore(s); return id; }
  function localGetTasks() { return getStore().tasks; }
  function localGetCategories() { return getStore().categories; }
  function localAddTask(t) { const s=getStore(); s.tasks.push(t); setStore(s); }
  function localUpdateTask(id, u) { const s=getStore(); const i=s.tasks.findIndex(t=>t.id===id); if(i>=0){s.tasks[i]={...s.tasks[i],...u};setStore(s);} }
  function localDeleteTask(id) { const s=getStore(); s.tasks=s.tasks.filter(t=>t.id!==id); setStore(s); }
  function localAddCategory(c) { const s=getStore(); s.categories.push(c); setStore(s); }
  function localDeleteCategory(id) { const s=getStore(); s.categories=s.categories.filter(c=>c.id!==id); s.tasks.forEach(t=>{if(t.category_id===id)t.category_id=null;}); setStore(s); }
  function localReorder(stage, ids) { const s=getStore(); ids.forEach((id,idx)=>{const t=s.tasks.find(t=>t.id===id);if(t)t.position=idx;}); setStore(s); }

  /* ── Theme ── */
  function initTheme() { const t=localStorage.getItem('theme')||'light'; document.documentElement.setAttribute('data-theme',t); updateThemeIcon(t); }
  function toggleTheme() { const c=document.documentElement.getAttribute('data-theme'); const n=c==='dark'?'light':'dark'; document.documentElement.setAttribute('data-theme',n); localStorage.setItem('theme',n); updateThemeIcon(n); }
  function updateThemeIcon(t) { const i=document.getElementById('theme-icon'); i.innerHTML = t==='dark' ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>' : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'; }

  /* ── Banner ── */
  function dismissBanner() { document.getElementById('local-banner').style.display='none'; sessionStorage.setItem('banner_dismissed','1'); }
  if (sessionStorage.getItem('banner_dismissed')) document.getElementById('local-banner').style.display='none';

  /* ── Sidebar ── */
  function toggleSidebar() {
    const s=document.getElementById('sidebar');
    if(window.innerWidth<=768){const v=s.classList.toggle('mobile-visible');document.getElementById('sidebar-overlay').classList.toggle('visible',v);}
    else{sidebarOpen=!sidebarOpen;s.classList.toggle('collapsed',!sidebarOpen);}
  }
  function closeSidebarMobile(){document.getElementById('sidebar').classList.remove('mobile-visible');document.getElementById('sidebar-overlay').classList.remove('visible');}

  /* ── Utils ── */
  function debounce(fn,d){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),d);};}
  function getList(stage){return document.getElementById('list-'+stage);}
  function getCategoryById(id){return categories.find(c=>c.id===Number(id));}
  function escapeHtml(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  function getCardPayload(card) {
    return {
      status: card.querySelector('textarea.status-area').value,
      cal_start: card.querySelector('.cal-start').value,
      cal_end: card.querySelector('.cal-end').value,
      category_id: card.dataset.categoryId ? Number(card.dataset.categoryId) : null,
      due_date: card.querySelector('.due-date-input').value,
      priority: card.dataset.priority||'none',
      recurrence: card.querySelector('.recurrence-sel').value,
      subtasks: JSON.parse(card.dataset.subtasks||'[]'),
    };
  }

  /* ── NL date parsing (client-side) ── */
  function parseNLDate(text) {
    const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const lower=text.toLowerCase();
    const today=new Date(); today.setHours(0,0,0,0);
    if(/\btoday\b/.test(lower)){return{date:today.toISOString().split('T')[0],text:text.replace(/\btoday\b/i,'').trim().replace(/\s+/g,' ')};}
    if(/\btomorrow\b/.test(lower)){const d=new Date(today);d.setDate(d.getDate()+1);return{date:d.toISOString().split('T')[0],text:text.replace(/\btomorrow\b/i,'').trim().replace(/\s+/g,' ')};}
    for(let i=0;i<days.length;i++){if(lower.includes(days[i])){const d=new Date(today);const diff=(i-d.getDay()+7)%7||7;d.setDate(d.getDate()+diff);const clean=text.replace(new RegExp(days[i],'i'),'').replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)?\b/i,'').trim().replace(/\s+/g,' ');return{date:d.toISOString().split('T')[0],text:clean||text};}}
    return{date:'',text};
  }

  /* ── Counts ── */
  function updateCounts() {
    STAGES.forEach(stage=>{
      const list=getList(stage);
      const visible=[...list.querySelectorAll('.task-card')].filter(c=>c.style.display!=='none').length;
      document.getElementById('count-'+stage).textContent=visible;
      const empty=list.querySelector('.col-empty');
      if(empty)empty.style.display=list.querySelectorAll('.task-card').length?'none':'block';
    });
    const today=new Date().toISOString().split('T')[0];
    document.getElementById('nav-count-today').textContent=[...document.querySelectorAll('.task-card')].filter(c=>c.dataset.dueDate===today).length;
    document.getElementById('nav-count-all').textContent=[...document.querySelectorAll('.task-card')].length;
  }

  function applyFilter() {
    const today=new Date().toISOString().split('T')[0];
    document.querySelectorAll('.task-card').forEach(card=>{
      if(todayFilter)card.style.display=card.dataset.dueDate===today?'':'none';
      else card.style.display=(!activeFilter||Number(card.dataset.categoryId)===activeFilter)?'':'none';
    });
    updateCounts();
  }

  function setFilter(catId) { activeFilter=catId; document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.id===(catId?String(catId):'all'))); applyFilter(); updateNavActive(); }
  function filterToday() { closeSidebarMobile(); todayFilter=true; activeFilter=null; applyFilter(); document.getElementById('nav-all').classList.remove('active'); document.getElementById('nav-today').classList.add('active'); document.querySelectorAll('#sidebar-categories .filter-btn').forEach(b=>b.classList.remove('active')); }
  function clearTodayFilter() { todayFilter=false; document.getElementById('nav-today').classList.remove('active'); document.getElementById('nav-all').classList.add('active'); }
  function updateNavActive() { document.getElementById('nav-all').classList.toggle('active',!todayFilter&&!activeFilter); document.getElementById('nav-today').classList.toggle('active',todayFilter); }

  function saveOrder(...stages) {
    const toSave=stages.length?stages:STAGES;
    toSave.forEach(stage=>{ const ids=[...getList(stage).querySelectorAll('.task-card')].map(c=>Number(c.dataset.taskId)); if(ids.length)localReorder(stage,ids); });
  }

  function daysOpen(createdAt) { const d=Math.floor((Date.now()-new Date(createdAt))/86400000); return d===0?'today':d===1?'1d':`${d}d`; }

  /* ── Categories ── */
  function renderFilterBar() {
    const el=document.getElementById('sidebar-categories'); el.innerHTML='';
    categories.forEach(cat=>{
      const btn=document.createElement('button');
      btn.className='sidebar-nav-item filter-btn'+(activeFilter===cat.id?' active':'');
      btn.dataset.id=String(cat.id);
      btn.innerHTML=`<span class="sidebar-dot" style="background:${cat.color}"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(cat.name)}</span><button class="sidebar-cat-remove" data-action="deleteCategory" data-args="[${cat.id}]">×</button>`;
      btn.addEventListener('click',e=>{ if(!e.target.classList.contains('sidebar-cat-remove')){clearTodayFilter();setFilter(activeFilter===cat.id?null:cat.id);} });
      el.appendChild(btn);
    });
  }

  function toggleNewCatForm() { const f=document.getElementById('new-cat-form'); f.classList.toggle('open'); if(f.classList.contains('open'))document.getElementById('new-cat-name').focus(); }

  function renderColorPalette() {
    const el=document.getElementById('color-palette'); el.innerHTML='';
    COLOR_PALETTE.forEach(color=>{
      const sw=document.createElement('div'); sw.className='color-swatch'+(color===selectedColor?' selected':''); sw.style.background=color;
      sw.addEventListener('click',()=>{ selectedColor=color; el.querySelector('.color-swatch.selected')?.classList.remove('selected'); sw.classList.add('selected'); });
      el.appendChild(sw);
    });
  }

  function saveNewCategory() {
    const name=document.getElementById('new-cat-name').value.trim(); if(!name)return;
    const cat={id:genId(),name,color:selectedColor};
    localAddCategory(cat); categories.push(cat); renderFilterBar();
    document.getElementById('new-cat-name').value=''; toggleNewCatForm();
    document.querySelectorAll('.cat-selector').forEach(sel=>renderCatSelector(sel,sel.closest('.task-card')));
  }

  function deleteCategory(e,catId) {
    e.stopPropagation(); if(!confirm('Delete this category?'))return;
    localDeleteCategory(catId); categories=categories.filter(c=>c.id!==catId);
    if(activeFilter===catId)setFilter(null); renderFilterBar();
    document.querySelectorAll(`.task-card[data-category-id="${catId}"]`).forEach(card=>{card.dataset.categoryId='';updateCardBadge(card);});
    document.querySelectorAll('.cat-selector').forEach(sel=>renderCatSelector(sel,sel.closest('.task-card')));
  }

  function renderCatSelector(selectorEl,card) {
    selectorEl.innerHTML='';
    const none=document.createElement('button'); none.className='cat-option none'+((!card.dataset.categoryId)?' selected':''); none.textContent='None';
    none.addEventListener('click',()=>assignCategory(card,null,selectorEl)); selectorEl.appendChild(none);
    categories.forEach(cat=>{
      const opt=document.createElement('button'); opt.className='cat-option'+(Number(card.dataset.categoryId)===cat.id?' selected':''); opt.style.background=cat.color; opt.textContent=cat.name;
      opt.addEventListener('click',()=>assignCategory(card,cat.id,selectorEl)); selectorEl.appendChild(opt);
    });
  }

  function assignCategory(card,catId,selectorEl) { card.dataset.categoryId=catId||''; updateCardBadge(card); renderCatSelector(selectorEl,card); localUpdateTask(Number(card.dataset.taskId),{category_id:catId||null}); applyFilter(); }

  function updateCardBadge(card) {
    const el=card.querySelector('.task-badges'); const cat=getCategoryById(card.dataset.categoryId);
    const ex=el.querySelector('.category-pill'); if(ex)ex.remove();
    if(cat){const p=document.createElement('span');p.className='category-pill';p.style.background=cat.color;p.textContent=cat.name;el.prepend(p);}
  }

  /* ── Due date helpers ── */
  function getDueBadgeClass(d){if(!d)return'';const t=new Date().toISOString().split('T')[0];return d<t?'overdue':d===t?'today':'soon';}
  function formatDueDate(dueDate){if(!dueDate)return'';const[y,m,d]=dueDate.split('-').map(Number);const date=new Date(y,m-1,d);const today=new Date();today.setHours(0,0,0,0);const diff=Math.round((date-today)/86400000);if(diff<0)return`${Math.abs(diff)}d overdue`;if(diff===0)return'Today';if(diff===1)return'Tomorrow';if(diff<7)return date.toLocaleDateString('en',{weekday:'short'});return date.toLocaleDateString('en',{month:'short',day:'numeric'});}
  function updateDueBadge(card){const el=card.querySelector('.task-badges');const ex=el.querySelector('.due-badge');if(ex)ex.remove();const d=card.dataset.dueDate;if(d){const b=document.createElement('span');b.className=`due-badge ${getDueBadgeClass(d)}`;b.textContent=formatDueDate(d);el.insertBefore(b,el.querySelector('.task-age'));}}
  function updatePriorityDot(card){const el=card.querySelector('.task-badges');const ex=el.querySelector('.priority-dot');if(ex)ex.remove();const p=card.dataset.priority;if(p&&p!=='none'){const d=document.createElement('span');d.className=`priority-dot ${p}`;el.prepend(d);}}

  /* ── Subtasks ── */
  function renderSubtasks(card) {
    const list=card.querySelector('.subtask-list'); const taskId=Number(card.dataset.taskId); list.innerHTML='';
    JSON.parse(card.dataset.subtasks||'[]').forEach(subtask=>{
      const item=document.createElement('div'); item.className='subtask-item';
      item.innerHTML=`<input type="checkbox" class="subtask-check" ${subtask.done?'checked':''}/><span class="${subtask.done?'done':''}">${escapeHtml(subtask.text)}</span><button class="subtask-remove">×</button>`;
      item.querySelector('.subtask-check').addEventListener('change',e=>{
        subtask.done=e.target.checked; item.querySelector('span').className=subtask.done?'done':'';
        const all=JSON.parse(card.dataset.subtasks||'[]'); const i=all.findIndex(s=>s.id===subtask.id); if(i>=0)all[i].done=subtask.done;
        card.dataset.subtasks=JSON.stringify(all); updateSubtaskCount(card); localUpdateTask(taskId,{subtasks:all});
      });
      item.querySelector('.subtask-remove').addEventListener('click',e=>{
        e.stopPropagation(); const all=JSON.parse(card.dataset.subtasks||'[]').filter(s=>s.id!==subtask.id);
        card.dataset.subtasks=JSON.stringify(all); renderSubtasks(card); updateSubtaskCount(card); localUpdateTask(taskId,{subtasks:all});
      });
      list.appendChild(item);
    });
  }

  function updateSubtaskCount(card) {
    const el=card.querySelector('.task-badges'); const ex=el.querySelector('.subtask-count'); if(ex)ex.remove();
    const st=JSON.parse(card.dataset.subtasks||'[]');
    if(st.length){const b=document.createElement('span');b.className='subtask-count';b.textContent=`${st.filter(s=>s.done).length}/${st.length}`;el.insertBefore(b,el.querySelector('.task-age'));}
  }

  /* ── Recurrence ── */
  function getNextDueDate(cur,rec){const b=cur?new Date(cur+'T00:00:00'):new Date();if(rec==='daily')b.setDate(b.getDate()+1);else if(rec==='weekly')b.setDate(b.getDate()+7);else if(rec==='monthly')b.setMonth(b.getMonth()+1);else if(rec.startsWith('after:')){const d=parseInt(rec.split(':')[1],10);const n=new Date();n.setDate(n.getDate()+d);return n.toISOString().split('T')[0];}return b.toISOString().split('T')[0];}
  function spawnRecurringTask(card){const nextDue=getNextDueDate(card.dataset.dueDate,card.dataset.recurrence);const text=card.querySelector('.task-text').textContent;const task={id:genId(),text,stage:'backlog',status:'',priority:card.dataset.priority||'none',due_date:nextDue,recurrence:card.dataset.recurrence,category_id:card.dataset.categoryId?Number(card.dataset.categoryId):null,subtasks:[],position:localGetTasks().length,created_at:new Date().toISOString()};localAddTask(task);createTaskCard(task);updateCounts();}

  /* ── Import ── */
  function toggleImport(){const p=document.getElementById('import-panel');const b=document.getElementById('import-toggle-btn');p.classList.toggle('open');b.classList.toggle('active',p.classList.contains('open'));}
  function clearImport(){document.getElementById('import-json').value='';document.getElementById('import-error').style.display='none';document.getElementById('import-success').style.display='none';}
  function importTasks(){
    const errEl=document.getElementById('import-error');const okEl=document.getElementById('import-success');errEl.style.display='none';okEl.style.display='none';
    let data;try{data=JSON.parse(document.getElementById('import-json').value.trim());}catch{errEl.textContent='Invalid JSON.';errEl.style.display='block';return;}
    if(!Array.isArray(data)||!data.length){errEl.textContent='Expected a non-empty JSON array.';errEl.style.display='block';return;}
    let count=0;
    data.forEach(item=>{
      if(!item.text)return;
      const task={id:genId(),text:item.text,stage:'backlog',status:item.status||'',priority:'none',due_date:'',recurrence:'',subtasks:[],category_id:null,position:localGetTasks().length,created_at:new Date().toISOString()};
      localAddTask(task);createTaskCard(task);count++;
    });
    updateCounts();okEl.textContent=`${count} task${count!==1?'s':''} imported.`;okEl.style.display='block';document.getElementById('import-json').value='';
  }

  /* ── Add task ── */
  function addTask(){
    const input=document.getElementById('task-input');const raw=input.value.trim();if(!raw)return;
    input.value='';
    const {date,text}=parseNLDate(raw);
    const task={id:genId(),text:text||raw,stage:'backlog',status:'',priority:'none',due_date:date,recurrence:'',subtasks:[],category_id:null,position:localGetTasks().length,created_at:new Date().toISOString()};
    localAddTask(task);createTaskCard(task);updateCounts();input.focus();
  }

  /* ── Task card ── */
  function createTaskCard(task) {
    const stage=task.stage||'backlog';const list=getList(stage);
    const empty=list.querySelector('.col-empty');if(empty)empty.style.display='none';
    const card=document.createElement('li');
    card.className='task-card';card.draggable=true;
    card.dataset.taskId=task.id;card.dataset.stage=stage;
    card.dataset.categoryId=task.category_id||'';card.dataset.priority=task.priority||'none';
    card.dataset.recurrence=task.recurrence||'';card.dataset.dueDate=task.due_date||'';
    card.dataset.subtasks=JSON.stringify(task.subtasks||[]);

    const stageIdx=STAGES.indexOf(stage);const prevStage=stageIdx>0?STAGES[stageIdx-1]:null;const nextStage=stageIdx<STAGES.length-1?STAGES[stageIdx+1]:null;

    card.innerHTML=`
      <div class="task-item">
        <div class="task-top">
          <div class="task-main">
            <div class="task-text">${escapeHtml(task.text)}</div>
            <div class="task-badges">
              ${task.priority&&task.priority!=='none'?`<span class="priority-dot ${task.priority}"></span>`:''}
              ${task.due_date?`<span class="due-badge ${getDueBadgeClass(task.due_date)}">${formatDueDate(task.due_date)}</span>`:''}
              ${(task.subtasks&&task.subtasks.length)?`<span class="subtask-count">${task.subtasks.filter(s=>s.done).length}/${task.subtasks.length}</span>`:''}
              <span class="task-age">${daysOpen(task.created_at)}</span>
            </div>
            <div class="task-meta"><span class="task-status-preview"></span></div>
          </div>
          <div class="card-actions">
            <button class="icon-btn delete" title="Delete"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
          </div>
        </div>
        <div class="stage-btns">
          ${prevStage?`<button class="stage-btn back" data-target="${prevStage}">← ${STAGE_LABELS[prevStage]}</button>`:''}
          ${nextStage?`<button class="stage-btn forward" data-target="${nextStage}">${STAGE_LABELS[nextStage]} →</button>`:''}
        </div>
      </div>
      <div class="status-panel">
        <label>Due date</label><input type="date" class="due-date-input" value="${task.due_date||''}" />
        <label>Priority</label>
        <div class="priority-selector">
          <button class="priority-opt none ${(!task.priority||task.priority==='none')?'selected':''}" data-value="none">None</button>
          <button class="priority-opt low ${task.priority==='low'?'selected':''}" data-value="low">Low</button>
          <button class="priority-opt medium ${task.priority==='medium'?'selected':''}" data-value="medium">Medium</button>
          <button class="priority-opt high ${task.priority==='high'?'selected':''}" data-value="high">High</button>
        </div>
        <label>Repeat</label>
        <select class="recurrence-sel">
          <option value="" ${!task.recurrence?'selected':''}>No repeat</option>
          <option value="daily" ${task.recurrence==='daily'?'selected':''}>Daily</option>
          <option value="weekly" ${task.recurrence==='weekly'?'selected':''}>Weekly</option>
          <option value="monthly" ${task.recurrence==='monthly'?'selected':''}>Monthly</option>
          <option value="after:3" ${task.recurrence==='after:3'?'selected':''}>3 days after done</option>
          <option value="after:7" ${task.recurrence==='after:7'?'selected':''}>7 days after done</option>
        </select>
        <label>Category</label>
        <div class="cat-selector"></div>
        <button class="add-cat-inline-btn" type="button">+ New category</button>
        <div class="inline-cat-form">
          <input type="text" class="inline-cat-name" placeholder="Category name…" maxlength="30"/>
          <div class="inline-cat-palette"></div>
          <div class="inline-cat-actions">
            <button type="button" class="btn-save-icat">Add</button>
            <button type="button" class="btn-cancel-icat">Cancel</button>
          </div>
        </div>
        <label>Notes</label>
        <textarea class="status-area" placeholder="Notes or status…" rows="2"></textarea>
        <label>Add to Google Calendar</label>
        <div class="cal-row">
          <div class="field"><label>Start</label><input type="datetime-local" class="cal-start"/></div>
          <div class="field"><label>End</label><input type="datetime-local" class="cal-end"/></div>
          <button type="button" class="open-cal-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5C3.9 4 3 4.9 3 6v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>Calendar</button>
        </div>
        <div class="panel-save-row"><button type="button" class="save-task-btn">Save</button></div>
      </div>`;

    const panel=card.querySelector('.status-panel');
    const deleteBtn=card.querySelector('.icon-btn.delete');
    const textarea=card.querySelector('textarea.status-area');
    const statusPreview=card.querySelector('.task-status-preview');
    const calStartEl=card.querySelector('.cal-start');
    const calEndEl=card.querySelector('.cal-end');
    const catSelector=card.querySelector('.cat-selector');

    textarea.value=task.status||'';calStartEl.value=task.cal_start||'';calEndEl.value=task.cal_end||'';
    renderCatSelector(catSelector,card);updateCardBadge(card);renderSubtasks(card);updateSubtaskCount(card);
    function updateStatusPreview(){statusPreview.textContent=textarea.value.trim()?'↳ '+textarea.value.trim().slice(0,60):'';}
    updateStatusPreview();

    const debouncedSave=debounce(()=>localUpdateTask(task.id,getCardPayload(card)),400);

    // Save button
    const saveBtn=card.querySelector('.save-task-btn');
    saveBtn.addEventListener('click',e=>{e.stopPropagation();localUpdateTask(task.id,getCardPayload(card));saveBtn.textContent='✓ Saved';saveBtn.classList.add('saved');setTimeout(()=>{saveBtn.textContent='Save';saveBtn.classList.remove('saved');},2000);});

    // Inline category
    const addCatBtn=card.querySelector('.add-cat-inline-btn');
    const inlineCatForm=card.querySelector('.inline-cat-form');
    const inlineCatName=card.querySelector('.inline-cat-name');
    const inlinePalette=card.querySelector('.inline-cat-palette');
    let inlineColor=COLOR_PALETTE[0];
    COLOR_PALETTE.forEach(color=>{const sw=document.createElement('div');sw.style.cssText=`width:16px;height:16px;border-radius:50%;background:${color};cursor:pointer;border:2px solid ${color===inlineColor?'var(--text)':'transparent'};flex-shrink:0;`;sw.addEventListener('click',e=>{e.stopPropagation();inlineColor=color;inlinePalette.querySelectorAll('div').forEach(s=>s.style.borderColor='transparent');sw.style.borderColor='var(--text)';});inlinePalette.appendChild(sw);});
    addCatBtn.addEventListener('click',e=>{e.stopPropagation();inlineCatForm.classList.toggle('open');if(inlineCatForm.classList.contains('open'))inlineCatName.focus();});
    card.querySelector('.btn-cancel-icat').addEventListener('click',e=>{e.stopPropagation();inlineCatForm.classList.remove('open');inlineCatName.value='';});
    card.querySelector('.btn-save-icat').addEventListener('click',e=>{e.stopPropagation();const name=inlineCatName.value.trim();if(!name)return;const cat={id:genId(),name,color:inlineColor};localAddCategory(cat);categories.push(cat);renderFilterBar();inlineCatName.value='';inlineCatForm.classList.remove('open');document.querySelectorAll('.cat-selector').forEach(sel=>renderCatSelector(sel,sel.closest('.task-card')));});
    inlineCatName.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();card.querySelector('.btn-save-icat').click();}e.stopPropagation();});

    // Due date, priority, recurrence
    const dueDateInput=card.querySelector('.due-date-input');
    dueDateInput.addEventListener('change',()=>{card.dataset.dueDate=dueDateInput.value;updateDueBadge(card);localUpdateTask(task.id,getCardPayload(card));});
    card.querySelector('.priority-selector').querySelectorAll('.priority-opt').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();card.querySelector('.priority-selector').querySelectorAll('.priority-opt').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');card.dataset.priority=btn.dataset.value;updatePriorityDot(card);localUpdateTask(task.id,getCardPayload(card));});});
    card.querySelector('.recurrence-sel').addEventListener('change',()=>localUpdateTask(task.id,getCardPayload(card)));

    textarea.addEventListener('input',()=>{updateStatusPreview();debouncedSave();});
    calStartEl.addEventListener('change',()=>localUpdateTask(task.id,getCardPayload(card)));
    calEndEl.addEventListener('change',()=>localUpdateTask(task.id,getCardPayload(card)));

    // Subtasks
    const subtaskInput=card.querySelector('.add-subtask-row input');
    if(subtaskInput){card.querySelector('.add-subtask-btn').addEventListener('click',e=>{e.stopPropagation();doAddSubtask();});subtaskInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doAddSubtask();}});function doAddSubtask(){const text=subtaskInput.value.trim();if(!text)return;const subs=JSON.parse(card.dataset.subtasks||'[]');const maxId=subs.length?Math.max(...subs.map(s=>s.id)):0;subs.push({id:maxId+1,text,done:false});card.dataset.subtasks=JSON.stringify(subs);subtaskInput.value='';renderSubtasks(card);updateSubtaskCount(card);localUpdateTask(task.id,{subtasks:subs});}}

    // Inline edit
    const taskTextEl=card.querySelector('.task-text');
    taskTextEl.addEventListener('click',e=>{e.stopPropagation();const input=document.createElement('input');input.className='task-text-input';input.value=taskTextEl.textContent;taskTextEl.replaceWith(input);input.focus();input.select();function saveText(){const nt=input.value.trim();if(nt&&nt!==taskTextEl.textContent){taskTextEl.textContent=nt;localUpdateTask(task.id,{text:nt});}input.replaceWith(taskTextEl);}input.addEventListener('blur',saveText);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveText();}if(e.key==='Escape'){input.replaceWith(taskTextEl);}});});

    card.querySelector('.task-item').addEventListener('click',()=>{if(touchDragInProgress)return;const open=panel.classList.toggle('open');if(open)textarea.focus();});

    deleteBtn.addEventListener('click',e=>{e.stopPropagation();card.classList.add('completing');card.addEventListener('transitionend',()=>{card.remove();updateCounts();localDeleteTask(task.id);},{once:true});});

    card.querySelectorAll('.stage-btn').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();moveToStage(card,task.id,btn.dataset.target);});});

    card.querySelector('.open-cal-btn').addEventListener('click',e=>{e.stopPropagation();const title=card.querySelector('.task-text').textContent;let url='https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(title);if(calStartEl.value)url+='&dates='+toGCalDate(calStartEl.value)+'/'+(calEndEl.value?toGCalDate(calEndEl.value):toGCalDate(calStartEl.value,60));window.open(url,'_blank');});

    panel.addEventListener('mousedown',e=>e.stopPropagation());
    if(activeFilter&&Number(card.dataset.categoryId)!==activeFilter)card.style.display='none';

    // Drag
    card.addEventListener('dragstart',e=>{dragSrc=card;dragSrcStage=card.dataset.stage;card.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
    card.addEventListener('dragover',e=>{e.preventDefault();if(card!==dragSrc)card.classList.add('drag-over');});
    card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
    card.addEventListener('drop',e=>{e.stopPropagation();if(card===dragSrc)return;card.classList.remove('drag-over');const targetList=card.closest('.task-list');const items=[...targetList.children];const ins=items.indexOf(dragSrc)<items.indexOf(card)?card.nextSibling:card;applyDrop(targetList,ins);});
    card.addEventListener('dragend',()=>{document.querySelectorAll('.task-card').forEach(c=>c.classList.remove('dragging','drag-over'));document.querySelectorAll('.task-list').forEach(l=>l.classList.remove('drag-over-col'));dragSrc=null;dragSrcStage=null;});

    setupTouchDrag(card);
    list.appendChild(card);
  }

  function toGCalDate(dt,add=0){const d=new Date(dt);d.setMinutes(d.getMinutes()+add);return d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';}

  function applyDrop(targetList,insertBefore){
    if(!dragSrc)return;const targetStage=targetList.closest('.column').dataset.stage;
    if(insertBefore)targetList.insertBefore(dragSrc,insertBefore);else targetList.appendChild(dragSrc);
    if(dragSrcStage!==targetStage){dragSrc.dataset.stage=targetStage;localUpdateTask(Number(dragSrc.dataset.taskId),{stage:targetStage});rebuildStageButtons(dragSrc,Number(dragSrc.dataset.taskId),targetStage);if(targetStage==='done'&&dragSrc.dataset.recurrence)spawnRecurringTask(dragSrc);saveOrder(dragSrcStage,targetStage);}else{saveOrder(targetStage);}
    updateCounts();
  }

  function moveToStage(card,taskId,newStage){const old=card.dataset.stage;card.dataset.stage=newStage;getList(newStage).appendChild(card);localUpdateTask(taskId,{stage:newStage});rebuildStageButtons(card,taskId,newStage);if(newStage==='done'&&card.dataset.recurrence)spawnRecurringTask(card);updateCounts();saveOrder(old,newStage);}

  function rebuildStageButtons(card,taskId,stage){const idx=STAGES.indexOf(stage);const prev=idx>0?STAGES[idx-1]:null;const next=idx<STAGES.length-1?STAGES[idx+1]:null;const sb=card.querySelector('.stage-btns');sb.innerHTML=`${prev?`<button class="stage-btn back" data-target="${prev}">← ${STAGE_LABELS[prev]}</button>`:''}${next?`<button class="stage-btn forward" data-target="${next}">${STAGE_LABELS[next]} →</button>`:''}`;sb.querySelectorAll('.stage-btn').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();moveToStage(card,taskId,btn.dataset.target);}));}

  function setupColumnDrop(){document.querySelectorAll('.task-list').forEach(l=>{l.addEventListener('dragover',e=>{e.preventDefault();l.classList.add('drag-over-col');});l.addEventListener('dragleave',()=>l.classList.remove('drag-over-col'));l.addEventListener('drop',e=>{e.stopPropagation();l.classList.remove('drag-over-col');applyDrop(l,null);});});}

  function setupTouchDrag(card) {
    let startTouch,dragActive=false,ghost=null,ghostOffsetX=0,ghostOffsetY=0,longPressTimer=null,rafId=null,lastX=0,lastY=0,autoScrollTimer=null;
    function activateDrag(touch){dragActive=true;touchDragInProgress=true;dragSrc=card;dragSrcStage=card.dataset.stage;if(navigator.vibrate)navigator.vibrate(40);const rect=card.getBoundingClientRect();ghostOffsetX=touch.clientX-rect.left;ghostOffsetY=touch.clientY-rect.top;ghost=card.cloneNode(true);const gp=ghost.querySelector('.status-panel');if(gp)gp.remove();Object.assign(ghost.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',pointerEvents:'none',zIndex:'9999',opacity:'0.96',transform:'scale(1.04) rotate(1.5deg)',boxShadow:'0 20px 60px rgba(0,0,0,0.28)',transition:'transform 0.15s',willChange:'left,top',borderColor:'var(--primary)'});document.body.appendChild(ghost);card.style.cssText+=';opacity:0.25;transform:scale(0.97);transition:opacity 0.2s,transform 0.2s;';}
    function moveGhost(x,y){if(!ghost)return;ghost.style.left=(x-ghostOffsetX)+'px';ghost.style.top=(y-ghostOffsetY)+'px';}
    function getDropTargets(x,y){ghost.style.visibility='hidden';const el=document.elementFromPoint(x,y);ghost.style.visibility='';return{overCard:el?.closest('.task-card'),overList:el?.closest('.task-list')};}
    function updateHighlight(x,y){document.querySelectorAll('.task-card').forEach(c=>c.classList.remove('drag-over'));document.querySelectorAll('.task-list').forEach(l=>l.classList.remove('drag-over-col'));const{overCard,overList}=getDropTargets(x,y);if(overCard&&overCard!==card)overCard.classList.add('drag-over');else if(overList)overList.classList.add('drag-over-col');}
    function tickAutoScroll(y){if(autoScrollTimer)clearInterval(autoScrollTimer);autoScrollTimer=setInterval(()=>{const z=90,sp=8,h=window.innerHeight;if(y<z)window.scrollBy(0,-sp);else if(y>h-z)window.scrollBy(0,sp);else{clearInterval(autoScrollTimer);autoScrollTimer=null;}},16);}
    function endDrag(x,y){clearTimeout(longPressTimer);if(rafId)cancelAnimationFrame(rafId);if(autoScrollTimer){clearInterval(autoScrollTimer);autoScrollTimer=null;}if(!dragActive)return;const{overCard,overList}=getDropTargets(x,y);ghost.remove();ghost=null;card.style.cssText=card.style.cssText.replace(/opacity:[^;]+;?/g,'').replace(/transform:[^;]+;?/g,'').replace(/transition:[^;]+;?/g,'');document.querySelectorAll('.task-card').forEach(c=>c.classList.remove('drag-over'));document.querySelectorAll('.task-list').forEach(l=>l.classList.remove('drag-over-col'));if(overCard&&overCard!==card){const list=overCard.closest('.task-list');const items=[...list.querySelectorAll('.task-card')];const before=items.indexOf(card)<items.indexOf(overCard)?overCard.nextSibling:overCard;applyDrop(list,before);}else if(overList){applyDrop(overList,null);}dragActive=false;dragSrc=null;dragSrcStage=null;setTimeout(()=>{touchDragInProgress=false;},60);}
    card.addEventListener('touchstart',e=>{if(e.touches.length>1)return;startTouch=e.touches[0];longPressTimer=setTimeout(()=>activateDrag(startTouch),320);},{passive:true});
    card.addEventListener('touchmove',e=>{const t=e.touches[0];lastX=t.clientX;lastY=t.clientY;if(!dragActive){const dx=Math.abs(t.clientX-startTouch.clientX);const dy=Math.abs(t.clientY-startTouch.clientY);if(dx>6||dy>6)clearTimeout(longPressTimer);return;}e.preventDefault();if(rafId)cancelAnimationFrame(rafId);rafId=requestAnimationFrame(()=>{moveGhost(lastX,lastY);updateHighlight(lastX,lastY);tickAutoScroll(lastY);});},{passive:false});
    card.addEventListener('touchend',e=>{const t=e.changedTouches[0];endDrag(t.clientX,t.clientY);});
    card.addEventListener('touchcancel',()=>endDrag(lastX,lastY));
  }

  /* ── Init ── */
  function init() {
    initTheme();
    const stored=localGetCategories();
    if(stored.length){categories=stored;}
    else{DEFAULT_CATEGORIES.forEach(c=>{const cat={id:genId(),...c};localAddCategory(cat);categories.push(cat);});}
    renderColorPalette();renderFilterBar();
    const tasks=localGetTasks().sort((a,b)=>(a.position||0)-(b.position||0));
    tasks.forEach(t=>createTaskCard(t));
    updateCounts();setupColumnDrop();
  }

  document.getElementById('new-cat-name').addEventListener('keydown',e=>{if(e.key==='Enter')saveNewCategory();});
  document.getElementById('task-input').addEventListener('keydown',e=>{if(e.key==='Enter')addTask();});

  const __actions = {
    dismissBanner, toggleSidebar, toggleTheme, clearTodayFilter, setFilter,
    filterToday, toggleNewCatForm, saveNewCategory, addTask, toggleImport,
    importTasks, clearImport, closeSidebarMobile, deleteCategory,
    clearTodayAndFilter: () => { clearTodayFilter(); setFilter(null); },
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = __actions[el.dataset.action];
    if (!fn) return;
    const args = el.dataset.args ? JSON.parse(el.dataset.args) : [];
    fn.call(el, ...args, e);
  });

  init();
