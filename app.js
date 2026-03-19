/* =============================================
   Personal Planner — app.js
   All data persists to localStorage.
   ============================================= */

'use strict';

// ── Storage keys ──────────────────────────────
const STORE_TASKS      = 'planner_tasks';
const STORE_PROJECTS   = 'planner_projects';
const STORE_CATEGORIES = 'planner_categories';

// ── Colour palette for projects ───────────────
const PROJECT_COLORS = [
  '#6366f1','#ec4899','#14b8a6','#f59e0b',
  '#22c55e','#ef4444','#8b5cf6','#06b6d4',
  '#f97316','#64748b',
];

// ── Colour palette for category tags ──────────
// { bg, text, swatch } — bg/text used for tag chip; swatch for the picker circle
const CATEGORY_COLORS = [
  { bg: '#ede9fe', text: '#6d28d9', swatch: '#8b5cf6' },  // purple
  { bg: '#dbeafe', text: '#1d4ed8', swatch: '#3b82f6' },  // blue
  { bg: '#dcfce7', text: '#15803d', swatch: '#22c55e' },  // green
  { bg: '#fef9c3', text: '#a16207', swatch: '#f59e0b' },  // yellow
  { bg: '#fce7f3', text: '#be185d', swatch: '#ec4899' },  // pink
  { bg: '#f3f4f6', text: '#374151', swatch: '#6b7280' },  // gray
  { bg: '#fee2e2', text: '#b91c1c', swatch: '#ef4444' },  // red
  { bg: '#fff7ed', text: '#c2410c', swatch: '#f97316' },  // orange
  { bg: '#e0f2fe', text: '#0369a1', swatch: '#06b6d4' },  // cyan
];

// ══════════════════════════════════════════════
//   State
// ══════════════════════════════════════════════
let tasks      = [];
let projects   = [];
let categories = [];
let currentView = { type: 'today', id: null };  // type: today|week|dashboard|project|category

// editing state
let editingTaskId        = null;
let editingProjectId     = null;
let editingCategoryId    = null;
let modalSubtasks        = [];
let selectedProjColor    = PROJECT_COLORS[0];
let selectedCatColorIdx  = 0;
let selectedProjCatId    = null;   // categoryId chosen in project modal

// ══════════════════════════════════════════════
//   Persistence
// ══════════════════════════════════════════════
function loadData() {
  try {
    tasks      = JSON.parse(localStorage.getItem(STORE_TASKS))      || [];
    projects   = JSON.parse(localStorage.getItem(STORE_PROJECTS))   || [];
    categories = JSON.parse(localStorage.getItem(STORE_CATEGORIES)) || [];
  } catch(e) {
    tasks = []; projects = []; categories = [];
  }
}

function saveData() {
  localStorage.setItem(STORE_TASKS,      JSON.stringify(tasks));
  localStorage.setItem(STORE_PROJECTS,   JSON.stringify(projects));
  localStorage.setItem(STORE_CATEGORIES, JSON.stringify(categories));
}

// Seed default categories if the store is empty
function seedCategories() {
  if (categories.length) return;
  const defaults = [
    { name: 'Work',     colorIdx: 1 },
    { name: 'Personal', colorIdx: 0 },
    { name: 'Health',   colorIdx: 2 },
    { name: 'Finance',  colorIdx: 3 },
    { name: 'Learning', colorIdx: 4 },
    { name: 'Other',    colorIdx: 5 },
  ];
  categories = defaults.map(d => ({ id: uid(), name: d.name, colorIdx: d.colorIdx }));
  saveData();
}

// Migrate projects created before categoryId existed — assign to first category
function migrateProjects() {
  if (!categories.length || !projects.length) return;
  let changed = false;
  projects.forEach(p => {
    if (!p.categoryId) {
      p.categoryId = categories[0].id;
      changed = true;
    }
  });
  if (changed) saveData();
}

// ── Category colour helper ─────────────────────
function getCatColors(categoryName) {
  const cat = categories.find(c => c.name === categoryName);
  const idx = cat ? (cat.colorIdx ?? 5) : 5;
  return CATEGORY_COLORS[idx] || CATEGORY_COLORS[5];
}

// ══════════════════════════════════════════════
//   Helpers — dates
// ══════════════════════════════════════════════
/** Returns YYYY-MM-DD in local time (not UTC) */
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
/** Converts an ISO timestamp OR a YYYY-MM-DD string to a local YYYY-MM-DD string.
 *  Handles old data that stored completedAt as UTC ISO. */
function localDateOfISO(isoStr) {
  if (!isoStr) return null;
  // Already a date-only string — use directly (no UTC conversion needed)
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr;
  return localDateStr(new Date(isoStr));
}
function todayStr() {
  return localDateStr(new Date());
}
function weekEndStr() {
  // Sunday of the current week (Mon-Sun), i.e. weekStart + 6
  const d = new Date(weekStartStr() + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return localDateStr(d);
}
/** Returns the Monday of the current week (local date) */
function weekStartStr() {
  const d = new Date();
  const day = d.getDay() || 7;            // treat Sunday as 7
  d.setDate(d.getDate() - day + 1);
  return localDateStr(d);
}
function isToday(dateStr) { return dateStr === todayStr(); }
function isOverdue(dateStr) { return dateStr && dateStr < todayStr(); }
function isDueSoon(dateStr) {
  // due within next 2 days but not overdue
  if (!dateStr || dateStr < todayStr()) return false;
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return dateStr <= localDateStr(d);
}
function isThisWeek(dateStr) {
  return dateStr && dateStr >= todayStr() && dateStr <= weekEndStr();
}
/** Format 'YYYY-MM-DD' → 'Mon, Jan 1' */
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}

// ══════════════════════════════════════════════
//   Helpers — IDs
// ══════════════════════════════════════════════
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ══════════════════════════════════════════════
//   Sidebar rendering
// ══════════════════════════════════════════════
function renderSidebar() {
  // Badges
  const todayCount = tasks.filter(t => !t.completed && isToday(t.dueDate)).length;
  const weekCount  = tasks.filter(t => !t.completed && isThisWeek(t.dueDate)).length;
  document.getElementById('badge-today').textContent = todayCount || '';
  document.getElementById('badge-week').textContent  = weekCount  || '';

  // Categories + nested projects (hide archived)
  const catNav = document.getElementById('categories-nav');
  catNav.innerHTML = '';
  categories.filter(c => !c.archived).forEach(cat => {
    const colors     = getCatColors(cat.name);
    const catProjects = projects.filter(p => p.categoryId === cat.id && !p.archived);
    const isCatActive = currentView.type === 'category' && currentView.id === cat.name;

    // ── Category row ──
    const catRow = document.createElement('div');
    catRow.className = 'cat-nav-item' + (isCatActive ? ' active' : '');

    const catMain = document.createElement('button');
    catMain.className = 'cat-nav-main';
    catMain.innerHTML = `<span class="proj-dot" style="background:${colors.swatch}"></span><span class="item-label">${escHtml(cat.name)}</span>`;
    catMain.addEventListener('click', () => setView('category', cat.name));

    const catActions = document.createElement('div');
    catActions.className = 'item-actions';
    const catEditBtn = document.createElement('button');
    catEditBtn.className = 'item-action-btn';
    catEditBtn.title = 'Edit category';
    catEditBtn.innerHTML = '&#9998;';
    catEditBtn.addEventListener('click', e => { e.stopPropagation(); openCategoryModal(cat.id); });
    const catDelBtn = document.createElement('button');
    catDelBtn.className = 'item-action-btn del';
    catDelBtn.title = 'Delete category';
    catDelBtn.innerHTML = '&#x2715;';
    catDelBtn.addEventListener('click', e => { e.stopPropagation(); deleteCategory(cat.id); });
    catActions.appendChild(catEditBtn);
    catActions.appendChild(catDelBtn);
    catRow.appendChild(catMain);
    catRow.appendChild(catActions);
    catNav.appendChild(catRow);

    // ── Nested project rows ──
    catProjects.forEach(p => {
      const isProjActive = currentView.type === 'project' && currentView.id === p.id;
      const projRow = document.createElement('div');
      projRow.className = 'cat-proj-item' + (isProjActive ? ' active' : '');

      const projMain = document.createElement('button');
      projMain.className = 'cat-proj-main';
      projMain.innerHTML = `<span class="proj-dot" style="background:${p.color};width:7px;height:7px;"></span><span class="item-label">${escHtml(p.name)}</span>`;
      projMain.addEventListener('click', () => setView('project', p.id));

      const projActions = document.createElement('div');
      projActions.className = 'item-actions';
      const projEditBtn = document.createElement('button');
      projEditBtn.className = 'item-action-btn';
      projEditBtn.title = 'Edit project';
      projEditBtn.innerHTML = '&#9998;';
      projEditBtn.addEventListener('click', e => { e.stopPropagation(); openProjectModal(p.id); });
      const projDelBtn = document.createElement('button');
      projDelBtn.className = 'item-action-btn del';
      projDelBtn.title = 'Delete project';
      projDelBtn.innerHTML = '&#x2715;';
      projDelBtn.addEventListener('click', e => { e.stopPropagation(); deleteProject(p.id); });
      projActions.appendChild(projEditBtn);
      projActions.appendChild(projDelBtn);
      projRow.appendChild(projMain);
      projRow.appendChild(projActions);
      catNav.appendChild(projRow);
    });

    // ── Add project button under this category ──
    const addProjBtn = document.createElement('button');
    addProjBtn.className = 'cat-add-proj-btn';
    addProjBtn.innerHTML = '+ add project';
    addProjBtn.addEventListener('click', () => openProjectModal(null, cat.id));
    catNav.appendChild(addProjBtn);
  });

  // Highlight active main nav buttons
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === currentView.type);
  });
}

// ══════════════════════════════════════════════
//   View switching
// ══════════════════════════════════════════════
function setView(type, id = null) {
  currentView = { type, id };
  renderAll();
}

function renderAll() {
  renderSidebar();
  renderMainView();
}

function renderMainView() {
  const titleEl       = document.getElementById('view-title');
  const taskListView  = document.getElementById('task-list-view');
  const dashboardView = document.getElementById('dashboard-view');

  const isDash = currentView.type === 'dashboard';
  taskListView.classList.toggle('hidden', isDash);
  dashboardView.classList.toggle('hidden', !isDash);

  if (isDash) {
    titleEl.textContent = 'Dashboard';
    renderDashboard();
    return;
  }

  let filteredTasks = [];
  switch (currentView.type) {
    case 'today':
      titleEl.textContent = 'Today';
      filteredTasks = tasks.filter(t => isToday(t.dueDate));
      renderTaskGroups(filteredTasks, 'category');
      return;
    case 'week':
      titleEl.textContent = 'This Week';
      renderWeekCalendar();
      return;
    case 'archive':
      titleEl.textContent = 'Archive';
      renderArchive();
      return;
    case 'project': {
      const proj = projects.find(p => p.id === currentView.id);
      titleEl.textContent = proj ? proj.name : 'Project';
      filteredTasks = tasks.filter(t => t.projectId === currentView.id);
      break;
    }
    case 'category':
      titleEl.textContent = currentView.id;
      filteredTasks = tasks.filter(t => t.category === currentView.id);
      break;
  }

  renderTaskGroups(filteredTasks);
}

// ══════════════════════════════════════════════
//   Task list rendering
// ══════════════════════════════════════════════

/** Group an array of tasks by category, returning [{cat, tasks}] in category order */
function groupTasksByCategory(taskList) {
  const map = new Map();
  taskList.forEach(t => {
    const key = t.category || '__none__';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  });
  const result = [];
  categories.forEach(c => {
    if (map.has(c.name)) result.push({ cat: c, tasks: map.get(c.name) });
  });
  if (map.has('__none__')) result.push({ cat: null, tasks: map.get('__none__') });
  return result;
}

/** Group an array of tasks by projectId, returning [{proj, tasks}] in project order */
function groupTasksByProject(taskList) {
  const map = new Map();
  taskList.forEach(t => {
    const key = t.projectId || '__none__';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  });
  const result = [];
  projects.forEach(p => {
    if (map.has(p.id)) result.push({ proj: p, tasks: map.get(p.id) });
  });
  if (map.has('__none__')) result.push({ proj: null, tasks: map.get('__none__') });
  return result;
}

function renderTaskGroups(taskList, groupBy = 'project') {
  const container = document.getElementById('task-groups');
  const emptyMsg  = document.getElementById('empty-msg');
  container.innerHTML = '';

  if (taskList.length === 0) {
    emptyMsg.classList.remove('hidden');
    return;
  }
  emptyMsg.classList.add('hidden');

  if (groupBy === 'category') {
    groupTasksByCategory(taskList).forEach(({ cat, tasks: catTasks }) => {
      const section = document.createElement('div');
      section.className = 'task-project-section';

      const colors    = cat ? getCatColors(cat.name) : getCatColors(null);
      const swatchClr = cat ? (colors.swatch || colors.text) : 'var(--color-text-muted)';
      const label     = cat ? escHtml(cat.name) : 'Uncategorized';
      const header    = document.createElement('div');
      header.className = 'task-project-header';
      header.innerHTML = `
        <span class="proj-dot" style="background:${swatchClr}"></span>
        <span class="task-project-name" style="color:${swatchClr}">${label}</span>
        <span class="group-count">${catTasks.length}</span>
      `;
      section.appendChild(header);

      // Within each category, sub-group by project
      const projGroups = groupTasksByProject(catTasks);
      projGroups.forEach(({ proj, tasks: projTasks }, idx) => {
        const subHeader = document.createElement('div');
        subHeader.className = 'task-proj-subheader' + (idx === 0 ? ' first' : '');
        const projColor = proj ? proj.color : 'var(--color-text-muted)';
        const projLabel = proj ? escHtml(proj.name) : 'No Project';
        subHeader.innerHTML = `
          <span class="proj-dot" style="background:${projColor}"></span>
          <span style="color:${projColor}">${projLabel}</span>
          <span class="subgroup-count">${projTasks.length}</span>
        `;
        section.appendChild(subHeader);

        const pending   = projTasks.filter(t => !t.completed);
        const completed = projTasks.filter(t => t.completed);
        const wrap = document.createElement('div');
        wrap.className = 'task-proj-subgroup';
        [...pending, ...completed].forEach(t => wrap.appendChild(buildTaskCard(t)));
        section.appendChild(wrap);
      });

      container.appendChild(section);
    });
    return;
  }

  groupTasksByProject(taskList).forEach(({ proj, tasks: groupTasks }) => {
    const section = document.createElement('div');
    section.className = 'task-project-section';

    const dotColor  = proj ? proj.color : 'var(--color-text-muted)';
    const nameColor = proj ? proj.color : 'var(--color-text-muted)';
    const label     = proj ? escHtml(proj.name) : 'No Project';
    const header    = document.createElement('div');
    header.className = 'task-project-header';
    header.innerHTML = `
      <span class="proj-dot" style="background:${dotColor}"></span>
      <span class="task-project-name" style="color:${nameColor}">${label}</span>
      <span class="group-count">${groupTasks.length}</span>
    `;
    section.appendChild(header);

    const pending   = groupTasks.filter(t => !t.completed);
    const completed = groupTasks.filter(t => t.completed);
    [...pending, ...completed].forEach(t => section.appendChild(buildTaskCard(t)));
    container.appendChild(section);
  });
}

function buildTaskCard(task) {
  const card = document.createElement('div');

  const overdue = !task.completed && isOverdue(task.dueDate);
  const dueSoon = !task.completed && isDueSoon(task.dueDate);
  const today   = !task.completed && isToday(task.dueDate);

  let cardClass = 'task-card';
  if (task.completed) cardClass += ' completed';
  card.className = cardClass;

  const proj      = projects.find(p => p.id === task.projectId);
  const catColors = getCatColors(task.category);

  // Color-code: bg = category tint; left border = urgency or project color
  card.style.background  = catColors.bg;
  card.style.borderColor = catColors.bg;
  if (overdue) {
    card.style.borderLeftColor = '#ef4444';
    card.style.borderLeftWidth = '5px';
  } else if (proj) {
    card.style.borderLeftColor = proj.color;
    card.style.borderLeftWidth = '5px';
  } else if (dueSoon) {
    card.style.borderLeftColor = '#f59e0b';
    card.style.borderLeftWidth = '5px';
  }

  const sub     = task.subtasks || [];
  const subDone = sub.filter(s => s.completed).length;
  const subPct  = sub.length ? Math.round((subDone / sub.length) * 100) : null;

  // Info row: "Project · Category · Date"
  let infoHtml = '';
  if (proj) infoHtml += `<span style="font-weight:700;color:${proj.color};">${escHtml(proj.name)}</span><span class="card-info-sep">·</span>`;
  infoHtml += `<span style="color:${catColors.text};font-weight:600;">${escHtml(task.category)}</span>`;
  if (task.dueDate) {
    let cls = 'tag-due';
    let prefix = '';
    if (overdue)      { cls += ' overdue';  prefix = 'Overdue · '; }
    else if (today)   { cls += ' today';    prefix = 'Today · '; }
    else if (dueSoon) { cls += ' due-soon'; }
    infoHtml += `<span class="card-info-sep">·</span><span class="${cls}">${prefix}${fmtDate(task.dueDate)}</span>`;
  }

  let indicator = '';
  if (overdue)                indicator = `<span class="indicator overdue">Overdue</span>`;
  else if (dueSoon && !today) indicator = `<span class="indicator due-soon">Soon</span>`;
  if (task.priority)          indicator += `<span class="indicator priority" title="High priority">!</span>`;

  card.innerHTML = `
    <div class="task-check${task.completed ? ' checked' : ''}" data-id="${task.id}" role="checkbox" aria-checked="${task.completed}"></div>
    <div class="task-body">
      <div class="task-title" style="color:${catColors.text};">${escHtml(task.title)}</div>
      <div class="task-card-info">${infoHtml}</div>
      ${task.notes ? `<div class="notes-preview" style="color:${catColors.text};">${escHtml(task.notes)}</div>` : ''}
      ${sub.length ? `
        <div class="subtask-progress" style="color:${catColors.text};">${subDone}/${sub.length} subtasks
          <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${subPct}%"></div></div>
        </div>` : ''}
    </div>
    ${indicator}
  `;

  card.querySelector('.task-check').addEventListener('click', e => {
    e.stopPropagation();
    toggleComplete(task.id);
  });
  card.addEventListener('click', () => openTaskModal(task.id));

  return card;
}

// ══════════════════════════════════════════════
//   Week calendar view (day columns + drag-drop)
// ══════════════════════════════════════════════
function renderWeekCalendar() {
  const container = document.getElementById('task-groups');
  const emptyMsg  = document.getElementById('empty-msg');
  container.innerHTML = '';
  emptyMsg.classList.add('hidden');

  const monDate  = new Date(weekStartStr() + 'T00:00:00');
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const grid = document.createElement('div');
  grid.className = 'week-grid';

  for (let i = 0; i < 7; i++) {
    const d = new Date(monDate);
    d.setDate(d.getDate() + i);
    const dateStr      = localDateStr(d);
    const isCurrentDay = dateStr === todayStr();
    const monthDay     = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const col = document.createElement('div');
    col.className = 'week-day-col' + (isCurrentDay ? ' is-today' : '');
    col.innerHTML = `
      <div class="week-day-header">
        <span class="week-day-name">${dayNames[i]}</span>
        <span class="week-day-date">${monthDay}</span>
      </div>
      <div class="week-day-tasks" data-date="${dateStr}"></div>
    `;

    const tasksZone = col.querySelector('.week-day-tasks');
    const dayTasks  = tasks.filter(t => t.dueDate === dateStr);
    const dayGroups = groupTasksByProject(dayTasks);
    dayGroups.forEach(({ proj: grpProj, tasks: grpTasks }) => {
      // Project mini-header (only show when there are multiple project groups)
      if (dayGroups.length > 1) {
        const hdr = document.createElement('div');
        hdr.className = 'week-proj-mini-header';
        const dotColor  = grpProj ? grpProj.color : 'var(--color-text-muted)';
        const nameColor = grpProj ? grpProj.color : 'var(--color-text-muted)';
        hdr.innerHTML = `<span class="proj-dot" style="background:${dotColor}"></span><span style="color:${nameColor}">${grpProj ? escHtml(grpProj.name) : 'No Project'}</span>`;
        tasksZone.appendChild(hdr);
      }
      grpTasks.forEach(t => tasksZone.appendChild(buildWeekTaskCard(t)));
    });

    tasksZone.addEventListener('dragover', e => {
      e.preventDefault();
      tasksZone.classList.add('drag-over');
    });
    tasksZone.addEventListener('dragleave', e => {
      if (!tasksZone.contains(e.relatedTarget)) tasksZone.classList.remove('drag-over');
    });
    tasksZone.addEventListener('drop', e => {
      e.preventDefault();
      tasksZone.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const task   = tasks.find(t => t.id === taskId);
      if (task && task.dueDate !== dateStr) {
        task.dueDate = dateStr;
        saveData();
        renderWeekCalendar();
        renderSidebar();
      }
    });

    grid.appendChild(col);
  }

  // ── Older Incomplete Tasks bucket — appears ABOVE the week grid ──
  const weekStart  = weekStartStr();
  const weekEnd    = weekEndStr();
  const olderTasks = tasks.filter(t =>
    !t.completed && t.dueDate && t.dueDate < weekStart
  );
  if (olderTasks.length) {
    container.appendChild(buildOutOfWeekBucket('Older Incomplete Tasks', olderTasks, 'older'));
  }

  container.appendChild(grid);

  // ── Future Tasks bucket — below the week grid ──
  const futureTasks = tasks.filter(t =>
    !t.completed && t.dueDate && t.dueDate > weekEnd
  );
  if (futureTasks.length) {
    container.appendChild(buildOutOfWeekBucket('Future Tasks', futureTasks, 'future'));
  }
}

function buildOutOfWeekBucket(title, taskList, variant) {
  const section = document.createElement('div');
  section.className = `out-of-week-bucket out-of-week-bucket--${variant}`;

  const header = document.createElement('div');
  header.className = 'out-of-week-header';
  header.innerHTML = `<span class="out-of-week-title">${title}</span><span class="out-of-week-count">${taskList.length}</span>`;
  section.appendChild(header);

  const cardRow = document.createElement('div');
  cardRow.className = 'out-of-week-cards';

  const groups = groupTasksByProject(taskList);
  groups.forEach(({ proj: grpProj, tasks: grpTasks }) => {
    if (groups.length > 1) {
      const hdr = document.createElement('div');
      hdr.className = 'week-proj-mini-header';
      const dotColor = grpProj ? grpProj.color : 'var(--color-text-muted)';
      hdr.innerHTML = `<span class="proj-dot" style="background:${dotColor}"></span><span style="color:${dotColor}">${grpProj ? escHtml(grpProj.name) : 'No Project'}</span>`;
      cardRow.appendChild(hdr);
    }
    grpTasks.forEach(t => {
      const card = buildWeekTaskCard(t);
      // Show the due date on each card so user knows when it was/is due
      const dueLabel = document.createElement('div');
      dueLabel.style.cssText = 'font-size:10px;color:var(--color-text-muted);margin-top:3px;';
      dueLabel.textContent = fmtDate(t.dueDate);
      card.querySelector('.week-card-body')?.appendChild(dueLabel);
      cardRow.appendChild(card);
    });
  });

  section.appendChild(cardRow);
  return section;
}

function buildWeekTaskCard(task) {
  const card    = document.createElement('div');
  const overdue = !task.completed && isOverdue(task.dueDate);

  let cls = 'week-task-card';
  if (task.completed) cls += ' completed';
  card.className = cls;
  card.draggable = true;

  const proj      = projects.find(p => p.id === task.projectId);
  const catColors = getCatColors(task.category);

  // Color-code: bg = category tint, left border = urgency or project color
  card.style.background  = catColors.bg;
  card.style.borderColor = catColors.bg;
  if (overdue) {
    card.style.borderLeftColor = '#ef4444';
    card.style.borderLeftWidth = '5px';
  } else if (proj) {
    card.style.borderLeftColor = proj.color;
    card.style.borderLeftWidth = '5px';
  }

  const overdueHtml  = overdue ? `<div style="margin-top:4px;"><span style="font-size:10px;font-weight:700;color:#ef4444;">Overdue</span></div>` : '';
  const priorityHtml = task.priority ? `<span class="priority-bang" title="High priority">!</span>` : '';

  card.innerHTML = `
    <div class="task-check${task.completed ? ' checked' : ''}" data-id="${task.id}" role="checkbox" aria-checked="${task.completed}"></div>
    <div class="week-card-body">
      <div class="task-title" style="color:${catColors.text};">${escHtml(task.title)}</div>
      ${overdueHtml}
    </div>
    ${priorityHtml}
  `;

  card.querySelector('.task-check').addEventListener('click', e => {
    e.stopPropagation();
    toggleComplete(task.id);
  });
  card.addEventListener('click', () => openTaskModal(task.id));

  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => card.classList.add('dragging'), 0);
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  return card;
}

// ══════════════════════════════════════════════
//   Dashboard
// ══════════════════════════════════════════════
function renderDashboard() {
  const wkStart = weekStartStr();
  const wkEnd   = weekEndStr();

  const completedThisWeek = tasks.filter(t => {
    if (!t.completed || !t.completedAt) return false;
    const ds = localDateOfISO(t.completedAt);
    return ds >= wkStart && ds <= wkEnd;
  }).length;
  const pendingToday = tasks.filter(t => !t.completed && isToday(t.dueDate)).length;
  const overdueCnt   = tasks.filter(t => !t.completed && isOverdue(t.dueDate)).length;
  const totalOpen    = tasks.filter(t => !t.completed).length;

  document.getElementById('stat-completed-week').textContent = completedThisWeek;
  document.getElementById('stat-pending-today').textContent  = pendingToday;
  document.getElementById('stat-overdue').textContent        = overdueCnt;
  document.getElementById('stat-total-open').textContent     = totalOpen;

  // Project progress
  const progContainer = document.getElementById('project-progress');
  progContainer.innerHTML = '';
  if (projects.length === 0) {
    progContainer.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;">No projects yet.</p>';
  }
  projects.forEach(p => {
    const projTasks = tasks.filter(t => t.projectId === p.id);
    const done = projTasks.filter(t => t.completed).length;
    const pct  = projTasks.length ? Math.round((done / projTasks.length) * 100) : 0;
    const row  = document.createElement('div');
    row.className = 'proj-progress-row';
    row.innerHTML = `
      <div class="proj-progress-header">
        <span><span class="proj-dot" style="background:${p.color};width:9px;height:9px;display:inline-block;margin-right:6px;"></span>${escHtml(p.name)}</span>
        <span class="proj-pct">${done}/${projTasks.length} · ${pct}%</span>
      </div>
      <div class="proj-bar-wrap">
        <div class="proj-bar-fill" style="width:${pct}%;background:${p.color}"></div>
      </div>
    `;
    progContainer.appendChild(row);
  });

  // Weekly chart (Mon–Sun of current week)
  const chartContainer = document.getElementById('weekly-chart');
  chartContainer.innerHTML = '';
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const counts   = [];
  let maxCount   = 1;

  const monDate = new Date(weekStartStr() + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d  = new Date(monDate);
    d.setDate(d.getDate() + i);
    const ds  = localDateStr(d);
    const cnt = tasks.filter(t => t.completed && t.completedAt && localDateOfISO(t.completedAt) === ds).length;
    counts.push(cnt);
    if (cnt > maxCount) maxCount = cnt;
  }

  const row = document.createElement('div');
  row.className = 'weekly-chart-row';
  counts.forEach((cnt, i) => {
    const heightPct = Math.round((cnt / maxCount) * 100);
    const col = document.createElement('div');
    col.className = 'day-col';
    col.innerHTML = `
      <div class="day-bar-wrap">
        <div class="day-bar" style="height:${heightPct}%"></div>
      </div>
      <div class="day-name">${dayNames[i]}</div>
      <div class="day-count">${cnt || ''}</div>
    `;
    row.appendChild(col);
  });
  chartContainer.appendChild(row);
}

// ══════════════════════════════════════════════
//   Task CRUD
// ══════════════════════════════════════════════
function toggleComplete(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  task.completed   = !task.completed;
  task.completedAt = task.completed ? todayStr() : null;
  saveData();
  renderAll();
}

function deleteTask(taskId) {
  tasks = tasks.filter(t => t.id !== taskId);
  saveData();
}

// ══════════════════════════════════════════════
//   Task Modal
// ══════════════════════════════════════════════
function openTaskModal(taskId = null) {
  editingTaskId = taskId;
  const modal  = document.getElementById('task-modal');
  const title  = document.getElementById('modal-title');
  const delBtn = document.getElementById('delete-task-btn');

  populateProjectDropdown();
  populateCategoryDropdown();

  if (taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    title.textContent = 'Edit Task';
    document.getElementById('task-title').value    = task.title;
    document.getElementById('task-project').value  = task.projectId || '';
    document.getElementById('task-category').value = task.category  || (categories[0] ? categories[0].name : '');
    document.getElementById('task-due').value       = task.dueDate  || '';
    document.getElementById('task-notes').value       = task.notes    || '';
    document.getElementById('task-priority').checked  = task.priority || false;
    modalSubtasks = (task.subtasks || []).map(s => ({ ...s }));
    delBtn.classList.remove('hidden');
  } else {
    title.textContent = 'New Task';
    document.getElementById('task-title').value    = '';
    document.getElementById('task-project').value  = currentView.type === 'project'  ? (currentView.id || '') : '';
    document.getElementById('task-category').value = currentView.type === 'category' ? currentView.id : (categories[0] ? categories[0].name : '');
    document.getElementById('task-due').value       = currentView.type === 'today' ? todayStr() : '';
    document.getElementById('task-notes').value     = '';
    document.getElementById('task-priority').checked = false;
    modalSubtasks = [];
    delBtn.classList.add('hidden');
  }

  renderSubtaskList();
  modal.classList.remove('hidden');
  document.getElementById('task-title').focus();
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.add('hidden');
  editingTaskId = null;
  modalSubtasks = [];
}

function populateProjectDropdown() {
  const sel = document.getElementById('task-project');
  sel.innerHTML = '<option value="">— None —</option>';
  // Group projects under their category using optgroups (hide archived)
  categories.filter(c => !c.archived).forEach(cat => {
    const catProjects = projects.filter(p => p.categoryId === cat.id && !p.archived);
    if (!catProjects.length) return;
    const grp = document.createElement('optgroup');
    grp.label = cat.name;
    catProjects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  });
  // Uncategorized projects (hide archived)
  const uncatProjects = projects.filter(p => !p.categoryId && !p.archived);
  if (uncatProjects.length) {
    const grp = document.createElement('optgroup');
    grp.label = 'Uncategorized';
    uncatProjects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }
}

function populateCategoryDropdown() {
  const sel = document.getElementById('task-category');
  sel.innerHTML = '';
  categories.filter(c => !c.archived).forEach(cat => {
    const opt = document.createElement('option');
    opt.value       = cat.name;
    opt.textContent = cat.name;
    sel.appendChild(opt);
  });
}

function saveTaskFromModal() {
  const titleVal = document.getElementById('task-title').value.trim();
  if (!titleVal) {
    document.getElementById('task-title').focus();
    return;
  }

  const data = {
    title:     titleVal,
    projectId: document.getElementById('task-project').value || null,
    category:  document.getElementById('task-category').value,
    dueDate:   document.getElementById('task-due').value || null,
    notes:     document.getElementById('task-notes').value.trim(),
    subtasks:  modalSubtasks.map(s => ({ ...s })),
    priority:  document.getElementById('task-priority').checked,
  };

  if (editingTaskId) {
    const task = tasks.find(t => t.id === editingTaskId);
    if (task) Object.assign(task, data);
  } else {
    tasks.push({
      id: uid(),
      ...data,
      completed:   false,
      completedAt: null,
      createdAt:   new Date().toISOString(),
    });
  }

  saveData();
  closeTaskModal();
  renderAll();
}

// ── Subtask list in modal ─────────────────────
function renderSubtaskList() {
  const container = document.getElementById('subtask-list');
  container.innerHTML = '';
  modalSubtasks.forEach((sub, idx) => {
    const item = document.createElement('div');
    item.className = 'subtask-item';
    item.innerHTML = `
      <div class="subtask-check${sub.completed ? ' checked' : ''}" data-idx="${idx}"></div>
      <span class="subtask-label${sub.completed ? ' done' : ''}">${escHtml(sub.title)}</span>
      <button class="subtask-del" data-idx="${idx}" title="Remove">&#x2715;</button>
    `;
    item.querySelector('.subtask-check').addEventListener('click', () => {
      modalSubtasks[idx].completed = !modalSubtasks[idx].completed;
      renderSubtaskList();
    });
    item.querySelector('.subtask-del').addEventListener('click', () => {
      modalSubtasks.splice(idx, 1);
      renderSubtaskList();
    });
    container.appendChild(item);
  });
}

function addSubtask() {
  const input = document.getElementById('new-subtask-input');
  const val   = input.value.trim();
  if (!val) return;
  modalSubtasks.push({ id: uid(), title: val, completed: false });
  input.value = '';
  renderSubtaskList();
  input.focus();
}

// ══════════════════════════════════════════════
//   Project Modal (create + edit)
// ══════════════════════════════════════════════
function populateProjCategoryDropdown(selectedId) {
  const sel = document.getElementById('project-category-input');
  sel.innerHTML = '<option value="">— None —</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id; opt.textContent = cat.name;
    if (cat.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function openProjectModal(projectId = null, categoryId = null) {
  editingProjectId  = projectId;
  selectedProjCatId = categoryId;
  const titleEl    = document.getElementById('proj-modal-title');
  const delBtn     = document.getElementById('delete-project-btn');
  const archiveBtn = document.getElementById('archive-project-btn');

  if (projectId) {
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;
    titleEl.textContent = 'Edit Project';
    document.getElementById('project-name-input').value = proj.name;
    selectedProjColor = proj.color;
    selectedProjCatId = proj.categoryId || null;
    delBtn.classList.remove('hidden');
    archiveBtn.classList.remove('hidden');
    archiveBtn.textContent = proj.archived ? 'Restore' : 'Archive';
  } else {
    titleEl.textContent = 'New Project';
    document.getElementById('project-name-input').value = '';
    selectedProjColor = PROJECT_COLORS[0];
    delBtn.classList.add('hidden');
    archiveBtn.classList.add('hidden');
  }

  populateProjCategoryDropdown(selectedProjCatId);
  renderColorSwatches();
  document.getElementById('project-modal').classList.remove('hidden');
  document.getElementById('project-name-input').focus();
}

function closeProjectModal() {
  document.getElementById('project-modal').classList.add('hidden');
  editingProjectId = null;
}

function renderColorSwatches() {
  const wrap = document.getElementById('color-swatches');
  wrap.innerHTML = '';
  PROJECT_COLORS.forEach(color => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (color === selectedProjColor ? ' selected' : '');
    sw.style.background = color;
    sw.title = color;
    sw.addEventListener('click', () => { selectedProjColor = color; renderColorSwatches(); });
    wrap.appendChild(sw);
  });
}

function saveProject() {
  const name       = document.getElementById('project-name-input').value.trim();
  const categoryId = document.getElementById('project-category-input').value || null;
  if (!name) { document.getElementById('project-name-input').focus(); return; }

  if (editingProjectId) {
    const proj = projects.find(p => p.id === editingProjectId);
    if (proj) { proj.name = name; proj.color = selectedProjColor; proj.categoryId = categoryId; }
  } else {
    projects.push({ id: uid(), name, color: selectedProjColor, categoryId, createdAt: new Date().toISOString() });
  }

  saveData();
  closeProjectModal();
  renderAll();
}

function deleteProject(projectId) {
  if (!confirm('Delete this project? Tasks will be unassigned.')) return;
  tasks.forEach(t => { if (t.projectId === projectId) t.projectId = null; });
  projects = projects.filter(p => p.id !== projectId);
  if (currentView.type === 'project' && currentView.id === projectId) {
    currentView = { type: 'today', id: null };
  }
  saveData();
  closeProjectModal();
  renderAll();
}

// ══════════════════════════════════════════════
//   Category Modal (create + edit)
// ══════════════════════════════════════════════
function openCategoryModal(categoryId = null) {
  editingCategoryId = categoryId;
  const titleEl    = document.getElementById('cat-modal-title');
  const delBtn     = document.getElementById('delete-category-btn');
  const archiveBtn = document.getElementById('archive-category-btn');

  if (categoryId) {
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) return;
    titleEl.textContent = 'Edit Category';
    document.getElementById('category-name-input').value = cat.name;
    selectedCatColorIdx = cat.colorIdx ?? 0;
    delBtn.classList.remove('hidden');
    archiveBtn.classList.remove('hidden');
    archiveBtn.textContent = cat.archived ? 'Restore' : 'Archive';
  } else {
    titleEl.textContent = 'New Category';
    document.getElementById('category-name-input').value = '';
    selectedCatColorIdx = 0;
    delBtn.classList.add('hidden');
    archiveBtn.classList.add('hidden');
  }

  renderCategoryColorSwatches();
  document.getElementById('category-modal').classList.remove('hidden');
  document.getElementById('category-name-input').focus();
}

function closeCategoryModal() {
  document.getElementById('category-modal').classList.add('hidden');
  editingCategoryId = null;
}

function renderCategoryColorSwatches() {
  const wrap = document.getElementById('category-color-swatches');
  wrap.innerHTML = '';
  CATEGORY_COLORS.forEach((col, idx) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (idx === selectedCatColorIdx ? ' selected' : '');
    sw.style.background = col.swatch;
    sw.title = col.swatch;
    sw.addEventListener('click', () => { selectedCatColorIdx = idx; renderCategoryColorSwatches(); });
    wrap.appendChild(sw);
  });
}

function saveCategory() {
  const name = document.getElementById('category-name-input').value.trim();
  if (!name) { document.getElementById('category-name-input').focus(); return; }

  if (editingCategoryId) {
    const cat = categories.find(c => c.id === editingCategoryId);
    if (cat) {
      const oldName = cat.name;
      cat.name     = name;
      cat.colorIdx = selectedCatColorIdx;
      // Rename tasks and update view if needed
      if (oldName !== name) {
        tasks.forEach(t => { if (t.category === oldName) t.category = name; });
        if (currentView.type === 'category' && currentView.id === oldName) {
          currentView.id = name;
        }
      }
    }
  } else {
    categories.push({ id: uid(), name, colorIdx: selectedCatColorIdx });
  }

  saveData();
  closeCategoryModal();
  renderAll();
}

function deleteCategory(categoryId) {
  if (categories.length <= 1) {
    alert('You must keep at least one category.');
    return;
  }
  const cat = categories.find(c => c.id === categoryId);
  if (!cat) return;
  const fallback = categories.find(c => c.id !== categoryId).name;
  const projCount = projects.filter(p => p.categoryId === categoryId).length;
  const msg = projCount
    ? `Delete "${cat.name}"? Tasks will be moved to "${fallback}" and ${projCount} project(s) will become uncategorized.`
    : `Delete "${cat.name}"? Tasks will be moved to "${fallback}".`;
  if (!confirm(msg)) return;

  tasks.forEach(t => { if (t.category === cat.name) t.category = fallback; });
  projects.forEach(p => { if (p.categoryId === categoryId) p.categoryId = null; });
  categories = categories.filter(c => c.id !== categoryId);
  if (currentView.type === 'category' && currentView.id === cat.name) {
    currentView = { type: 'today', id: null };
  }
  saveData();
  closeCategoryModal();
  renderAll();
}

// ══════════════════════════════════════════════
//   Archive
// ══════════════════════════════════════════════
function archiveProject(projectId) {
  const proj = projects.find(p => p.id === projectId);
  if (!proj) return;
  proj.archived = !proj.archived;
  if (proj.archived && currentView.type === 'project' && currentView.id === projectId) {
    currentView = { type: 'today', id: null };
  }
  saveData();
  closeProjectModal();
  renderAll();
}

function archiveCategory(categoryId) {
  const cat = categories.find(c => c.id === categoryId);
  if (!cat) return;
  cat.archived = !cat.archived;
  if (cat.archived && currentView.type === 'category' && currentView.id === cat.name) {
    currentView = { type: 'today', id: null };
  }
  saveData();
  closeCategoryModal();
  renderAll();
}

function renderArchive() {
  const container = document.getElementById('task-groups');
  const emptyMsg  = document.getElementById('empty-msg');
  container.innerHTML = '';
  emptyMsg.classList.add('hidden');

  const completedTasks      = tasks.filter(t => t.completed);
  const archivedProjects    = projects.filter(p => p.archived);
  const archivedCategories  = categories.filter(c => c.archived);

  if (!completedTasks.length && !archivedProjects.length && !archivedCategories.length) {
    emptyMsg.textContent = 'Nothing archived yet.';
    emptyMsg.classList.remove('hidden');
    return;
  }

  // ── Section: Completed Tasks ──
  if (completedTasks.length) {
    container.appendChild(_archiveHeading(`Completed Tasks`, completedTasks.length));

    groupTasksByCategory(completedTasks).forEach(({ cat, tasks: catTasks }) => {
      const section   = document.createElement('div');
      section.className = 'task-project-section';
      const colors    = cat ? getCatColors(cat.name) : getCatColors(null);
      const swatch    = cat ? (colors.swatch || colors.text) : 'var(--color-text-muted)';
      const header    = document.createElement('div');
      header.className = 'task-project-header';
      header.innerHTML = `
        <span class="proj-dot" style="background:${swatch}"></span>
        <span class="task-project-name" style="color:${swatch}">${cat ? escHtml(cat.name) : 'Uncategorized'}</span>
        <span class="group-count">${catTasks.length}</span>
      `;
      section.appendChild(header);

      groupTasksByProject(catTasks).forEach(({ proj, tasks: projTasks }, idx) => {
        const sub = document.createElement('div');
        sub.className = 'task-proj-subheader' + (idx === 0 ? ' first' : '');
        const pc = proj ? proj.color : 'var(--color-text-muted)';
        sub.innerHTML = `
          <span class="proj-dot" style="background:${pc}"></span>
          <span style="color:${pc}">${proj ? escHtml(proj.name) : 'No Project'}</span>
          <span class="subgroup-count">${projTasks.length}</span>
        `;
        section.appendChild(sub);
        const wrap = document.createElement('div');
        wrap.className = 'task-proj-subgroup';
        projTasks.forEach(t => wrap.appendChild(buildTaskCard(t)));
        section.appendChild(wrap);
      });
      container.appendChild(section);
    });
  }

  // ── Section: Archived Projects ──
  if (archivedProjects.length) {
    container.appendChild(_archiveHeading('Archived Projects'));
    archivedProjects.forEach(proj => {
      const projTasks = tasks.filter(t => t.projectId === proj.id);
      container.appendChild(_archivedItemBlock(
        proj.color, proj.name, projTasks,
        () => archiveProject(proj.id)
      ));
    });
  }

  // ── Section: Archived Categories ──
  if (archivedCategories.length) {
    container.appendChild(_archiveHeading('Archived Categories'));
    archivedCategories.forEach(cat => {
      const catTasks = tasks.filter(t => t.category === cat.name);
      const colors   = getCatColors(cat.name);
      container.appendChild(_archivedItemBlock(
        colors.swatch || colors.text, cat.name, catTasks,
        () => archiveCategory(cat.id)
      ));
    });
  }
}

function _archiveHeading(label, count) {
  const h = document.createElement('h3');
  h.className = 'archive-section-heading';
  h.innerHTML = escHtml(label) + (count != null ? ` <span class="archive-heading-count">${count}</span>` : '');
  return h;
}

function _archivedItemBlock(color, name, itemTasks, onRestore) {
  const section = document.createElement('div');
  section.className = 'task-project-section archive-item-section';

  const header = document.createElement('div');
  header.className = 'task-project-header';

  const dot = document.createElement('span');
  dot.className = 'proj-dot';
  dot.style.background = color;

  const label = document.createElement('span');
  label.className = 'task-project-name';
  label.style.color = color;
  label.textContent = name;

  const count = document.createElement('span');
  count.className = 'group-count';
  count.textContent = `${itemTasks.length} task${itemTasks.length !== 1 ? 's' : ''}`;

  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'restore-btn';
  restoreBtn.textContent = 'Restore';
  restoreBtn.addEventListener('click', onRestore);

  header.appendChild(dot);
  header.appendChild(label);
  header.appendChild(count);
  header.appendChild(restoreBtn);
  section.appendChild(header);

  if (itemTasks.length) {
    const wrap = document.createElement('div');
    wrap.className = 'task-proj-subgroup';
    itemTasks.forEach(t => wrap.appendChild(buildTaskCard(t)));
    section.appendChild(wrap);
  }
  return section;
}

// ══════════════════════════════════════════════
//   Alerts / Reminders
// ══════════════════════════════════════════════
function checkReminders() {
  const overdueTasks = tasks.filter(t => !t.completed && isOverdue(t.dueDate));
  const dueSoonTasks = tasks.filter(t => !t.completed && isDueSoon(t.dueDate) && !isToday(t.dueDate));
  const alertBar  = document.getElementById('alert-bar');
  const alertText = document.getElementById('alert-text');

  if (overdueTasks.length || dueSoonTasks.length) {
    const parts = [];
    if (overdueTasks.length) parts.push(`${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`);
    if (dueSoonTasks.length) parts.push(`${dueSoonTasks.length} due soon`);
    alertText.textContent = '⚠ ' + parts.join(' · ');
    alertBar.classList.remove('hidden');

    if (!sessionStorage.getItem('notified') && Notification.permission === 'granted') {
      new Notification('Planner Reminder', {
        body: parts.join(', '),
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="28" font-size="28">✓</text></svg>',
      });
      sessionStorage.setItem('notified', '1');
    } else if (!sessionStorage.getItem('notified') && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } else {
    alertBar.classList.add('hidden');
  }
}

// ══════════════════════════════════════════════
//   Utility
// ══════════════════════════════════════════════
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════
//   Demo / seed data (only if empty)
// ══════════════════════════════════════════════
function seedDemoData() {
  if (tasks.length || projects.length) return;

  const catWork     = categories.find(c => c.name === 'Work');
  const catPersonal = categories.find(c => c.name === 'Personal');
  const p1 = { id: uid(), name: 'Work',     color: '#6366f1', categoryId: catWork     ? catWork.id     : null, createdAt: new Date().toISOString() };
  const p2 = { id: uid(), name: 'Personal', color: '#22c55e', categoryId: catPersonal ? catPersonal.id : null, createdAt: new Date().toISOString() };
  projects.push(p1, p2);

  const today        = todayStr();
  const yesterday    = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = localDateStr(yesterday);
  const tomorrow     = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr  = localDateStr(tomorrow);
  const in3          = new Date(); in3.setDate(in3.getDate() + 3);
  const in3Str       = localDateStr(in3);

  tasks.push(
    {
      id: uid(), title: 'Review Q2 roadmap', projectId: p1.id, category: 'Work',
      dueDate: today, notes: 'Sync with product team first.', completed: false, completedAt: null,
      createdAt: new Date().toISOString(),
      subtasks: [
        { id: uid(), title: 'Read existing docs', completed: true },
        { id: uid(), title: 'Add new milestones', completed: false },
      ],
    },
    {
      id: uid(), title: 'Send weekly status update', projectId: p1.id, category: 'Work',
      dueDate: today, notes: '', completed: false, completedAt: null,
      createdAt: new Date().toISOString(), subtasks: [],
    },
    {
      id: uid(), title: 'Pay electricity bill', projectId: p2.id, category: 'Finance',
      dueDate: yesterdayStr, notes: 'Online portal or auto-pay', completed: false, completedAt: null,
      createdAt: new Date().toISOString(), subtasks: [],
    },
    {
      id: uid(), title: 'Gym session', projectId: p2.id, category: 'Health',
      dueDate: today, notes: 'Leg day', completed: true,
      completedAt: today,
      createdAt: new Date().toISOString(), subtasks: [],
    },
    {
      id: uid(), title: 'Read "Deep Work" chapter 3', projectId: null, category: 'Learning',
      dueDate: tomorrowStr, notes: '', completed: false, completedAt: null,
      createdAt: new Date().toISOString(), subtasks: [],
    },
    {
      id: uid(), title: 'Grocery shopping', projectId: p2.id, category: 'Personal',
      dueDate: in3Str, notes: 'Milk, eggs, bread, veggies', completed: false, completedAt: null,
      createdAt: new Date().toISOString(),
      subtasks: [
        { id: uid(), title: 'Make list', completed: true },
        { id: uid(), title: 'Go to store', completed: false },
      ],
    },
  );

  saveData();
}

// ══════════════════════════════════════════════
//   Event wiring
// ══════════════════════════════════════════════
function wireEvents() {
  // Main nav buttons
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  // New task
  document.getElementById('new-task-btn').addEventListener('click', () => openTaskModal());

  // Task modal
  document.getElementById('modal-close-btn').addEventListener('click',  closeTaskModal);
  document.getElementById('cancel-modal-btn').addEventListener('click', closeTaskModal);
  document.getElementById('save-task-btn').addEventListener('click',    saveTaskFromModal);
  document.getElementById('delete-task-btn').addEventListener('click', () => {
    if (editingTaskId) { deleteTask(editingTaskId); closeTaskModal(); renderAll(); }
  });
  // Auto-sync category when a project is chosen
  document.getElementById('task-project').addEventListener('change', () => {
    const projId = document.getElementById('task-project').value;
    if (!projId) return;
    const proj = projects.find(p => p.id === projId);
    if (proj && proj.categoryId) {
      const cat = categories.find(c => c.id === proj.categoryId);
      if (cat) document.getElementById('task-category').value = cat.name;
    }
  });

  // Subtasks
  document.getElementById('add-subtask-btn').addEventListener('click', addSubtask);
  document.getElementById('new-subtask-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addSubtask(); }
  });
  document.getElementById('task-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveTaskFromModal(); }
  });

  // Click outside overlay to close
  document.getElementById('task-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeTaskModal();
  });
  document.getElementById('project-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProjectModal();
  });
  document.getElementById('category-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCategoryModal();
  });

  // Project modal
  document.getElementById('proj-modal-close-btn').addEventListener('click', closeProjectModal);
  document.getElementById('cancel-project-btn').addEventListener('click', closeProjectModal);
  document.getElementById('save-project-btn').addEventListener('click', saveProject);
  document.getElementById('delete-project-btn').addEventListener('click', () => {
    if (editingProjectId) deleteProject(editingProjectId);
  });
  document.getElementById('archive-project-btn').addEventListener('click', () => {
    if (editingProjectId) archiveProject(editingProjectId);
  });
  document.getElementById('project-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveProject(); }
  });

  // Category modal
  document.getElementById('add-category-btn').addEventListener('click', () => openCategoryModal());
  document.getElementById('cat-modal-close-btn').addEventListener('click', closeCategoryModal);
  document.getElementById('cancel-category-btn').addEventListener('click', closeCategoryModal);
  document.getElementById('save-category-btn').addEventListener('click', saveCategory);
  document.getElementById('delete-category-btn').addEventListener('click', () => {
    if (editingCategoryId) deleteCategory(editingCategoryId);
  });
  document.getElementById('archive-category-btn').addEventListener('click', () => {
    if (editingCategoryId) archiveCategory(editingCategoryId);
  });
  document.getElementById('category-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveCategory(); }
  });

  // Alert bar close
  document.getElementById('alert-close').addEventListener('click', () => {
    document.getElementById('alert-bar').classList.add('hidden');
  });

  // Escape closes any open modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeTaskModal(); closeProjectModal(); closeCategoryModal(); }
  });
}

// ══════════════════════════════════════════════
//   Bootstrap
// ══════════════════════════════════════════════
function init() {
  loadData();
  seedCategories();
  migrateProjects();
  seedDemoData();
  wireEvents();
  renderAll();
  checkReminders();
  setInterval(checkReminders, 60_000);
}

document.addEventListener('DOMContentLoaded', init);
