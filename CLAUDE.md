# Personal Planner App — Claude Preferences

## Project Overview
A browser-based personal planner web app built with vanilla HTML, CSS, and JavaScript. All data persists via `localStorage`.

## Architecture
- **Single-page app** — no build tools, no frameworks, no dependencies
- `index.html` — app structure and markup
- `style.css` — all styles (CSS custom properties for theming)
- `app.js` — all application logic (modular functions, no classes required)

## Data Model
```
Project { id, name, color, createdAt }
Task {
  id, title, projectId, category, dueDate, notes,
  completed, completedAt, createdAt,
  subtasks: [{ id, title, completed }]
}
```
Categories: Work, Personal, Health, Finance, Learning, Other

## Features & Requirements
- Tasks belong to a project/goal
- Each task: title, due date, category, notes, subtasks, completion state
- Views: Today, This Week, By Project, By Category
- Dashboard: weekly completion count, per-project progress bars
- Reminders: visual badges for overdue/due-soon tasks; browser Notification API alert on load for overdue items
- Data persists to `localStorage` — no backend needed

## Design Preferences
- Clean, minimal UI with a sidebar for navigation
- Color-coded projects and category badges
- Smooth transitions; no jarring reloads
- Responsive enough for desktop use
- CSS custom properties (`--color-*`) for easy theming

## Development Preferences
- Keep everything in vanilla JS (no TypeScript, no React)
- Prefer small, focused functions over large monolithic ones
- Comment non-obvious logic; skip obvious comments
- Git commits should be descriptive and atomic
- Do not add unnecessary files (no package.json, no bundlers)
