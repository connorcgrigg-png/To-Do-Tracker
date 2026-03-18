/* =============================================
   Personal Planner — app.js
   All data persists to localStorage.
   ============================================= */

'use strict';

// ── Storage keys ──────────────────────────────
const STORE_TASKS    = 'planner_tasks';
const STORE_PROJECTS = 'planner_projects';

// ── Colour palette for projects ───────────────
const PROJECT_COLORS = [
  '#6366f1','#ec4899','#14b8a6','#f59e0b',
  '#22c55e','#ef4444','#8b5cf6','#06b6d4',
  '#f97316','#64748b',
];

// ── Categories ────────────────────────────────
const CATEGORIES = ['Work','Personal','Health','Finance','Learning','Other'];

// ══════════════════════════════════════════════
//   State
// ══════════════════════════════════════════════
let tasks    = [];
let projects = [];
let currentView = { type: 'today', id: null };  // type: today|week|dashboard|project|category

// editing state for the task modal
let editingTaskId   = null;
let modalSubtasks   = [];   // working copy while modal is open
let selectedProjColor = PROJECT_COLORS[0];

// ══════════════════════════════════════════════
//   Persistence
// ══════════════════════════════════════════════
function loadData() {
  try {
    tasks    = JSON.parse(localStorage.getItem(STORE_TASKS))    || [];
    projects = JSON.parse(localStorage.getItem(STORE_PROJECTS)) || [];
  } catch(e) {
    tasks = []; projects = [];
  }
}
function saveData() {
  localStorage.setItem(STORE_TASKS,    JSON.stringify(tasks));
  localStorage.setItem(STORE_PROJECTS, JSON.stringify(projects));
}

// ══════════════════════════════════════════════
//   Helpers — dates
// ══════════════════════════════════════════════
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function weekEndStr() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}
/** Returns the Monday of the current week (ISO) */
function weekStartStr() {
  const d = new Date();
  const day = d.getDay() || 7;            // treat Sunday as 7
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}
function isToday(dateStr) { return dateStr === todayStr(); }
function isOverdue(dateStr) { return dateStr && dateStr < todayStr(); }
function isDueSoon(dateStr) {
  // due within next 2 days but not overdue
  if (!dateStr || dateStr < todayStr()) return false;
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return dateStr <= d.toISOString().slice(0, 10);
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

  // Projects list
  const projNav = document.getElementById('projects-nav');
  projNav.innerHTML = '';
  projects.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'proj-nav-item' + (currentView.type === 'project' && currentView.id === p.id ? ' active' : '');
    btn.dataset.id = p.id;
    btn.innerHTML = `<span class="proj-dot" style="background:${p.color}"></span>${escHtml(p.name)}`;
    btn.addEventListener('click', () => setView('project', p.id));
    projNav.appendChild(btn);
  });

  // Categories list
  const catNav = document.getElementById('categories-nav');
  catNav.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-nav-item' + (currentView.type === 'category' && currentView.id === cat ? ' active' : '');
    btn.textContent = cat;
    btn.addEventListener('click', () => setView('category', cat));
    catNav.appendChild(btn);
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
  const titleEl = document.getElementById('view-title');
  const taskListView   = document.getElementById('task-list-view');
  const dashboardView  = document.getElementById('dashboard-view');

  // Show/hide views
  const isDash = currentView.type === 'dashboard';
  taskListView.classList.toggle('hidden', isDash);
  dashboardView.classList.toggle('hidden', !isDash);

  if (isDash) {
    titleEl.textContent = 'Dashboard';
    renderDashboard();
    return;
  }

  // Task list views
  let filteredTasks = [];
  switch (currentView.type) {
    case 'today':
      titleEl.textContent = 'Today';
      filteredTasks = tasks.filter(t => isToday(t.dueDate));
      break;
    case 'week':
      titleEl.textContent = 'This Week';
      renderWeekCalendar();
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
function renderTaskGroups(taskList) {
  const container = document.getElementById('task-groups');
  const emptyMsg  = document.getElementById('empty-msg');
  container.innerHTML = '';

  const pending   = taskList.filter(t => !t.completed);
  const completed = taskList.filter(t => t.completed);

  if (taskList.length === 0) {
    emptyMsg.classList.remove('hidden');
    return;
  }
  emptyMsg.classList.add('hidden');

  if (pending.length) renderGroup(container, 'Pending', pending);
  if (completed.length) renderGroup(container, 'Completed', completed);
}

function renderGroup(container, label, list) {
  const group = document.createElement('div');
  group.className = 'task-group';
  group.innerHTML = `<div class="task-group-title">${escHtml(label)}<span class="group-count">${list.length}</span></div>`;
  list.forEach(t => group.appendChild(buildTaskCard(t)));
  container.appendChild(group);
}

function buildTaskCard(task) {
  const card = document.createElement('div');

  const overdue  = !task.completed && isOverdue(task.dueDate);
  const dueSoon  = !task.completed && isDueSoon(task.dueDate);
  const today    = !task.completed && isToday(task.dueDate);

  let cardClass = 'task-card';
  if (task.completed) cardClass += ' completed';
  else if (overdue)   cardClass += ' overdue';
  else if (dueSoon)   cardClass += ' due-soon';
  card.className = cardClass;

  // Subtask progress
  const sub = task.subtasks || [];
  const subDone = sub.filter(s => s.completed).length;
  const subPct  = sub.length ? Math.round((subDone / sub.length) * 100) : null;

  // Project dot
  const proj = projects.find(p => p.id === task.projectId);
  const projDot = proj ? `<span class="proj-dot" style="background:${proj.color};width:8px;height:8px;border-radius:50%;display:inline-block;"></span>` : '';

  // Date label
  let dateLabel = '';
  if (task.dueDate) {
    let cls = 'tag-due';
    let prefix = '';
    if (overdue)  { cls += ' overdue'; prefix = 'Overdue · '; }
    else if (today)    { cls += ' today';   prefix = 'Today · '; }
    else if (dueSoon)  { cls += ' due-soon'; }
    dateLabel = `<span class="${cls}">${prefix}${fmtDate(task.dueDate)}</span>`;
  }

  // Indicator badge
  let indicator = '';
  if (overdue)  indicator = `<span class="indicator overdue">Overdue</span>`;
  else if (dueSoon && !today) indicator = `<span class="indicator due-soon">Soon</span>`;

  card.innerHTML = `
    <div class="task-check${task.completed ? ' checked' : ''}" data-id="${task.id}" role="checkbox" aria-checked="${task.completed}"></div>
    <div class="task-body">
      <div class="task-title">${escHtml(task.title)}</div>
      <div class="task-meta">
        ${projDot}
        ${proj ? `<span style="font-size:11px;color:${proj.color};font-weight:600;">${escHtml(proj.name)}</span>` : ''}
        <span class="tag tag-cat ${escHtml(task.category)}">${escHtml(task.category)}</span>
        ${dateLabel}
      </div>
      ${task.notes ? `<div class="notes-preview">${escHtml(task.notes)}</div>` : ''}
      ${sub.length ? `
        <div class="subtask-progress">${subDone}/${sub.length} subtasks
          <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${subPct}%"></div></div>
        </div>` : ''}
    </div>
    ${indicator}
  `;

  // Toggle complete on checkbox click (stop propagation so card click doesn't fire)
  card.querySelector('.task-check').addEventListener('click', e => {
    e.stopPropagation();
    toggleComplete(task.id);
  });

  // Open edit modal on card click
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
    const dateStr = d.toISOString().slice(0, 10);
    const isCurrentDay = dateStr === todayStr();
    const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
    tasks.filter(t => t.dueDate === dateStr).forEach(t => {
      tasksZone.appendChild(buildWeekTaskCard(t));
    });

    tasksZone.addEventListener('dragover', e => {
      e.preventDefault();
      tasksZone.classList.add('drag-over');
    });
    tasksZone.addEventListener('dragleave', e => {
      // only remove if leaving the zone itself, not a child
      if (!tasksZone.contains(e.relatedTarget)) {
        tasksZone.classList.remove('drag-over');
      }
    });
    tasksZone.addEventListener('drop', e => {
      e.preventDefault();
      tasksZone.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const task = tasks.find(t => t.id === taskId);
      if (task && task.dueDate !== dateStr) {
        task.dueDate = dateStr;
        saveData();
        renderWeekCalendar();
        renderSidebar();
      }
    });

    grid.appendChild(col);
  }

  container.appendChild(grid);
}

function buildWeekTaskCard(task) {
  const card = document.createElement('div');
  const overdue = !task.completed && isOverdue(task.dueDate);
  const dueSoon = !task.completed && isDueSoon(task.dueDate);

  let cls = 'task-card week-task-card';
  if (task.completed) cls += ' completed';
  else if (overdue)   cls += ' overdue';
  else if (dueSoon)   cls += ' due-soon';
  card.className = cls;
  card.draggable = true;

  const proj = projects.find(p => p.id === task.projectId);
  const projDot = proj
    ? `<span class="proj-dot" style="background:${proj.color};width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0;"></span>`
    : '';

  card.innerHTML = `
    <div class="week-card-top">
      <div class="task-check${task.completed ? ' checked' : ''}" data-id="${task.id}" role="checkbox" aria-checked="${task.completed}"></div>
      <div class="task-title">${escHtml(task.title)}</div>
    </div>
    <div class="task-meta">
      ${projDot}
      ${proj ? `<span style="font-size:10px;color:${proj.color};font-weight:600;">${escHtml(proj.name)}</span>` : ''}
      <span class="tag tag-cat ${escHtml(task.category)}">${escHtml(task.category)}</span>
    </div>
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
  const today   = todayStr();
  const wkStart = weekStartStr();
  const wkEnd   = weekEndStr();

  // Stats
  const completedThisWeek = tasks.filter(t =>
    t.completed && t.completedAt && t.completedAt >= wkStart && t.completedAt <= wkEnd
  ).length;
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
        <span><span class="proj-dot" style="background:${p.color};width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px;"></span>${escHtml(p.name)}</span>
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
  const counts = [];
  let maxCount = 1;

  // Build dates for Mon-Sun of this week
  const monDate = new Date(weekStartStr() + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(monDate);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const cnt = tasks.filter(t => t.completed && t.completedAt && t.completedAt.slice(0,10) === ds).length;
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
  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : null;
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
  const modal   = document.getElementById('task-modal');
  const title   = document.getElementById('modal-title');
  const delBtn  = document.getElementById('delete-task-btn');

  // Populate project dropdown
  populateProjectDropdown();

  if (taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    title.textContent = 'Edit Task';
    document.getElementById('task-title').value    = task.title;
    document.getElementById('task-project').value  = task.projectId || '';
    document.getElementById('task-category').value = task.category || 'Work';
    document.getElementById('task-due').value       = task.dueDate || '';
    document.getElementById('task-notes').value     = task.notes || '';
    modalSubtasks = (task.subtasks || []).map(s => ({ ...s }));
    delBtn.classList.remove('hidden');
  } else {
    title.textContent = 'New Task';
    document.getElementById('task-title').value    = '';
    document.getElementById('task-project').value  = currentView.type === 'project' ? (currentView.id || '') : '';
    document.getElementById('task-category').value = currentView.type === 'category' ? currentView.id : 'Work';
    document.getElementById('task-due').value       = currentView.type === 'today' ? todayStr() : '';
    document.getElementById('task-notes').value     = '';
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
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
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
//   Project Modal
// ══════════════════════════════════════════════
function openProjectModal() {
  selectedProjColor = PROJECT_COLORS[0];
  document.getElementById('project-name-input').value = '';
  renderColorSwatches();
  document.getElementById('project-modal').classList.remove('hidden');
  document.getElementById('project-name-input').focus();
}
function closeProjectModal() {
  document.getElementById('project-modal').classList.add('hidden');
}
function renderColorSwatches() {
  const wrap = document.getElementById('color-swatches');
  wrap.innerHTML = '';
  PROJECT_COLORS.forEach(color => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (color === selectedProjColor ? ' selected' : '');
    sw.style.background = color;
    sw.title = color;
    sw.addEventListener('click', () => {
      selectedProjColor = color;
      renderColorSwatches();
    });
    wrap.appendChild(sw);
  });
}
function saveProject() {
  const name = document.getElementById('project-name-input').value.trim();
  if (!name) {
    document.getElementById('project-name-input').focus();
    return;
  }
  projects.push({ id: uid(), name, color: selectedProjColor, createdAt: new Date().toISOString() });
  saveData();
  closeProjectModal();
  renderAll();
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

    // Browser notification (if permitted) — only fires once per session
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

  const p1 = { id: uid(), name: 'Work', color: '#6366f1', createdAt: new Date().toISOString() };
  const p2 = { id: uid(), name: 'Personal', color: '#22c55e', createdAt: new Date().toISOString() };
  projects.push(p1, p2);

  const today = todayStr();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const in3 = new Date(); in3.setDate(in3.getDate() + 3);
  const in3Str = in3.toISOString().slice(0, 10);

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
      completedAt: new Date().toISOString(),
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
      createdAt: new Date().toISOString(), subtasks: [
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

  // Task modal close / cancel / save / delete
  document.getElementById('modal-close-btn').addEventListener('click',  closeTaskModal);
  document.getElementById('cancel-modal-btn').addEventListener('click', closeTaskModal);
  document.getElementById('save-task-btn').addEventListener('click',    saveTaskFromModal);
  document.getElementById('delete-task-btn').addEventListener('click', () => {
    if (editingTaskId) {
      deleteTask(editingTaskId);
      closeTaskModal();
      renderAll();
    }
  });

  // Subtasks
  document.getElementById('add-subtask-btn').addEventListener('click', addSubtask);
  document.getElementById('new-subtask-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addSubtask(); }
  });

  // Task modal — Enter in title saves
  document.getElementById('task-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveTaskFromModal(); }
  });

  // Click outside modal overlay to close
  document.getElementById('task-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeTaskModal();
  });
  document.getElementById('project-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProjectModal();
  });

  // Project modal
  document.getElementById('add-project-btn').addEventListener('click', openProjectModal);
  document.getElementById('proj-modal-close-btn').addEventListener('click', closeProjectModal);
  document.getElementById('cancel-project-btn').addEventListener('click', closeProjectModal);
  document.getElementById('save-project-btn').addEventListener('click', saveProject);
  document.getElementById('project-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveProject(); }
  });

  // Alert bar close
  document.getElementById('alert-close').addEventListener('click', () => {
    document.getElementById('alert-bar').classList.add('hidden');
  });

  // Keyboard: Escape closes any open modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeTaskModal();
      closeProjectModal();
    }
  });
}

// ══════════════════════════════════════════════
//   Bootstrap
// ══════════════════════════════════════════════
function init() {
  loadData();
  seedDemoData();
  wireEvents();
  renderAll();
  checkReminders();
  // Re-check reminders every minute
  setInterval(checkReminders, 60_000);
}

document.addEventListener('DOMContentLoaded', init);
